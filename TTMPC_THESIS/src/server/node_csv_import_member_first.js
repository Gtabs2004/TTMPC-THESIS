/*
  Node.js CSV import example (Supabase Admin)
  - Inserts only into public.member
  - Trigger handles member_account + personal_data_sheet
  - Then role/password_hash patch is applied to member_account
*/

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const OFFICER_ROLES = new Set(['manager', 'treasurer', 'secretary', 'bod', 'cashier', 'bookkeeper']);

function normalizeMembershipId(raw) {
  const input = String(raw || '').trim().toUpperCase();
  if (!input) return null;
  if (/^TTMPC[-_]?\d+$/.test(input)) {
    return `TTMPCM_${input.replace(/^TTMPC[-_]?/, '').padStart(3, '0')}`;
  }
  if (/^TTMPCM[-_]?\d+$/.test(input)) {
    return `TTMPCM_${input.replace(/^TTMPCM[-_]?/, '').padStart(3, '0')}`;
  }
  return input;
}

function normalizeRole(rawRole) {
  const role = String(rawRole || '').trim().toLowerCase();
  if (role === 'bod') return 'BOD';
  if (role === 'manager') return 'Manager';
  if (role === 'treasurer') return 'Treasurer';
  if (role === 'secretary') return 'Secretary';
  if (role === 'cashier') return 'Cashier';
  if (role === 'bookkeeper') return 'Bookkeeper';
  return 'Member';
}

function excelDateToIso(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const serial = Math.floor(Number(s));
  const base = new Date(Date.UTC(1899, 11, 30));
  base.setUTCDate(base.getUTCDate() + serial);
  return base.toISOString().slice(0, 10);
}

function makeTempPassword() {
  return `Tmp!${crypto.randomBytes(6).toString('base64url')}`;
}

export async function importMembersFromCsvRows(rows) {
  const results = [];

  for (const row of rows) {
    const membershipId = normalizeMembershipId(row.membership_id ?? row.Membership_ID);
    const role = normalizeRole(row.role ?? row.Role);
    const email = String(row.email ?? row.Email ?? '').trim().toLowerCase() || null;

    if (!membershipId) {
      results.push({ ok: false, membershipId: null, reason: 'Missing membership_id' });
      continue;
    }

    let authUserId = null;
    let tempPassword = null;

    if (OFFICER_ROLES.has(role.toLowerCase())) {
      if (!email) {
        results.push({ ok: false, membershipId, reason: 'Officer row missing email' });
        continue;
      }

      tempPassword = makeTempPassword();
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          role,
          membership_id: membershipId,
        },
      });

      if (created.error) {
        results.push({ ok: false, membershipId, reason: `createUser failed: ${created.error.message}` });
        continue;
      }

      authUserId = created.data.user.id;
    }

    // Insert only into member. Trigger will create dependent rows.
    const memberInsert = await supabaseAdmin
      .from('member')
      .insert({
        id: crypto.randomUUID(),
        auth_user_id: authUserId,
        membership_id: membershipId,
        first_name: (row.firstname ?? row.FirstName ?? '').trim() || null,
        last_name: (row.lastname ?? row.LastName ?? '').trim() || null,
        middle_initial: ((row.middlename ?? row.MiddleName ?? '').trim() || null)?.slice(0, 1),
        membership_date: excelDateToIso(row.datejoined ?? row.DateJoined) ?? new Date().toISOString().slice(0, 10),
        is_bona_fide: true,
      })
      .select('id,membership_id')
      .single();

    if (memberInsert.error) {
      results.push({ ok: false, membershipId, reason: `member insert failed: ${memberInsert.error.message}` });
      continue;
    }

    // Patch trigger-created member_account row with role/email/password_hash.
    const passwordHash = tempPassword ? await bcrypt.hash(tempPassword, 12) : await bcrypt.hash(String(row.password ?? '12345678'), 12);

    const accountUpdate = await supabaseAdmin
      .from('member_account')
      .update({
        role,
        email,
        auth_user_id: authUserId,
        password_hash: passwordHash,
        is_temporary: true,
      })
      .eq('membership_id', membershipId);

    if (accountUpdate.error) {
      results.push({ ok: false, membershipId, reason: `member_account patch failed: ${accountUpdate.error.message}` });
      continue;
    }

    results.push({
      ok: true,
      membershipId,
      officerAuthCreated: Boolean(authUserId),
      tempPassword,
    });
  }

  return results;
}

/*
Hybrid login notes:
1) If identifier includes '@': use supabase.auth.signInWithPassword for officers.
2) If identifier is membership_id:
   - Query member_account by membership_id and role.
   - For role Member, compare supplied password with bcrypt.compare against password_hash.
   - On success, create your own app session/JWT (server-issued), because this path is not Supabase Auth.
*/
