-- Re-link legacy loans + legacy payments to their correct member,
-- based on the new (cleaned + name-fallback) bridge.
-- Loans to update             : 0
-- Loans already correct       : 596
-- Loans skipped (no MasterUUID in matrix) : 0
-- Loans skipped (MasterUUID not in bridge): 0
-- Loans skipped (no legacy_loan_uuid)     : 0
-- Payments to update          : 0
-- Payments already correct    : 6045
-- Payments skipped (no bridge): 0

BEGIN;
SET LOCAL session_replication_role = 'replica';

COMMIT;
