from pathlib import Path
HERE = Path(__file__).resolve().parent
src = HERE / "reconstructed_schedules.sql"
out = HERE / "phase1_test_7loans.sql"
targets = ["TTMPCL-178", "TTMPCL-489", "TTMPCL-275", "TTMPCL-059",
           "TTMPCL-007", "TTMPCL-030", "TTMPCL-008"]
tokens = [f"'{t}'" for t in targets]
rollback_ids = ",".join(tokens)

lines = [
    "-- Phase 1 test: 7 loans covering edge cases (clean/delinquent/emergency/etc)",
    "-- Emits Paid installments + ONE active current-due row per loan.",
    f"-- Rollback: DELETE FROM loan_schedules WHERE schedule_id LIKE 'LEGACY_%' AND loan_id IN ({rollback_ids});",
    "",
    "BEGIN;",
    "",
]
inserts = 0
for line in src.read_text(encoding="utf-8").splitlines():
    if not line.startswith("INSERT"):
        continue
    if any(tok in line for tok in tokens):
        lines.append(line)
        inserts += 1
lines += ["", "COMMIT;"]
out.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {out}: {inserts} INSERT rows")
