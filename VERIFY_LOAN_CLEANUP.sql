-- Verify cleanup for TTMPC-295 through TTMPC-307.
-- Expected result: loans_remaining, payments_remaining, and schedules_remaining
-- should all be 0 for every membership ID.

WITH targets (membership_id, member_uuid) AS (
    VALUES
        ('TTMPC-295', 'a31c69ee-5fdb-4f3e-b940-541c0a97cedd'::uuid),
        ('TTMPC-296', 'fe8e4f40-f3d9-4c4b-9ec2-ffbc269ebd85'::uuid),
        ('TTMPC-297', '4580955d-ceda-4d80-bbb2-dd51a852ea4a'::uuid),
        ('TTMPC-298', 'b9bc69a4-83af-4f9d-b690-8395e8aaa5c2'::uuid),
        ('TTMPC-299', '207b314e-ee7c-4cc2-9c72-25d59742a90e'::uuid),
        ('TTMPC-300', 'e095cc91-82ca-4963-8677-706ba16a1338'::uuid),
        ('TTMPC-301', '7febd8cc-f62f-427b-8ec3-c2f93c698a39'::uuid),
        ('TTMPC-302', 'c6372942-1d99-4733-8884-5c95c3c7ee99'::uuid),
        ('TTMPC-303', 'f6b22908-5ac8-4e50-9eff-f1e00b400a53'::uuid),
        ('TTMPC-304', '2c7d1119-d5fa-4414-bf3f-e23eca1930b1'::uuid),
        ('TTMPC-305', 'a753cade-b64c-4bb8-ae0c-c35a0fa5c1f7'::uuid),
        ('TTMPC-306', 'c50f3fd8-9a29-407b-bc7c-d3192a1f176b'::uuid),
        ('TTMPC-307', '2952fa4f-03da-4e97-a135-54e3277425ac'::uuid)
),
target_controls (membership_id, control_number) AS (
    VALUES
        ('TTMPC-295', 'CL-20261020-4850'),
        ('TTMPC-295', 'CL-20261024-9297'),
        ('TTMPC-296', 'BL-20261022133155-820287'),
        ('TTMPC-296', 'CL-20261018-3287'),
        ('TTMPC-296', 'EL-20261020-3335'),
        ('TTMPC-296', 'EL-20261020-5447'),
        ('TTMPC-297', 'EL-20261024-9297'),
        ('TTMPC-298', 'CL-20260710-9298'),
        ('TTMPC-299', 'BL-20261024000000-9299'),
        ('TTMPC-300', 'CL-20251001-9300'),
        ('TTMPC-301', 'CL-20261024-9301'),
        ('TTMPC-302', 'CL-20261024-9302'),
        ('TTMPC-302', 'EL-20260815-9302'),
        ('TTMPC-303', 'CL-20260710-9303'),
        ('TTMPC-304', 'CL-20261024-9304'),
        ('TTMPC-305', 'CL-20260710-9305'),
        ('TTMPC-306', 'CL-20260710-9306'),
        ('TTMPC-307', 'CL-20260410-9307')
)
SELECT
    target.membership_id,
    COUNT(DISTINCT loans.control_number) AS loans_remaining,
    (
        SELECT COUNT(*)
        FROM public.loan_payments AS payment
        JOIN target_controls AS control
          ON control.control_number = payment.loan_id::text
        WHERE control.membership_id = target.membership_id
    ) AS payments_remaining,
    (
        SELECT COUNT(*)
        FROM public.loan_schedules AS schedule
        JOIN target_controls AS control
          ON control.control_number = schedule.loan_id::text
        WHERE control.membership_id = target.membership_id
    ) AS schedules_remaining
FROM targets AS target
LEFT JOIN public.loans AS loans
  ON loans.member_id = target.member_uuid
GROUP BY target.membership_id
ORDER BY target.membership_id;
