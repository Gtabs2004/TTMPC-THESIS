"""Re-link legacy loans + payments to their correct Supabase member, based on
the new (cleaned + name-fallback) bridge.

For each legacy loan in Supabase:
  - Find its legacy_loan_uuid (raw_payload.legacy_loan_uuid).
  - Look up the loan's MasterUUID in Master_Analytical_Matrix.
  - Look up the correct member_id from the new bridge.
  - If the current loans.member_id != the correct member_id, emit an UPDATE.

Same logic for loan_payments_legacy (uses legacy_member_uuid directly).

Outputs:
  - relink_plan.csv             (human-reviewable: every change we'd make)
  - relink_loans_and_payments.sql
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
REPO = SERVER.parent.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

MATRIX_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Master_Analytical_Matrix.csv"
BRIDGE = HERE / "member_bridge_cleaned.csv"
OUT_PLAN = HERE / "relink_plan.csv"
OUT_SQL = HERE / "relink_loans_and_payments.sql"


def sql_str(v: str) -> str:
    return "'" + str(v).replace("'", "''") + "'"


def main() -> int:
    sb, _, _ = ac._load_runtime_config()

    # ---- New bridge: MasterUUID -> Supabase member.id
    bridge: dict[str, dict] = {}
    with BRIDGE.open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            bridge[row["csv_uuid"]] = row
    print(f"Bridge entries: {len(bridge)}")

    # ---- Matrix: legacy_loan_uuid -> MasterUUID
    loan_to_master: dict[str, str] = {}
    with MATRIX_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            lid = (row.get("LoanID") or "").strip()
            mu = (row.get("MasterUUID") or "").strip()
            if lid and mu:
                loan_to_master[lid] = mu
    print(f"Matrix loan->master pairs: {len(loan_to_master)}")

    # ---- Supabase members: id -> "Last, First" for human review
    name_by_id: dict[str, str] = {}
    offset = 0
    page = 1000
    while True:
        resp = (
            sb.table("member")
            .select("id, last_name, first_name, membership_id")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        for m in batch:
            name_by_id[m["id"]] = f"{m.get('last_name') or ''}, {m.get('first_name') or ''} ({m.get('membership_id') or ''})"
        if len(batch) < page:
            break
        offset += page

    # ---- Legacy loans in Supabase
    print("Fetching legacy loans from Supabase...")
    loans: list[dict] = []
    offset = 0
    while True:
        resp = (
            sb.table("loans")
            .select("control_number, member_id, raw_payload")
            .filter("raw_payload->>legacy", "eq", "true")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        loans.extend(batch)
        if len(batch) < page:
            break
        offset += page
    print(f"Legacy loans fetched: {len(loans)}")

    plan: list[dict] = []
    loan_updates: list[tuple[str, str]] = []
    skip_no_legacy_uuid = 0
    skip_no_master = 0
    skip_no_bridge = 0
    already_correct = 0

    for l in loans:
        ctrl = l["control_number"]
        cur_member = l["member_id"]
        rp = l.get("raw_payload") or {}
        legacy_loan_uuid = (rp.get("legacy_loan_uuid") or "").strip()
        if not legacy_loan_uuid:
            skip_no_legacy_uuid += 1
            continue
        master = loan_to_master.get(legacy_loan_uuid)
        if not master:
            skip_no_master += 1
            continue
        bridge_row = bridge.get(master)
        if not bridge_row:
            skip_no_bridge += 1
            plan.append({
                "control_number": ctrl,
                "current_member_id": cur_member,
                "current_member": name_by_id.get(cur_member, "?"),
                "correct_member_id": "",
                "correct_member": "(not in new bridge)",
                "legacy_loan_uuid": legacy_loan_uuid,
                "master_uuid": master,
                "action": "REVIEW: MasterUUID has no entry in new bridge",
            })
            continue
        correct_member = bridge_row["member_id"]
        if correct_member == cur_member:
            already_correct += 1
            continue
        plan.append({
            "control_number": ctrl,
            "current_member_id": cur_member,
            "current_member": name_by_id.get(cur_member, "?"),
            "correct_member_id": correct_member,
            "correct_member": name_by_id.get(correct_member, "?"),
            "legacy_loan_uuid": legacy_loan_uuid,
            "master_uuid": master,
            "action": "UPDATE",
        })
        loan_updates.append((ctrl, correct_member))

    # ---- Legacy payments
    print("Fetching legacy payments from Supabase...")
    payments: list[dict] = []
    offset = 0
    while True:
        resp = (
            sb.table("loan_payments_legacy")
            .select("id, member_id, legacy_member_uuid")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        payments.extend(batch)
        if len(batch) < page:
            break
        offset += page
    print(f"Legacy payments fetched: {len(payments)}")

    pay_updates: list[tuple[str, str]] = []
    pay_already = 0
    pay_no_bridge = 0
    for p in payments:
        pid = p["id"]
        cur_member = p["member_id"]
        mu = (p.get("legacy_member_uuid") or "").strip()
        if not mu:
            continue
        bridge_row = bridge.get(mu)
        if not bridge_row:
            pay_no_bridge += 1
            continue
        correct = bridge_row["member_id"]
        if correct == cur_member:
            pay_already += 1
            continue
        pay_updates.append((pid, correct))

    # ---- Write plan CSV
    with OUT_PLAN.open("w", encoding="utf-8", newline="") as fh:
        fields = [
            "control_number", "current_member_id", "current_member",
            "correct_member_id", "correct_member",
            "legacy_loan_uuid", "master_uuid", "action",
        ]
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(plan)

    # ---- Write SQL
    lines: list[str] = []
    lines.append("-- Re-link legacy loans + legacy payments to their correct member,")
    lines.append("-- based on the new (cleaned + name-fallback) bridge.")
    lines.append(f"-- Loans to update             : {len(loan_updates)}")
    lines.append(f"-- Loans already correct       : {already_correct}")
    lines.append(f"-- Loans skipped (no MasterUUID in matrix) : {skip_no_master}")
    lines.append(f"-- Loans skipped (MasterUUID not in bridge): {skip_no_bridge}")
    lines.append(f"-- Loans skipped (no legacy_loan_uuid)     : {skip_no_legacy_uuid}")
    lines.append(f"-- Payments to update          : {len(pay_updates)}")
    lines.append(f"-- Payments already correct    : {pay_already}")
    lines.append(f"-- Payments skipped (no bridge): {pay_no_bridge}")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("SET LOCAL session_replication_role = 'replica';")
    lines.append("")

    if loan_updates:
        lines.append("-- Loans")
        for ctrl, mid in loan_updates:
            lines.append(
                f"UPDATE public.loans SET member_id = {sql_str(mid)} "
                f"WHERE control_number = {sql_str(ctrl)};"
            )
        lines.append("")

    if pay_updates:
        lines.append("-- Legacy payments")
        for pid, mid in pay_updates:
            lines.append(
                f"UPDATE public.loan_payments_legacy SET member_id = {sql_str(mid)} "
                f"WHERE id = {sql_str(pid)};"
            )
        lines.append("")

    lines.append("COMMIT;")
    lines.append("")
    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")

    print()
    print(f"Plan rows           : {len(plan)} -> {OUT_PLAN.name}")
    print(f"Loan UPDATEs        : {len(loan_updates)}")
    print(f"Loan already correct: {already_correct}")
    print(f"Loan no bridge entry: {skip_no_bridge}")
    print(f"Payment UPDATEs     : {len(pay_updates)}")
    print(f"Payment already ok  : {pay_already}")
    print(f"SQL written         : {OUT_SQL.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
