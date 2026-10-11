-- =============================================================================
-- Receipts — Part 6: audit trail for staff opening a member's receipt.
-- See RECEIPT_SYSTEM_PLAN.md §9 / §12.2i. Run AFTER receipts_01..05. Safe to re-run.
-- =============================================================================
-- Adds entity_type 'receipt' and action 'view' to audit_log's CHECK lists.
-- The current lists were extended by several migrations over time, so instead
-- of retyping them this reads the live constraint and keeps every value it
-- already allows.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_con     record;
    v_values  text[];
    v_col     text;
    v_add     text;
BEGIN
    FOREACH v_col IN ARRAY ARRAY['entity_type', 'action'] LOOP
        v_add := CASE v_col WHEN 'entity_type' THEN 'receipt' ELSE 'view' END;

        SELECT c.conname, pg_get_constraintdef(c.oid) AS def
        INTO v_con
        FROM pg_constraint c
        WHERE c.conrelid = 'public.audit_log'::regclass
          AND c.contype = 'c'
          AND c.conname = 'audit_log_' || v_col || '_check';

        IF v_con.conname IS NULL THEN
            CONTINUE;   -- no CHECK on this column: nothing to widen
        END IF;

        SELECT array_agg(DISTINCT m[1]) INTO v_values
        FROM regexp_matches(v_con.def, '''([^'']+)''', 'g') AS m;

        IF v_add = ANY (v_values) THEN
            CONTINUE;   -- already allowed
        END IF;
        v_values := v_values || v_add;

        EXECUTE format('ALTER TABLE public.audit_log DROP CONSTRAINT %I', v_con.conname);
        EXECUTE format(
            'ALTER TABLE public.audit_log ADD CONSTRAINT %I CHECK (%I IN (%s))',
            v_con.conname, v_col,
            (SELECT string_agg(quote_literal(v), ', ' ORDER BY v) FROM unnest(v_values) v)
        );
    END LOOP;
END $$;

COMMIT;

-- Check (should list 'receipt' and 'view'):
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.audit_log'::regclass AND contype = 'c';
