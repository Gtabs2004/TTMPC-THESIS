import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

const email = `debug_${Date.now()}_${crypto.randomBytes(3).toString('hex')}@example.com`;

const result = await c.auth.admin.createUser({
  email,
  password: `Tmp!${crypto.randomBytes(6).toString('base64url')}`,
  email_confirm: true,
  user_metadata: { role: 'Manager', membership_id: 'DEBUG_001' },
});

if (result.error) {
  console.error('createUser failed');
  console.error('message:', result.error.message);
  console.error('status:', result.error.status);
  console.error('name:', result.error.name);
  console.error('code:', result.error.code);
  process.exit(1);
}

console.log('createUser success', result.data.user.id, email);

const del = await c.auth.admin.deleteUser(result.data.user.id);
if (del.error) {
  console.error('cleanup deleteUser failed', del.error.message);
  process.exit(2);
}

console.log('cleanup success');
