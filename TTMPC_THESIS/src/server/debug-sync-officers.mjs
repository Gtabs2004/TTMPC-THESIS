import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await c
  .from('member_account')
  .select('membership_id,email,role,auth_user_id')
  .neq('role', 'Member')
  .is('auth_user_id', null);

if (error) {
  console.error('fetch error', error);
  process.exit(1);
}

console.log('officers needing auth:', data.length);
console.table(data);

const listed = await c.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) {
  console.error('listUsers error', listed.error);
  process.exit(1);
}

const existingEmails = new Set((listed.data?.users || []).map((u) => (u.email || '').toLowerCase()));
const alreadyInAuth = data.filter((r) => existingEmails.has((r.email || '').toLowerCase()));
const invalidEmails = data.filter((r) => !r.email || !String(r.email).includes('@'));

console.log('already in auth by email:', alreadyInAuth.length);
console.table(alreadyInAuth);
console.log('invalid emails:', invalidEmails.length);
console.table(invalidEmails);
