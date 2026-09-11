-- Run this WHOLE file as-is. Click Export when done. Rows 201-276 (last page).
WITH candidates AS (
  SELECT
    ma.membership_id,
    ma.email,
    ma.role,
    m.first_name,
    m.middle_initial,
    m.last_name,
    au.encrypted_password AS hash,
    regexp_replace(coalesce(m.last_name, ''), '[^A-Za-z0-9]', '', 'g') || '1234' AS guess
  FROM public.member_account ma
  LEFT JOIN public.member m ON m.membership_id = ma.membership_id
  LEFT JOIN auth.users au ON au.id = ma.auth_user_id
  WHERE ma.auth_user_id IS NOT NULL
    AND au.encrypted_password IS NOT NULL
),
matched AS (
  SELECT
    membership_id,
    btrim(concat_ws(' ', first_name, nullif(btrim(coalesce(middle_initial, '')), ''), last_name)) AS member_name,
    email,
    role,
    guess AS password,
    'verified against auth.users' AS source,
    row_number() OVER (
      ORDER BY
        CASE WHEN lower(coalesce(role, '')) = 'member' THEN 1 ELSE 0 END,
        lower(coalesce(role, '')),
        membership_id
    ) AS rn
  FROM candidates
  WHERE extensions.crypt(guess, hash) = hash
)
SELECT membership_id, member_name, email, role, password, source
FROM matched
WHERE rn >= 201
ORDER BY rn;
