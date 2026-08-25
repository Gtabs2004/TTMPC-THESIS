import json
import os
import re
from datetime import datetime, timezone
from typing import Any
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

from dotenv import load_dotenv
from supabase import Client, create_client


ROOT_ENV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

# Base URL of the public-facing React frontend, used in outbound emails.
# Overridden per environment via .env — production sets it to the deployed
# origin so members receive working sign-in links instead of localhost:5173.
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")

APPLICATION_TABLE_CANDIDATES = ["membership_application", "member_applications"]
MEMBER_TABLE_CANDIDATES = ["member", "members"]


class MembershipConfirmationError(Exception):
	pass


def _resolve_member_table(supabase: Client) -> str:
	for table_name in MEMBER_TABLE_CANDIDATES:
		try:
			supabase.table(table_name).select("id").limit(1).execute()
			return table_name
		except Exception:
			continue

	raise MembershipConfirmationError(
		"Neither 'member' nor 'members' table is accessible in current schema."
	)


def _load_runtime_config() -> tuple[Client, str, str]:
	load_dotenv(ROOT_ENV_PATH, override=True)

	url = os.environ.get("VITE_SUPABASE_URL")
	service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY")
	anon_key = os.environ.get("VITE_SUPABASE_ANON_KEY")
	resend_api_key = os.environ.get("RESEND_API_KEY") or os.environ.get("VITE_RESEND_API_KEY")
	resend_from_email = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")

	if not url:
		raise MembershipConfirmationError("VITE_SUPABASE_URL is missing.")

	key_to_use = service_role_key or anon_key
	if not key_to_use:
		raise MembershipConfirmationError(
			"Supabase key is missing. Set VITE_SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY."
		)

	client = create_client(url, key_to_use)
	return client, resend_api_key or "", resend_from_email


def get_application_data_by_application_id(
	supabase: Client,
	application_id: str,
) -> tuple[dict[str, Any], str]:
	for application_table in APPLICATION_TABLE_CANDIDATES:
		try:
			response = (
				supabase.table(application_table)
				.select("*")
				.eq("application_id", application_id)
				.limit(1)
				.execute()
			)
		except Exception:
			continue

		if response.data:
			return response.data[0], application_table

	raise MembershipConfirmationError(
		f"Application {application_id} was not found."
	)


def generate_membership_id(supabase: Client) -> str:
	member_table = _resolve_member_table(supabase)
	member_response = (
		supabase.table(member_table)
		.select("membership_id")
		.order("created_at", desc=True)
		.limit(5000)
		.execute()
	)

	pds_response = None
	try:
		pds_response = (
			supabase.table("personal_data_sheet")
			.select("membership_number_id")
			.limit(5000)
			.execute()
		)
	except Exception:
		# Table may not exist in some deployments; member table remains the primary source.
		pds_response = None

	def _extract_membership_number(raw_membership_id: Any) -> int | None:
		membership_id = str(raw_membership_id or "").strip().upper()
		if not membership_id:
			return None

		match = re.match(r"^(?:TTMPC[-_]?M?[_-]?)(\d{1,9})$", membership_id)
		if not match:
			return None

		try:
			return int(match.group(1))
		except Exception:
			return None

	def _format_membership_id(number: int) -> str:
		# Requested style: TTMPC-000, auto-expands digits for larger numbers.
		width = max(3, len(str(number)))
		return f"TTMPC-{number:0{width}d}"

	max_existing_number = 0
	for row in (member_response.data or []):
		numeric_part = _extract_membership_number(row.get("membership_id"))
		if numeric_part is None:
			continue
		max_existing_number = max(max_existing_number, numeric_part)

	for row in ((pds_response.data or []) if pds_response else []):
		numeric_part = _extract_membership_number(row.get("membership_number_id"))
		if numeric_part is None:
			continue
		max_existing_number = max(max_existing_number, numeric_part)

	new_number = max_existing_number + 1

	if new_number > 999999999:
		raise MembershipConfirmationError("Membership ID sequence exceeded supported digits.")

	# Guard against unexpected collisions if historical data has out-of-order timestamps.
	for _ in range(1000):
		candidate = _format_membership_id(new_number)
		member_check = (
			supabase.table(member_table)
			.select("id")
			.eq("membership_id", candidate)
			.limit(1)
			.execute()
		)
		if member_check.data:
			new_number += 1
			continue

		pds_conflict = False
		try:
			pds_check = (
				supabase.table("personal_data_sheet")
				.select("membership_number_id")
				.eq("membership_number_id", candidate)
				.limit(1)
				.execute()
			)
			pds_conflict = bool(pds_check.data)
		except Exception:
			pds_conflict = False

		if not pds_conflict:
			return candidate
		new_number += 1

	raise MembershipConfirmationError("Unable to generate a unique membership ID. Please retry.")


def normalize_membership_id_format(raw_membership_id: Any) -> str | None:
	membership_id = str(raw_membership_id or "").strip().upper()
	if not membership_id:
		return None

	match = re.match(r"^(?:TTMPC[-_]?M?[_-]?)(\d{1,9})$", membership_id)
	if not match:
		return None

	try:
		number = int(match.group(1))
	except Exception:
		return None

	width = max(3, len(str(number)))
	return f"TTMPC-{number:0{width}d}"

def get_next_membership_id() -> str:
	supabase, _, _ = _load_runtime_config()
	return generate_membership_id(supabase)


def _get_middle_initial(middle_name: str | None, middle_initial: str | None) -> str | None:
	if middle_initial:
		clean = str(middle_initial).strip()
		return clean[:1] if clean else None

	if middle_name:
		clean = str(middle_name).strip()
		return clean[:1] if clean else None

	return None


def _has_present_attendance(supabase: Client, application_id: str | None) -> bool:
	clean_application_id = str(application_id or "").strip()
	if not clean_application_id:
		return False

	try:
		response = (
			supabase.table("attendance_logs")
			.select("status,attendance_status")
			.eq("application_id", clean_application_id)
			.limit(100)
			.execute()
		)
	except Exception:
		return False

	for row in (response.data or []):
		status_values = [
			str(row.get("status") or "").strip().lower(),
			str(row.get("attendance_status") or "").strip().lower(),
		]
		if "present" in status_values:
			return True

	return False


def _application_is_eligible(data: dict[str, Any], force: bool, supabase: Client | None = None) -> bool:
	if force:
		return True

	status_value = str(data.get("training_status") or data.get("application_status") or "").strip().lower()
	accepted = {
		"1st training",
		"first training",
		"training 1",
		"1st training completed",
		"first training completed",
		"passed 1st training",
		"passed first training",
		"2nd_training_completed",
		"2nd training completed",
		"2nd training",
		"second training completed",
		"official member",
	}
	if status_value in accepted:
		return True

	if status_value in {"training", "1st training", "first training"} and supabase is not None:
		return _has_present_attendance(supabase, data.get("application_id"))

	return False


def ensure_confirmer_is_bod(supabase: Client, confirmer_user_id: str) -> dict[str, Any]:
	clean_id = str(confirmer_user_id or "").strip()
	if not clean_id:
		raise MembershipConfirmationError("confirmed_by_user_id is required for confirmation.")

	account_candidates = ["member_account", "member_accounts"]
	auth_email = None
	try:
		admin_api = getattr(supabase, "auth", None)
		admin_api = getattr(admin_api, "admin", None) if admin_api is not None else None
		get_user_by_id = getattr(admin_api, "get_user_by_id", None)
		if callable(get_user_by_id):
			user_result = get_user_by_id(clean_id)
			user_obj = getattr(user_result, "user", None) or getattr(user_result, "data", None)
			if isinstance(user_obj, dict):
				auth_email = str(user_obj.get("email") or "").strip().lower() or None
			else:
				auth_email = str(getattr(user_obj, "email", "") or "").strip().lower() or None
	except Exception:
		auth_email = None

	for account_table in account_candidates:
		try:
			account_response = (
				supabase.table(account_table)
				.select("user_id, auth_user_id, role")
				.or_(f"user_id.eq.{clean_id},auth_user_id.eq.{clean_id}")
				.limit(1)
				.execute()
			)
		except Exception:
			# Backward compatibility for schemas where auth_user_id may be missing.
			try:
				account_response = (
					supabase.table(account_table)
					.select("user_id, role")
					.eq("user_id", clean_id)
					.limit(1)
					.execute()
				)
			except Exception:
				continue

		if not account_response.data:
			continue

		role_value = str(account_response.data[0].get("role") or "").strip()
		if role_value.lower() != "bod":
			raise MembershipConfirmationError("Only BOD users can confirm membership applications.")

		return {
			"user_id": clean_id,
			"role": role_value,
			"table": account_table,
		}

	if auth_email:
		for account_table in account_candidates:
			try:
				account_response = (
					supabase.table(account_table)
					.select("user_id, auth_user_id, role, email")
					.ilike("email", auth_email)
					.limit(1)
					.execute()
				)
				if not account_response.data:
					continue
				role_value = str(account_response.data[0].get("role") or "").strip()
				if role_value.lower() == "bod":
					return {
						"user_id": clean_id,
						"role": role_value,
						"table": account_table,
						"email": auth_email,
					}
			except Exception:
				continue

	raise MembershipConfirmationError(
		"Confirmer account was not found in member_account/member_accounts. Check that the BOD user exists in member_account with role BOD or has a matching auth email."
	)


def _build_default_password(last_name: str | None) -> str:
	clean_last_name = re.sub(r"[^A-Za-z0-9]", "", str(last_name or "").strip())
	if not clean_last_name:
		clean_last_name = "member"
	return f"{clean_last_name}1234"


def _extract_user_id(user_obj: Any) -> str | None:
	if user_obj is None:
		return None

	user_id = getattr(user_obj, "id", None)
	if user_id:
		return str(user_id)

	if isinstance(user_obj, dict):
		return str(user_obj.get("id")) if user_obj.get("id") else None

	return None


def _get_or_create_auth_user_id(
	supabase: Client,
	email: str | None,
	last_name: str | None,
) -> tuple[str, bool, str | None]:
	clean_email = str(email or "").strip().lower()
	if not clean_email:
		raise MembershipConfirmationError("Application email is required to create authentication account.")

	page = 1
	per_page = 1000
	while True:
		users = supabase.auth.admin.list_users(page=page, per_page=per_page)
		if not users:
			break

		for user in users:
			user_email = str(getattr(user, "email", "") or "").strip().lower()
			if user_email == clean_email:
				user_id = _extract_user_id(user)
				if user_id:
					return user_id, False, None

		if len(users) < per_page:
			break

		page += 1

	default_password = _build_default_password(last_name)
	created = supabase.auth.admin.create_user(
		{
			"email": clean_email,
			"password": default_password,
			"email_confirm": True,
		}
	)

	created_user = getattr(created, "user", None)
	user_id = _extract_user_id(created_user)
	if not user_id:
		raise MembershipConfirmationError("Authentication account was created but user id was not returned.")

	return user_id, True, default_password


def set_new_account_temporary(
	supabase: Client,
	auth_user_id: str,
	email: str | None,
	membership_id: str | None = None,
	is_email_dummy: bool = False,
) -> dict[str, Any]:
	clean_email = str(email or "").strip().lower()

	for account_table in ["member_account", "member_accounts"]:
		# First, try update path (row already exists via trigger or prior process).
		try:
			update_payload = {"is_temporary": True}
			if membership_id:
				update_payload["membership_id"] = membership_id
			if is_email_dummy:
				update_payload["is_email_dummy"] = True

			update_response = (
				supabase.table(account_table)
				.update(update_payload)
				.eq("user_id", auth_user_id)
				.execute()
			)
			# Check if update actually affected a row (data is non-empty list)
			if update_response.data and len(update_response.data) > 0:
				return {
					"table": account_table,
					"mode": "updated",
					"is_temporary": True,
				}
		except Exception as update_err:
			# Update failed (e.g., table doesn't exist), try insert
			pass

		# If update didn't affect any rows, attempt insert with all required fields.
		try:
			insert_payload = {
				"user_id": auth_user_id,
				"auth_user_id": auth_user_id,  # Also store the UUID
				"email": clean_email,
				"role": "Member",
				"is_temporary": True,
			}
			if membership_id:
				insert_payload["membership_id"] = membership_id
			if is_email_dummy:
				insert_payload["is_email_dummy"] = True

			insert_response = supabase.table(account_table).insert(insert_payload).execute()
			if insert_response.data and len(insert_response.data) > 0:
				return {
					"table": account_table,
					"mode": "inserted",
					"is_temporary": True,
				}
		except Exception as insert_err:
			print(f"[DEBUG] Could not insert into {account_table}: {insert_err}")
			continue

	return {
		"table": None,
		"mode": "skipped",
		"is_temporary": False,
		"reason": "member account table missing or write blocked",
	}


def create_member(
	supabase: Client,
	application_data: dict[str, Any],
	membership_id: str,
	membership_date: str,
	auth_user_id: str,
) -> dict[str, Any]:
	member_table = _resolve_member_table(supabase)
	payload: dict[str, Any] = {
		"id": auth_user_id,
		"membership_id": membership_id,
		"first_name": application_data.get("first_name"),
		"last_name": application_data.get("last_name") or application_data.get("surname"),
		"middle_initial": _get_middle_initial(
			application_data.get("middle_name"), application_data.get("middle_initial")
		),
		"membership_date": membership_date,
		"is_bona_fide": True,
		"created_at": datetime.now(timezone.utc).isoformat(),
	}

	# Avoid writing explicit NULLs for fields that may have DB defaults/not-null constraints.
	membership_type_id = application_data.get("membership_type_id")
	if membership_type_id not in (None, ""):
		payload["membership_type_id"] = membership_type_id

	middle_initial = payload.get("middle_initial")
	if middle_initial in (None, ""):
		payload.pop("middle_initial", None)

	response = supabase.table(member_table).insert(payload).execute()
	if not response.data:
		raise MembershipConfirmationError(f"Failed to create member record in table '{member_table}'.")

	return response.data[0]


def get_member_by_user_id(supabase: Client, auth_user_id: str) -> dict[str, Any] | None:
	member_table = _resolve_member_table(supabase)
	response = (
		supabase.table(member_table)
		.select("*")
		.eq("id", auth_user_id)
		.limit(1)
		.execute()
	)
	if response.data:
		return response.data[0]
	return None


def update_existing_member(
	supabase: Client,
	auth_user_id: str,
	application_data: dict[str, Any],
	membership_id: str,
	membership_date: str,
) -> dict[str, Any]:
	member_table = _resolve_member_table(supabase)
	payload: dict[str, Any] = {
		"membership_id": membership_id,
		"first_name": application_data.get("first_name"),
		"last_name": application_data.get("last_name") or application_data.get("surname"),
		"middle_initial": _get_middle_initial(
			application_data.get("middle_name"), application_data.get("middle_initial")
		),
		"membership_date": membership_date,
		"is_bona_fide": True,
	}

	membership_type_id = application_data.get("membership_type_id")
	if membership_type_id not in (None, ""):
		payload["membership_type_id"] = membership_type_id

	middle_initial = payload.get("middle_initial")
	if middle_initial in (None, ""):
		payload.pop("middle_initial", None)

	# Some versions of supabase-py/postgrest do not support .select() chaining after .update().
	supabase.table(member_table).update(payload).eq("id", auth_user_id).execute()

	updated = get_member_by_user_id(supabase, auth_user_id)
	if not updated:
		raise MembershipConfirmationError(f"Failed to update existing member record in table '{member_table}'.")

	return updated


def mark_application_as_approved(
	supabase: Client,
	application_id: str,
	application_table: str,
	membership_id: str,
) -> None:
	def _table_has_column(table_name: str, column_name: str) -> bool:
		try:
			supabase.table(table_name).select(column_name).limit(1).execute()
			return True
		except Exception:
			return False

	approved_at = datetime.now(timezone.utc).isoformat()
	payload = {
		"application_status": "Member",
	}

	has_membership_id = _table_has_column(application_table, "membership_id")
	has_approved_at = _table_has_column(application_table, "approved_at")

	if has_membership_id:
		payload["membership_id"] = membership_id
	if has_approved_at:
		payload["approved_at"] = approved_at

	try:
		supabase.table(application_table).update(payload).eq("application_id", application_id).execute()
	except Exception as err:
		err_text = str(err)
		if "capital_build_up_cbu_deposit_id_uk" in err_text or "Key (cbu_deposit_id)=" in err_text:
			raise MembershipConfirmationError(
				"Membership status update triggered a legacy CBU auto-insert and failed due to duplicate cbu_deposit_id. "
				"Disable CBU seeding triggers by running src/server/one_training_policy_update.sql in Supabase, then retry."
			)
		raise MembershipConfirmationError(
			f"Unable to update {application_table} for application {application_id}: {err}"
		)

	verify_columns = ["application_id", "application_status"]
	if has_membership_id:
		verify_columns.append("membership_id")

	verify_response = (
		supabase.table(application_table)
		.select(",".join(verify_columns))
		.eq("application_id", application_id)
		.limit(1)
		.execute()
	)

	if not verify_response.data:
		raise MembershipConfirmationError(
			f"Approval update did not find application row {application_id} in {application_table}."
		)

	updated_row = verify_response.data[0]
	status_after = str(updated_row.get("application_status") or "").strip().lower()
	if status_after not in {"member", "official member"}:
		raise MembershipConfirmationError(
			f"Failed to set application_status to Member for application {application_id}."
		)

	if has_membership_id:
		membership_after = str(updated_row.get("membership_id") or "").strip()
		if membership_after != membership_id:
			raise MembershipConfirmationError(
				f"Failed to persist membership_id on {application_table} for application {application_id}."
			)


def _to_int_or_none(value: Any) -> int | None:
	if value in (None, ""):
		return None
	try:
		# Accept values like "170", "170.5", or "170 cm" and keep only numeric part.
		text = str(value).strip()
		match = re.search(r"-?\d+(?:\.\d+)?", text)
		if not match:
			return None
		return int(float(match.group(0)))
	except Exception:
		return None


def _generate_bod_resolution_number(application_id: str, membership_date: str) -> str:
	clean_app_id = re.sub(r"[^A-Za-z0-9]", "", str(application_id or "").upper())
	suffix = clean_app_id[-6:] if clean_app_id else datetime.now(timezone.utc).strftime("%H%M%S")
	year = str(membership_date or "")[:4] or str(datetime.now(timezone.utc).year)
	return f"BOD-RES-{year}-{suffix}"


def upsert_personal_data_sheet(
	supabase: Client,
	application_data: dict[str, Any],
	application_id: str,
	membership_id: str,
	membership_date: str,
) -> dict[str, Any] | None:
	try:
		supabase.table("personal_data_sheet").select("personal_data_sheet_id").limit(1).execute()
	except Exception:
		return None

	existing_pds_id = None
	try:
		existing_response = (
			supabase.table("personal_data_sheet")
			.select("personal_data_sheet_id")
			.eq("membership_number_id", membership_id)
			.limit(1)
			.execute()
		)
		if existing_response.data:
			existing_pds_id = existing_response.data[0].get("personal_data_sheet_id")
	except Exception:
		existing_pds_id = None

	pds_id = str(existing_pds_id or application_data.get("application_id") or application_id or "").strip()
	if not pds_id:
		pds_id = f"TTMPCAP-{int(datetime.now(timezone.utc).timestamp())}"

	payload: dict[str, Any] = {
		"personal_data_sheet_id": pds_id,
		"membership_number_id": membership_id,
		"email": application_data.get("email"),
		"surname": application_data.get("surname") or application_data.get("last_name"),
		"first_name": application_data.get("first_name"),
		"middle_name": application_data.get("middle_name"),
		"date_of_birth": application_data.get("date_of_birth"),
		"gender": application_data.get("gender"),
		"civil_status": application_data.get("civil_status"),
		"father_name": application_data.get("father_name"),
		"mother_name": application_data.get("mother_name"),
		"maiden_name": application_data.get("maiden_name"),
		"tin_number": application_data.get("tin_number"),
		"gsis_number": application_data.get("gsis_number"),
		"citizenship": application_data.get("citizenship"),
		"religion": application_data.get("religion"),
		"height": _to_int_or_none(application_data.get("height")),
		"blood_type": application_data.get("blood_type"),
		"place_of_birth": application_data.get("place_of_birth"),
		"permanent_address": application_data.get("permanent_address") or application_data.get("address"),
		"contact_number": _to_int_or_none(application_data.get("contact_number")),
		"occupation": application_data.get("occupation"),
		"income_source": application_data.get("income_source"),
		"employer_name": application_data.get("employer_name"),
		"educational_attainment": application_data.get("educational_attainment"),
		"position": application_data.get("position"),
		"salary": application_data.get("salary"),
		"annual_income": application_data.get("annual_income"),
		"other_income": application_data.get("other_income"),
		"number_of_dependents": _to_int_or_none(application_data.get("number_of_dependents")),
		"spouse_name": application_data.get("spouse_name"),
		"spouse_occupation": application_data.get("spouse_occupation"),
		"spouse_date_of_birth": application_data.get("spouse_date_of_birth"),
		"date_of_membership": membership_date,
		# Auto-generated at BOD approval; financial fields remain for authorized manual encoding.
		"BOD_resolution_number": _generate_bod_resolution_number(pds_id, membership_date),
	}

	filtered_payload = {k: v for k, v in payload.items() if v is not None}

	response = (
		supabase.table("personal_data_sheet")
		.upsert(filtered_payload, on_conflict="membership_number_id")
		.execute()
	)

	if response.data:
		return response.data[0]
	return None


def seed_initial_cbu_from_membership_payment(
	supabase: Client,
	auth_user_id: str,
	application_id: str,
	membership_date: str,
) -> dict[str, Any]:
	"""Seed a capital_build_up row from the paid INITIAL_PAID_UP_CAPITAL membership payment.

	Called at BOD confirmation so the loan-form prefill immediately has a CBU
	balance to read. Skips gracefully if a CBU row already exists for this member.
	"""
	try:
		existing = (
			supabase.table("capital_build_up")
			.select("id")
			.eq("member_id", auth_user_id)
			.limit(1)
			.execute()
		)
		if existing.data:
			return {"seeded": False, "reason": "CBU row already exists."}
	except Exception:
		return {"seeded": False, "reason": "Could not check capital_build_up for existing rows."}

	paid_up_amount = None
	try:
		payment_resp = (
			supabase.table("membership_payments")
			.select("amount, payment_status")
			.eq("application_id", application_id)
			.eq("payment_type", "INITIAL_PAID_UP_CAPITAL")
			.eq("payment_status", "paid")
			.limit(1)
			.execute()
		)
		if payment_resp.data:
			paid_up_amount = payment_resp.data[0].get("amount")
	except Exception:
		pass

	if paid_up_amount is None:
		return {"seeded": False, "reason": "No paid INITIAL_PAID_UP_CAPITAL payment found for this application."}

	try:
		amount = float(paid_up_amount)
	except (TypeError, ValueError):
		return {"seeded": False, "reason": "Invalid payment amount."}

	insert_payload = {
		"member_id": auth_user_id,
		"transaction_date": membership_date,
		"starting_share_capital": 0.0,
		"capital_added": amount,
		"ending_share_capital": amount,
		"deposit_account": "Initial Paid-Up Capital",
	}

	try:
		insert_resp = supabase.table("capital_build_up").insert(insert_payload).execute()
		if insert_resp.data:
			return {"seeded": True, "row": insert_resp.data[0]}
		return {"seeded": False, "reason": "Insert returned no data."}
	except Exception as err:
		return {"seeded": False, "reason": str(err)}


def update_confirmed_account_role_to_member(
	supabase: Client,
	auth_user_id: str,
	membership_id: str | None = None,
	email: str | None = None,
) -> dict[str, Any]:
	for account_table in ["member_account", "member_accounts"]:
		try:
			account_response = (
				supabase.table(account_table)
				.select("user_id, role, email, auth_user_id, membership_id")
				.eq("user_id", auth_user_id)
				.limit(1)
				.execute()
			)
		except Exception:
			continue

		if not account_response.data:
			# Try to create if it doesn't exist
			try:
				create_payload = {
					"user_id": auth_user_id,
					"auth_user_id": auth_user_id,
					"role": "Member",
					"email": email,
					"is_temporary": False,
				}
				if membership_id:
					create_payload["membership_id"] = membership_id
				
				supabase.table(account_table).insert(create_payload).execute()
				return {
					"created": True,
					"table": account_table,
					"role": "member",
				}
			except Exception as create_err:
				print(f"[DEBUG] Could not create member_account in {account_table}: {create_err}")
				continue

		# Row exists, update it with any missing fields
		current_role = str(account_response.data[0].get("role") or "").strip().lower()
		update_payload = {"role": "Member"}
		
		# Ensure auth_user_id is stored
		if not account_response.data[0].get("auth_user_id"):
			update_payload["auth_user_id"] = auth_user_id
		
		# Update membership_id if provided and missing
		if membership_id and not account_response.data[0].get("membership_id"):
			update_payload["membership_id"] = membership_id
		
		# Update email if provided and missing
		if email and not account_response.data[0].get("email"):
			update_payload["email"] = email

		if update_payload:
			try:
				supabase.table(account_table).update(update_payload).eq("user_id", auth_user_id).execute()
			except Exception as update_err:
				print(f"[DEBUG] Could not update {account_table}: {update_err}")

		return {
			"updated": True,
			"table": account_table,
			"role": "member",
		}

	return {
		"updated": False,
		"table": None,
		"reason": "member account row not found or write blocked",
	}


def send_pmes_invitation_email(
	to_email: str,
	first_name: str,
	last_name: str,
	application_id: str,
	training_schedule: str,
	resend_api_key: str,
	resend_from_email: str,
	venue: str | None = None,
	additional_notes: str | None = None,
) -> dict[str, Any]:
	"""Send a PMES training invitation email to an applicant."""
	if not resend_api_key:
		return {"sent": False, "reason": "RESEND_API_KEY is not configured."}
	if not to_email:
		return {"sent": False, "reason": "No recipient email found."}

	safe_first_name = str(first_name or "Applicant").strip() or "Applicant"
	safe_last_name = str(last_name or "").strip()
	safe_full_name = f"{safe_last_name}, {safe_first_name}".strip(", ") if safe_last_name else safe_first_name
	safe_app_id = str(application_id or "—").strip()
	safe_schedule = str(training_schedule or "—").strip()
	safe_venue = str(venue or "").strip()
	safe_email = str(to_email).strip()

	venue_row = ""
	if safe_venue:
		venue_row = f"""
			<tr>
			  <td style="padding:8px 0 0 0;font-size:13px;color:#64748B;font-weight:600;">Venue</td>
			  <td style="padding:8px 0 0 0;font-size:13px;color:#111827;">{safe_venue}</td>
			</tr>
		"""

	notes_block = ""
	if additional_notes:
		safe_notes = str(additional_notes).replace("\n", "<br/>")
		notes_block = f"""
		<tr>
		  <td style="padding:0 32px 24px 32px;">
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF7ED;border-left:4px solid #B45309;border-radius:6px;">
			  <tr>
				<td style="padding:14px 18px;">
				  <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#B45309;text-transform:uppercase;letter-spacing:0.08em;">Additional Notes</p>
				  <p style="margin:0;font-size:13px;color:#78350F;line-height:1.55;">{safe_notes}</p>
				</td>
			  </tr>
			</table>
		  </td>
		</tr>
		"""

	subject = f"Invitation: Pre-Membership Education Seminar (PMES) — Ref. {safe_app_id}"

	html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<title>{subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    You are invited to attend the Pre-Membership Education Seminar (PMES) — a required step toward your TTMPC membership.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFC;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);border:1px solid #E2E8F0;">

          <!-- Header -->
          <tr>
            <td style="background-color:#389734;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">
                Tubungan Teachers' Multi-Purpose Cooperative
              </h1>
              <p style="margin:6px 0 0 0;color:#D3ECD2;font-size:12px;letter-spacing:2px;text-transform:uppercase;">
                Membership Application — Training Invitation
              </p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 32px 16px 32px;">
              <p style="margin:0 0 12px 0;font-size:16px;color:#111827;">Dear <strong>{safe_full_name}</strong>,</p>
              <p style="margin:0 0 12px 0;font-size:14px;line-height:1.65;color:#334155;">
                Congratulations! We are pleased to inform you that your membership application
                (<strong>Ref. No. {safe_app_id}</strong>) has successfully passed the initial
                evaluation of our Membership Committee.
              </p>
              <p style="margin:0 0 0 0;font-size:14px;line-height:1.65;color:#334155;">
                As mandated by cooperative guidelines and the Cooperative Development Authority (CDA),
                the next essential step to complete your regular membership is attending the
                <strong>Pre-Membership Education Seminar (PMES)</strong>.
              </p>
            </td>
          </tr>

          <!-- Schedule card -->
          <tr>
            <td style="padding:0 32px 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px 4px 20px;">
                    <p style="margin:0;font-size:11px;color:#2E7A2A;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">
                      Seminar Details
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 20px 18px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:8px 0 0 0;font-size:13px;color:#64748B;font-weight:600;width:40%;">Schedule</td>
                        <td style="padding:8px 0 0 0;font-size:14px;color:#111827;font-weight:700;">{safe_schedule}</td>
                      </tr>
                      {venue_row}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          {notes_block}

          <!-- What to bring -->
          <tr>
            <td style="padding:0 32px 8px 32px;">
              <p style="margin:0 0 8px 0;font-size:14px;color:#111827;font-weight:700;">What to bring</p>
              <ul style="margin:0 0 8px 20px;padding:0;color:#334155;font-size:14px;line-height:1.7;">
                <li style="margin-bottom:4px;">Valid government-issued ID.</li>
                <li style="margin-bottom:4px;">One (1) recent 2×2 ID photo.</li>
                <li style="margin-bottom:4px;">Signed membership application form.</li>
              </ul>
              <p style="margin:8px 0 0 0;font-size:13px;color:#475569;line-height:1.6;">
                Please arrive on time. Completion of the PMES is a mandatory requirement before your membership can be finalized by the Board of Directors.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:20px 32px 32px 32px;">
              <a href="{FRONTEND_BASE_URL}/login"
                 style="background-color:#389734;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;font-family:Arial,Helvetica,sans-serif;">
                View Application Status
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#F8FAFC;border-top:1px solid #E2E8F0;padding:18px 24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748B;">
                This invitation was sent by TTMPC to <strong>{safe_email}</strong> because your membership application passed initial evaluation.
              </p>
              <p style="margin:4px 0 0 0;font-size:12px;color:#94A3B8;">
                &copy; 2026 Tubungan Teachers' Multi-Purpose Cooperative. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

	payload = {
		"from": resend_from_email,
		"to": [to_email],
		"subject": subject,
		"html": html,
	}
	req = urlrequest.Request(
		"https://api.resend.com/emails",
		data=json.dumps(payload).encode("utf-8"),
		headers={
			"Authorization": f"Bearer {resend_api_key}",
			"Content-Type": "application/json",
			"Accept": "application/json",
			"User-Agent": "TTMPC-BOD-Portal/1.0",
		},
		method="POST",
	)
	try:
		with urlrequest.urlopen(req, timeout=12) as response:
			body = response.read().decode("utf-8")
			return {"sent": True, "data": json.loads(body) if body else {}}
	except TimeoutError:
		return {"sent": False, "reason": "Email service timeout."}
	except HTTPError as err:
		error_body = err.read().decode("utf-8") if err.fp else ""
		return {"sent": False, "reason": error_body or f"HTTP {err.code}"}
	except URLError as err:
		return {"sent": False, "reason": f"Email service unreachable: {err.reason}"}


def send_confirmation_email(
	to_email: str,
	first_name: str,
	membership_id: str,
	last_name: str,
	default_password: str | None,
	resend_api_key: str,
	resend_from_email: str,
	training_schedule: str | None = None,
) -> dict[str, Any]:
	if not resend_api_key:
		return {"sent": False, "reason": "RESEND_API_KEY is not configured."}

	if not to_email:
		return {"sent": False, "reason": "No recipient email found."}

	safe_first_name = str(first_name or "Member").strip() or "Member"
	safe_email = str(to_email).strip()

	password_row = ""
	if default_password:
		password_row = f"""
                <tr>
                  <td style="padding:8px 0;font-size:14px;color:#334155;font-weight:600;width:40%;">Temporary Password</td>
                  <td style="padding:8px 0;font-size:14px;color:#0f172a;font-family:'Courier New',monospace;">{default_password}</td>
                </tr>
		"""

	safe_last_name = str(last_name or "").strip()
	safe_full_name = f"{safe_last_name}, {safe_first_name}".strip(", ") if safe_last_name else safe_first_name

	training_section = ""
	if training_schedule:
		training_section = f"""
        <tr>
          <td style="padding:0 32px 24px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0FDF4;border-left:4px solid #389734;border-radius:6px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 4px 0;font-size:11px;color:#2E7A2A;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Upcoming PMES Schedule</p>
                  <p style="margin:0 0 6px 0;font-size:15px;color:#111827;font-weight:600;">{training_schedule}</p>
                  <p style="margin:0;font-size:13px;color:#475569;">Please mark your calendar and arrive on time.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
		"""

	subject = "Welcome to TTMPC — Your Membership is Active"

	html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<title>{subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Your TTMPC membership is now active. Sign in with your email to access the Member Portal.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F4F6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">

          <tr>
            <td style="background-color:#389734;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">
                Tubungan Teachers' Multi-Purpose Cooperative
              </h1>
              <p style="margin:6px 0 0 0;color:#D3ECD2;font-size:13px;letter-spacing:2px;text-transform:uppercase;">
                Membership Activated
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <p style="margin:0 0 12px 0;font-size:17px;color:#0f172a;">Hi <strong>{safe_first_name}</strong>,</p>
              <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#334155;">
                Congratulations! You have successfully completed the required training and your application has been approved by the Board of Directors.
              </p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#334155;">
                You are now recognized as a <strong style="color:#2E7A2A;">Bona Fide Member</strong> of TTMPC, with full access to member services including savings, loans, and cooperative programs.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 8px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
                <tr>
                  <td style="padding:18px 20px 6px 20px;">
                    <p style="margin:0;font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">
                      Your Sign-in Credentials
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 20px 18px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:8px 0;font-size:14px;color:#334155;font-weight:600;width:40%;">Email</td>
                        <td style="padding:8px 0;font-size:14px;color:#0f172a;word-break:break-all;">{safe_email}</td>
                      </tr>
                      {password_row}
                    </table>
                    <p style="margin:10px 0 0 0;font-size:12px;color:#64748B;">
                      For your security, please change your temporary password after your first sign-in.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          {training_section}

          <tr>
            <td style="padding:16px 32px 8px 32px;">
              <p style="margin:0 0 8px 0;font-size:14px;color:#0f172a;font-weight:700;">What's next</p>
              <ul style="margin:0 0 8px 20px;padding:0;color:#334155;font-size:14px;line-height:1.6;">
                <li style="margin-bottom:6px;">Sign in to the Member Portal to view your dashboard.</li>
                <li style="margin-bottom:6px;">Complete your personal data sheet and profile.</li>
                <li style="margin-bottom:6px;">Explore savings and loan services available to members.</li>
              </ul>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:20px 32px 32px 32px;">
              <a href="{FRONTEND_BASE_URL}/memberlogin"
                 style="background-color:#389734;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block;font-family:Arial,Helvetica,sans-serif;">
                Sign in to Member Portal
              </a>
            </td>
          </tr>

          <tr>
            <td style="background-color:#F8FAFC;border-top:1px solid #E2E8F0;padding:18px 24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748B;">
                This message was sent by TTMPC because your membership application was approved.
              </p>
              <p style="margin:4px 0 0 0;font-size:12px;color:#94A3B8;">
                &copy; 2026 Tubungan Teachers' Multi-Purpose Cooperative. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

	payload = {
		"from": resend_from_email,
		"to": [to_email],
		"subject": subject,
		"html": html,
	}
	req = urlrequest.Request(
		"https://api.resend.com/emails",
		data=json.dumps(payload).encode("utf-8"),
		headers={
			"Authorization": f"Bearer {resend_api_key}",
			"Content-Type": "application/json",
			"Accept": "application/json",
			"User-Agent": "TTMPC-BOD-Portal/1.0",
		},
		method="POST",
	)

	try:
		with urlrequest.urlopen(req, timeout=12) as response:
			body = response.read().decode("utf-8")
			confirmation_result = {"sent": True, "data": json.loads(body) if body else {}}
	except TimeoutError:
		return {"sent": False, "reason": "Email service timeout."}
	except HTTPError as err:
		error_body = err.read().decode("utf-8") if err.fp else ""
		return {"sent": False, "reason": error_body or f"HTTP {err.code}"}
	except URLError as err:
		return {"sent": False, "reason": f"Email service unreachable: {err.reason}"}

	# If a training schedule is provided, also send a separate PMES invitation
	# email with the official format required by the cooperative.
	pmes_result = None
	if training_schedule:
		pmes_result = send_pmes_invitation_email(
			to_email=to_email,
			first_name=safe_first_name,
			last_name=safe_last_name,
			application_id=membership_id,
			training_schedule=training_schedule,
			resend_api_key=resend_api_key,
			resend_from_email=resend_from_email,
		)

	return {**confirmation_result, "pmes_invitation": pmes_result}


def confirm_membership(
	application_id: str,
	confirmed_by_user_id: str,
	force: bool = False,
	send_email: bool = True,
) -> dict[str, Any]:
	try:
		supabase, resend_api_key, resend_from_email = _load_runtime_config()
		member_table = _resolve_member_table(supabase)
		confirmer = ensure_confirmer_is_bod(supabase, confirmed_by_user_id)
		application_data, application_table = get_application_data_by_application_id(supabase, application_id)
		membership_id = generate_membership_id(supabase)

		# Guard against accidental duplicate confirmations.
		existing = (
			supabase.table(member_table)
			.select("id")
			.eq("membership_id", membership_id)
			.limit(1)
			.execute()
		)
		if existing.data:
			raise MembershipConfirmationError(f"Membership ID {membership_id} is already in use.")

		if not _application_is_eligible(application_data, force, supabase=supabase):
			current_status = application_data.get("training_status") or application_data.get("application_status")
			raise MembershipConfirmationError(
				f"Application is not eligible for confirmation. Current status: {current_status}"
			)

		membership_date = datetime.now(timezone.utc).date().isoformat()
		row_application_id = application_data.get("application_id")
		if not row_application_id:
			raise MembershipConfirmationError("Application row is missing application_id.")

		auth_user_id, auth_created, generated_password = _get_or_create_auth_user_id(
			supabase,
			application_data.get("email"),
			application_data.get("last_name") or application_data.get("surname"),
		)

		temporary_result = {
			"table": None,
			"mode": "not-required",
			"is_temporary": False,
		}
		if auth_created:
			temporary_result = set_new_account_temporary(
				supabase,
				auth_user_id,
				application_data.get("email"),
				membership_id=membership_id,  # Pass membership_id so member_account gets it too
			)
		temp_password_for_email = generated_password or _build_default_password(
			application_data.get("last_name") or application_data.get("surname")
		)

		existing_member = get_member_by_user_id(supabase, auth_user_id)
		if existing_member:
			membership_id = normalize_membership_id_format(existing_member.get("membership_id")) or existing_member.get("membership_id") or membership_id
			created_member = update_existing_member(
				supabase,
				auth_user_id,
				application_data,
				membership_id,
				membership_date,
			)
		else:
			created_member = create_member(
				supabase,
				application_data,
				membership_id,
				membership_date,
				auth_user_id,
			)
		mark_application_as_approved(
			supabase,
			row_application_id,
			application_table,
			membership_id,
		)
		role_update_result = update_confirmed_account_role_to_member(
			supabase, 
			auth_user_id,
			membership_id=membership_id,
			email=application_data.get("email"),
		)

		persisted_member = get_member_by_user_id(supabase, auth_user_id)
		if not persisted_member:
			raise MembershipConfirmationError(
				f"Membership confirmation finished but no member row found for user {auth_user_id} in '{member_table}'."
			)

		cbu_seed_result = seed_initial_cbu_from_membership_payment(
			supabase,
			auth_user_id,
			row_application_id,
			membership_date,
		)

		personal_data_sheet = upsert_personal_data_sheet(
			supabase,
			application_data,
			row_application_id,
			membership_id,
			membership_date,
		)

		if send_email:
			email_result = send_confirmation_email(
				to_email=application_data.get("email") or "",
				first_name=application_data.get("first_name") or "Applicant",
				last_name=application_data.get("last_name") or application_data.get("surname") or "",
				membership_id=membership_id,
				default_password=temp_password_for_email,
				resend_api_key=resend_api_key,
				resend_from_email=resend_from_email,
			)
		else:
			email_result = {
				"sent": False,
				"reason": "Email sending disabled by request.",
			}

		return {
			"application_id": row_application_id,
			"application_table": application_table,
			"application_status": "Member",
			"confirmed_by": confirmer,
			"membership_id": membership_id,
			"auth_user_id": auth_user_id,
			"auth_account_created": auth_created,
			"member_table": member_table,
			"temporary_account_update": temporary_result,
			"account_role_update": role_update_result,
			"member": persisted_member,
			"personal_data_sheet": personal_data_sheet,
			"cbu_seed": cbu_seed_result,
			"email": email_result,
		}
	except MembershipConfirmationError:
		raise
	except Exception as err:
		err_text = str(err)
		if "row-level security" in err_text.lower() or "permission denied" in err_text.lower():
			raise MembershipConfirmationError(
				"Permission blocked by RLS. With anon key, add explicit SELECT/INSERT/UPDATE policies "
				"for this workflow (or use service role on backend only)."
			)
		raise


def confirm_membership_batch(
	confirmed_by_user_id: str,
	max_items: int = 50,
	force: bool = False,
	send_email: bool = True,
) -> dict[str, Any]:
	if max_items <= 0:
		raise MembershipConfirmationError("max_items must be greater than 0.")

	# Cap request size to avoid very long-running HTTP calls.
	max_items = min(max_items, 500)

	supabase, _, _ = _load_runtime_config()
	ensure_confirmer_is_bod(supabase, confirmed_by_user_id)

	candidates: list[dict[str, Any]] = []
	seen_ids: set[str] = set()

	for application_table in APPLICATION_TABLE_CANDIDATES:
		try:
			response = (
				supabase.table(application_table)
				.select("application_id,application_status,training_status,email")
				.order("created_at", desc=False)
				.limit(max_items * 4)
				.execute()
			)
		except Exception:
			continue

		for row in response.data or []:
			app_id = str(row.get("application_id") or "").strip()
			if not app_id or app_id in seen_ids:
				continue

			status_now = str(row.get("application_status") or "").strip().lower()
			if status_now in {"member", "official member"}:
				continue

			if not force and not _application_is_eligible(row, force=False, supabase=supabase):
				continue

			seen_ids.add(app_id)
			candidates.append(
				{
					"application_id": app_id,
					"application_table": application_table,
				}
			)

			if len(candidates) >= max_items:
				break

		if len(candidates) >= max_items:
			break

	results: list[dict[str, Any]] = []
	success_count = 0
	fail_count = 0

	for item in candidates:
		app_id = item["application_id"]
		try:
			result = confirm_membership(
				app_id,
				confirmed_by_user_id=confirmed_by_user_id,
				force=force,
				send_email=send_email,
			)
			success_count += 1
			results.append(
				{
					"application_id": app_id,
					"status": "success",
					"membership_id": result.get("membership_id"),
					"auth_user_id": result.get("auth_user_id"),
					"auth_account_created": bool(result.get("auth_account_created")),
				}
			)
		except Exception as err:
			fail_count += 1
			results.append(
				{
					"application_id": app_id,
					"status": "failed",
					"error": str(err),
				}
			)

	return {
		"requested_max_items": max_items,
		"processed": len(candidates),
		"success_count": success_count,
		"failed_count": fail_count,
		"results": results,
	}
