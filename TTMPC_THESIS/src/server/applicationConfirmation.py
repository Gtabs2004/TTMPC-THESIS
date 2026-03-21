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
	response = (
		supabase.table(member_table)
		.select("membership_id")
		.order("created_at", desc=True)
		.limit(1000)
		.execute()
	)

	max_existing_number = 0
	for row in (response.data or []):
		membership_id = str(row.get("membership_id") or "").strip()
		match = re.match(r"^(?:TTMPC_M_|TTMPCM-)(\d{1,6})$", membership_id)
		if not match:
			continue
		try:
			max_existing_number = max(max_existing_number, int(match.group(1)))
		except Exception:
			continue

	new_number = max_existing_number + 1

	if new_number > 99999:
		raise MembershipConfirmationError("Membership ID sequence exceeded 5 digits.")

	# Guard against unexpected collisions if historical data has out-of-order timestamps.
	for _ in range(1000):
		candidate = f"TTMPCM-{new_number:05d}"
		member_check = (
			supabase.table(member_table)
			.select("id")
			.eq("membership_id", candidate)
			.limit(1)
			.execute()
		)
		if not member_check.data:
			return candidate
		new_number += 1

	raise MembershipConfirmationError("Unable to generate a unique membership ID. Please retry.")

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


def _application_is_eligible(data: dict[str, Any], force: bool) -> bool:
	if force:
		return True

	status_value = str(data.get("training_status") or data.get("application_status") or "").strip().lower()
	accepted = {
		"1st training",
		"first training",
		"training 1",
		"1st training completed",
		"first training completed",
		"2nd_training_completed",
		"2nd training completed",
		"2nd training",
		"second training completed",
		"official member",
	}
	return status_value in accepted


def ensure_confirmer_is_bod(supabase: Client, confirmer_user_id: str) -> dict[str, Any]:
	clean_id = str(confirmer_user_id or "").strip()
	if not clean_id:
		raise MembershipConfirmationError("confirmed_by_user_id is required for confirmation.")

	for account_table in ["member_account", "member_accounts"]:
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

	raise MembershipConfirmationError("Confirmer account was not found in member_account/member_accounts.")


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
) -> dict[str, Any]:
	clean_email = str(email or "").strip().lower()

	for account_table in ["member_account", "member_accounts"]:
		# First, try update path (row already exists via trigger or prior process).
		try:
			update_response = (
				supabase.table(account_table)
				.update({"is_temporary": True})
				.eq("user_id", auth_user_id)
				.execute()
			)
			if update_response.data:
				return {
					"table": account_table,
					"mode": "updated",
					"is_temporary": True,
				}
		except Exception:
			pass

		# If no row exists, attempt a minimal insert fallback.
		try:
			insert_payload = {
				"user_id": auth_user_id,
				"email": clean_email,
				"role": "Member",
				"is_temporary": True,
			}
			insert_response = supabase.table(account_table).insert(insert_payload).execute()
			if insert_response.data:
				return {
					"table": account_table,
					"mode": "inserted",
					"is_temporary": True,
				}
		except Exception:
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

	pds_id = str(application_data.get("application_id") or application_id or "").strip()
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
		.upsert(filtered_payload, on_conflict="personal_data_sheet_id")
		.execute()
	)

	if response.data:
		return response.data[0]
	return None


def update_confirmed_account_role_to_member(
	supabase: Client,
	auth_user_id: str,
) -> dict[str, Any]:
	for account_table in ["member_account", "member_accounts"]:
		try:
			account_response = (
				supabase.table(account_table)
				.select("user_id, role")
				.eq("user_id", auth_user_id)
				.limit(1)
				.execute()
			)
		except Exception:
			continue

		if not account_response.data:
			continue

		current_role = str(account_response.data[0].get("role") or "").strip()
		if current_role.lower() == "bod":
			supabase.table(account_table).update({"role": "Member"}).eq("user_id", auth_user_id).execute()
			return {
				"updated": True,
				"table": account_table,
				"from": current_role,
				"to": "Member",
			}

		return {
			"updated": False,
			"table": account_table,
			"current_role": current_role,
		}

	return {
		"updated": False,
		"table": None,
		"reason": "member account row not found",
	}


def send_confirmation_email(
	to_email: str,
	first_name: str,
	membership_id: str,
	default_password: str | None,
	resend_api_key: str,
	resend_from_email: str,
) -> dict[str, Any]:
	if not resend_api_key:
		return {"sent": False, "reason": "RESEND_API_KEY is not configured."}

	if not to_email:
		return {"sent": False, "reason": "No recipient email found."}

	password_html = ""
	if default_password:
		password_html = f"<p><strong>Temporary Password:</strong> {default_password}</p>"

	payload = {
		"from": resend_from_email,
		"to": [to_email],
		"subject": "Membership Confirmation",
		"html": f"""
		  <div style=\"font-family: Arial, sans-serif; color: #111827;\">
			<p>Dear {first_name},</p>
			<p>Congratulations!</p>
			<p>
			  You have successfully completed the required trainings and your
			  membership has now been officially activated.
			</p>
			<p>Welcome as a Bona Fide Member.</p>
			<p><strong>Membership ID:</strong> {membership_id}</p>
			{password_html}
			<p>Thank you.</p>
		  </div>
		""",
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


def confirm_membership(application_id: str, confirmed_by_user_id: str, force: bool = False) -> dict[str, Any]:
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

		if not _application_is_eligible(application_data, force):
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
			)
		temp_password_for_email = generated_password or _build_default_password(
			application_data.get("last_name") or application_data.get("surname")
		)

		existing_member = get_member_by_user_id(supabase, auth_user_id)
		if existing_member:
			membership_id = existing_member.get("membership_id") or membership_id
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
		role_update_result = update_confirmed_account_role_to_member(supabase, auth_user_id)

		persisted_member = get_member_by_user_id(supabase, auth_user_id)
		if not persisted_member:
			raise MembershipConfirmationError(
				f"Membership confirmation finished but no member row found for user {auth_user_id} in '{member_table}'."
			)

		personal_data_sheet = upsert_personal_data_sheet(
			supabase,
			application_data,
			row_application_id,
			membership_id,
			membership_date,
		)

		email_result = send_confirmation_email(
			to_email=application_data.get("email") or "",
			first_name=application_data.get("first_name") or "Applicant",
			membership_id=membership_id,
			default_password=temp_password_for_email,
			resend_api_key=resend_api_key,
			resend_from_email=resend_from_email,
		)

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

			if not force and not _application_is_eligible(row, force=False):
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
			result = confirm_membership(app_id, confirmed_by_user_id=confirmed_by_user_id, force=force)
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
