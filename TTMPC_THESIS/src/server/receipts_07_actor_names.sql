-- =============================================================================
-- Receipts: show staff by name or role, never by login email
-- =============================================================================
-- receipt_actor() resolved a staff member's name only through their linked
-- member record. A staff account with no linked member (e.g. a shared
-- cashier login) got a NULL name, and several receipt builders then fell back
-- to the raw email on the account (recorded_by_email / settled_by_email), which
-- printed on the receipt as "cashier@gmail.com".
--
-- Now: name = the linked member's name when there is one, otherwise the role in
-- plain words ("Cashier", "Bookkeeper"). Because the name is no longer NULL for
-- a known account, the email fallbacks in the builders are never reached.
--
-- Receipts already issued keep their stored snapshot (it is hashed); the receipt
-- viewer masks any email found in a staff field (see receiptView.js).
--
-- Safe to run more than once. Apply in Supabase after receipts_06_audit.sql.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.receipt_actor(p_auth_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
               'name', coalesce(
                           public.receipt_member_name(m.id),
                           initcap(nullif(btrim(ma.role), ''))
                       ),
               'role', nullif(lower(btrim(ma.role)), '')
           )
    FROM public.member_account ma
    LEFT JOIN public.member m ON m.membership_id = ma.membership_id
    WHERE ma.auth_user_id = p_auth_id
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.receipt_actor(uuid) FROM public, anon, authenticated;
