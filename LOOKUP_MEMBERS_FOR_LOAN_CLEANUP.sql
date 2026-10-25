-- Read-only lookup: resolve the supplied membership IDs to public.member UUIDs.
-- This script does not modify or delete any data.

WITH requested_members (requested_membership_id) AS (
    VALUES
        ('TTMPC-295'),
        ('TTMPC-296'),
        ('TTMPC-297'),
        ('TTMPC-298'),
        ('TTMPC-299'),
        ('TTMPC-300'),
        ('TTMPC-301'),
        ('TTMPC-302'),
        ('TTMPC-303'),
        ('TTMPC-304'),
        ('TTMPC-305'),
        ('TTMPC-306'),
        ('TTMPC-307')
)
SELECT
    requested_members.requested_membership_id,
    member.id AS member_uuid,
    member.membership_id AS matched_membership_id,
    COUNT(member.id) OVER (
        PARTITION BY requested_members.requested_membership_id
    ) AS match_count
FROM requested_members
LEFT JOIN public.member AS member
    ON UPPER(BTRIM(member.membership_id))
       = UPPER(requested_members.requested_membership_id)
ORDER BY requested_members.requested_membership_id, member.id;
