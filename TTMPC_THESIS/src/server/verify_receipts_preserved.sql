-- Read-only check: receipts are keyed by member_id (uuid), which no longer
-- resolves via a member lookup now that member rows are deleted. Check them
-- by snapshot content instead, to confirm they were left in place as intended.
SELECT receipt_no, member_id, snapshot->>'membership_id' AS snapshot_membership_id,
       snapshot->>'member_name' AS snapshot_member_name, amount, issued_at
FROM public.receipts
WHERE snapshot->>'membership_id' IN (
  'TTMPC-298','TTMPC-299','TTMPC-296','TTMPC-270','TTMPC-271','TTMPC-131','TTMPC-266','TTMPC-002','TTMPC-295'
)
ORDER BY issued_at;
