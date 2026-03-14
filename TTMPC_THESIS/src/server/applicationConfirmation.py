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
MEMBER_TABLE = "member"


class MembershipConfirmationError(Exception):
	pass


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
	response = (
		supabase.table(MEMBER_TABLE)
		.select("membership_id")
		.order("created_at", desc=True)
		.limit(1)
		.execute()
	)

	if response.data:
		last_id = str(response.data[0].get("membership_id") or "")
		match = re.match(r"^TTMPC_M_(\d{5})$", last_id)
		last_number = int(match.group(1)) if match else 0
		new_number = last_number + 1
	else:
		new_number = 1

	if new_number > 99999:
		raise MembershipConfirmationError("Membership ID sequence exceeded 5 digits.")

	# Guard against unexpected collisions if historical data has out-of-order timestamps.
	for _ in range(1000):
		candidate = f"TTMPC_M_{new_number:05d}"
		member_check = (
			supabase.table(MEMBER_TABLE)
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
		"2nd_training_completed",
		"2nd training completed",
		"2nd training",
		"second training completed",
		"official member",
	}
	return status_value in accepted


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


def create_member(
	supabase: Client,
	application_data: dict[str, Any],
	membership_id: str,
	membership_date: str,
	auth_user_id: str,
) -> dict[str, Any]:
	payload = {
		"id": auth_user_id,
		"membership_id": membership_id,
		"first_name": application_data.get("first_name"),
		"last_name": application_data.get("last_name") or application_data.get("surname"),
		"middle_initial": _get_middle_initial(
			application_data.get("middle_name"), application_data.get("middle_initial")
		),
		"membership_type_id": application_data.get("membership_type_id"),
		"membership_date": membership_date,
		"co_maker": None,
		"is_bona_fide": True,
		"created_at": datetime.now(timezone.utc).isoformat(),
	}

	response = supabase.table(MEMBER_TABLE).insert(payload).execute()
	if not response.data:
		raise MembershipConfirmationError("Failed to create member record.")

	return response.data[0]


def get_member_by_user_id(supabase: Client, auth_user_id: str) -> dict[str, Any] | None:
	response = (
		supabase.table(MEMBER_TABLE)
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
	payload = {
		"membership_id": membership_id,
		"first_name": application_data.get("first_name"),
		"last_name": application_data.get("last_name") or application_data.get("surname"),
		"middle_initial": _get_middle_initial(
			application_data.get("middle_name"), application_data.get("middle_initial")
		),
		"membership_type_id": application_data.get("membership_type_id"),
		"membership_date": membership_date,
		"co_maker": None,
		"is_bona_fide": True,
	}

	# Some versions of supabase-py/postgrest do not support .select() chaining after .update().
	supabase.table(MEMBER_TABLE).update(payload).eq("id", auth_user_id).execute()

	updated = get_member_by_user_id(supabase, auth_user_id)
	if not updated:
		raise MembershipConfirmationError("Failed to update existing member record.")

	return updated


def mark_application_as_approved(
	supabase: Client,
	application_id: str,
	application_table: str,
	membership_id: str,
) -> None:
	approved_at = datetime.now(timezone.utc).isoformat()
	full_payload = {
		"application_status": "Member",
		"membership_id": membership_id,
		"approved_at": approved_at,
	}

	# Try to store all historical links; if optional columns are missing, fallback to status-only.
	try:
		supabase.table(application_table).update(full_payload).eq("application_id", application_id).execute()
		return
	except Exception:
		pass

	supabase.table(application_table).update({"application_status": "Member"}).eq(
		"application_id", application_id
	).execute()


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
		with urlrequest.urlopen(req) as response:
			body = response.read().decode("utf-8")
			return {"sent": True, "data": json.loads(body) if body else {}}
	except HTTPError as err:
		error_body = err.read().decode("utf-8") if err.fp else ""
		return {"sent": False, "reason": error_body or f"HTTP {err.code}"}
	except URLError as err:
		return {"sent": False, "reason": f"Email service unreachable: {err.reason}"}


def confirm_membership(application_id: str, force: bool = False) -> dict[str, Any]:
	try:
		supabase, resend_api_key, resend_from_email = _load_runtime_config()
		application_data, application_table = get_application_data_by_application_id(supabase, application_id)
		membership_id = generate_membership_id(supabase)

		# Guard against accidental duplicate confirmations.
		existing = (
			supabase.table(MEMBER_TABLE)
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

		email_result = send_confirmation_email(
			to_email=application_data.get("email") or "",
			first_name=application_data.get("first_name") or "Applicant",
			membership_id=membership_id,
			default_password=generated_password,
			resend_api_key=resend_api_key,
			resend_from_email=resend_from_email,
		)

		return {
			"application_id": row_application_id,
			"application_table": application_table,
			"application_status": "Member",
			"membership_id": membership_id,
			"auth_user_id": auth_user_id,
			"auth_account_created": auth_created,
			"member": created_member,
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
