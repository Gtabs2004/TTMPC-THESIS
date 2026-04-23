import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function unifiedSync() {
  console.log('--- 🚀 Starting Unified Sync ---');
  const { data: accounts, error } = await supabase
    .from('member_account')
    .select(`membership_id, email, role, auth_user_id, member:user_id (last_name)`);

  if (error) return console.error('❌ Error:', error.message);

  for (const acc of accounts) {
    const lastName = acc.member?.last_name?.trim() || 'User';
    const plainTextPassword = `${lastName}1234`;

    if (acc.role !== 'Member') {
      if (acc.auth_user_id) continue; // Skip if already done
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: acc.email,
        password: plainTextPassword,
        email_confirm: true
      });
      if (!authError) {
        await supabase.from('member').update({ auth_user_id: authUser.user.id }).eq('membership_id', acc.membership_id);
        await supabase.from('member_account').update({ auth_user_id: authUser.user.id }).eq('membership_id', acc.membership_id);
        console.log(`✅ Officer ${acc.membership_id} Created. Pass: ${plainTextPassword}`);
      }
    } else {
      const hashedPassword = await bcrypt.hash(plainTextPassword, 10);
      await supabase.from('member_account').update({ password: hashedPassword }).eq('membership_id', acc.membership_id);
      console.log(`✅ Member ${acc.membership_id} Hashed. Pass Logic: ${plainTextPassword}`);
    }
  }
}
unifiedSync();