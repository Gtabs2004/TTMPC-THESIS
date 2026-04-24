import { supabase } from "../supabaseClient";

const ACCOUNT_TABLES = ["member_account", "member_accounts"];

const normalizeValue = (value) => String(value || "").trim();
const normalizeEmail = (value) => normalizeValue(value).toLowerCase();

const safeMaybeSingle = async (query) => {
  try {
    const response = await query;
    return { data: response?.data || null, error: response?.error || null };
  } catch (error) {
    return { data: null, error };
  }
};

const buildAccountSelect = "user_id, auth_user_id, role, email, membership_id, is_temporary";

export async function resolveAccountFromSessionUser(sessionUser) {
  const authUserId = normalizeValue(sessionUser?.id);
  const email = normalizeEmail(sessionUser?.email);

  for (const tableName of ACCOUNT_TABLES) {
    if (authUserId) {
      const byAuthUserId = await safeMaybeSingle(
        supabase
          .from(tableName)
          .select(buildAccountSelect)
          .eq("auth_user_id", authUserId)
          .limit(1)
          .maybeSingle()
      );

      if (!byAuthUserId.error && byAuthUserId.data) {
        return { ...byAuthUserId.data, table: tableName };
      }
    }

    if (authUserId) {
      const byUserId = await safeMaybeSingle(
        supabase
          .from(tableName)
          .select(buildAccountSelect)
          .eq("user_id", authUserId)
          .limit(1)
          .maybeSingle()
      );

      if (!byUserId.error && byUserId.data) {
        return { ...byUserId.data, table: tableName };
      }
    }

    if (email) {
      const byEmail = await safeMaybeSingle(
        supabase
          .from(tableName)
          .select(buildAccountSelect)
          .ilike("email", email)
          .limit(1)
          .maybeSingle()
      );

      if (!byEmail.error && byEmail.data) {
        return { ...byEmail.data, table: tableName };
      }
    }
  }

  return null;
}

export async function resolveMemberContextFromSessionUser(sessionUser) {
  const account = await resolveAccountFromSessionUser(sessionUser);
  const email = normalizeEmail(sessionUser?.email);

  // Query personal_data_sheet table for member profile info
  // Match by membership_id (from account) or email
  if (account?.membership_id) {
    const byMembershipId = await safeMaybeSingle(
      supabase
        .from("personal_data_sheet")
        .select("*")
        .eq("membership_number_id", account.membership_id)
        .limit(1)
        .maybeSingle()
    );

    if (!byMembershipId.error && byMembershipId.data) {
      return { account, member: byMembershipId.data, memberTable: "personal_data_sheet" };
    }
  }

  // Fallback: try email match
  if (email) {
    const byEmail = await safeMaybeSingle(
      supabase
        .from("personal_data_sheet")
        .select("*")
        .ilike("email", email)
        .limit(1)
        .maybeSingle()
    );

    if (!byEmail.error && byEmail.data) {
      return { account, member: byEmail.data, memberTable: "personal_data_sheet" };
    }
  }

  return { account, member: null, memberTable: null };
}