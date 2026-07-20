import { createContext, useContext, useEffect, useState } from "react";
// 1. IMPORTANT: You must import the supabase client here!
// Check your file structure. It might be '../supabaseClient' or '../config/supabaseClient'
import { supabase } from '../supabaseClient';
import { clearAll as clearMemberDataCache } from '../Member/memberDataCache';

const AuthContext = createContext();

export const AuthContextProvider = ({ children }) => {
  const [session, setSession] = useState(undefined);

  const getAccountByEmail = async (normalizedEmail) => {
    const { data, error } = await supabase
      .from("member_account")
      .select("user_id, auth_user_id, email, role, membership_id")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (error) {
      return { account: null, error };
    }

    return { account: data || null, error: null };
  };

  // Ensure personal_data_sheet record exists by backfilling from member_applications (first login only)
  const ensurePersonalDataSheetExists = async (email, membershipId, isTemporary, accountId) => {
    try {
      // Only backfill on first login (is_temporary = true)
      if (!isTemporary || !membershipId) return;

      // Check if personal_data_sheet already has this membership
      const { data: existingRecord, error: checkError } = await supabase
        .from("personal_data_sheet")
        .select("personal_data_sheet_id")
        .eq("membership_number_id", membershipId)
        .limit(1)
        .maybeSingle();

      if (!checkError && existingRecord) {
        // Record exists, just mark account as no longer temporary
        await markAccountAsNotTemporary(accountId);
        return;
      }

      // Try to backfill from member_applications
      let appData = null;
      
      const { data: appByMembership, error: appMemberError } = await supabase
        .from("member_applications")
        .select("*")
        .eq("membership_id", membershipId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!appMemberError && appByMembership) {
        appData = appByMembership;
      } else {
        // Fallback: try email match
        const { data: appByEmail, error: appEmailError } = await supabase
          .from("member_applications")
          .select("*")
          .ilike("email", email)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!appEmailError && appByEmail) {
          appData = appByEmail;
        }
      }

      if (!appData) {
        // No application found, just mark as not temporary
        await markAccountAsNotTemporary(accountId);
        return;
      }

      // Create personal_data_sheet record from application data
      const { error: insertError } = await supabase
        .from("personal_data_sheet")
        .insert([
          {
            personal_data_sheet_id: `pds_${membershipId}_${Date.now()}`,
            membership_number_id: membershipId,
            first_name: appData.first_name || null,
            middle_name: appData.middle_name || null,
            surname: appData.surname || appData.last_name || null,
            email: appData.email || email || null,
            contact_number: appData.contact_number || null,
            date_of_birth: appData.date_of_birth || null,
            gender: appData.gender || null,
            civil_status: appData.civil_status || null,
            permanent_address: appData.permanent_address || null,
            occupation: appData.occupation || null,
            position: appData.position || null,
            tin_number: appData.tin_number || null,
          },
        ]);

      if (insertError && !insertError.message.includes("duplicate")) {
        console.warn("Could not backfill personal_data_sheet:", insertError);
      }

      // Mark account as no longer temporary (first login complete)
      await markAccountAsNotTemporary(accountId);
    } catch (error) {
      console.warn("Error ensuring personal_data_sheet exists:", error);
    }
  };

  // Mark account as not temporary after first login
  const markAccountAsNotTemporary = async (accountId) => {
    try {
      if (!accountId) return;
      
      const { error } = await supabase
        .from("member_account")
        .update({ is_temporary: false })
        .eq("user_id", accountId);

      if (error) {
        console.warn("Could not update is_temporary flag:", error);
      }
    } catch (error) {
      console.warn("Error updating is_temporary:", error);
    }
  };

  // Sign up
  const signUpNewUser = async (email, password, role = "treasurer") => {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: password,
    });

    if (error) {
      console.error("Error signing up: ", error);
      return { success: false, error };
    }

    // Insert profile row for Treasurer
    const { data: profileData, error: profileError } = await supabase
      .from("member_account")
      .insert([
        {
          email: normalizedEmail,
          role: role,
          auth_user_id: data?.user?.id || null,
        }
      ]);

    if (profileError) {
      console.error("Error creating Treasurer profile: ", profileError);
      return { success: false, error: profileError };
    }

    return { success: true, data };
  };

  // Sign in
  const signInUser = async (email, password) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();

      const authAttempt = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: password,
      });

      const data = authAttempt.data;
      const error = authAttempt.error;

      if (error) {
        console.error("Sign-in error:", error.message);
        return { success: false, error: error.message };
      }

      const authenticatedEmail =
        authAttempt.data?.user?.email?.trim().toLowerCase() || normalizedEmail;

      const profileAfterAuth = await getAccountByEmail(authenticatedEmail);
      const memberAccount = profileAfterAuth.account;
      const memberError = profileAfterAuth.error;

      if (memberError) {
        console.error("Error fetching member account after auth:", memberError.message);
        await supabase.auth.signOut();
        return { success: false, error: "Unable to load account role." };
      }

      if (!memberAccount?.email) {
        await supabase.auth.signOut();
        return {
          success: false,
          error: "Authenticated, but account profile is missing in member_account.",
        };
      }

      // On first login (is_temporary = true), backfill personal_data_sheet from member_applications
      const memberEmail = memberAccount?.email || normalizedEmail;
      const membershipId = memberAccount?.membership_id;
      const isTemporary = Boolean(memberAccount?.is_temporary);
      const userId = memberAccount?.user_id;
      
      if (isTemporary) {
        await ensurePersonalDataSheetExists(memberEmail, membershipId, isTemporary, userId);
      }

      console.log("Sign-in success:", data);
      return {
        success: true,
        data,
        role: memberAccount.role || null,
        email: memberAccount.email,
        userId: memberAccount.user_id || null,
        authUserId: memberAccount.auth_user_id || data?.user?.id || null,
        membershipId: memberAccount.membership_id || null,
      };
    } catch (error) {
      // FIXED: Changed 'err.message' to 'error.message'
      console.error("Unexpected error during sign-in:", error.message);
      return {
        success: false,
        error: "An unexpected error occurred. Please try again.",
      };
    }
  };

  // Send a 6-digit recovery OTP to the user's email.
  const sendPasswordResetOtp = async (email) => {
    const normalizedEmail = email.trim().toLowerCase();

    const { account } = await getAccountByEmail(normalizedEmail);
    if (!account) {
      return { success: false, error: "No account found for that email." };
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: false },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  // Verify the 6-digit code. On success Supabase issues a session that
  // allows updateUser({ password }) to succeed.
  const verifyPasswordResetOtp = async (email, token) => {
    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: token.trim(),
      type: "email",
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data };
  };

  // Set a new password on the currently authenticated (post-OTP) session.
  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { success: false, error: error.message };
    }
    // Sign out so the reset session doesn't linger; user re-logs in normally.
    await supabase.auth.signOut();
    return { success: true };
  };

  // Sign out
  const signOut = async () => {
    // Drop all cached member data so the next user doesn't see stale data.
    clearMemberDataCache();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
    }
  };

  // Listen for auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Revalidate session against the Auth server when the tab regains focus.
    // Why: sessionStorage is cloned into target="_blank" tabs, so a revoked or
    // swapped-out token still looks valid locally via getSession(). getUser()
    // is the only call that actually round-trips to verify the token.
    const revalidate = async () => {
      if (document.visibilityState !== "visible") return;
      const { data, error } = await supabase.auth.getUser();
      const localSession = (await supabase.auth.getSession()).data.session;
      const localUserId = localSession?.user?.id ?? null;
      const serverUserId = data?.user?.id ?? null;
      if (error || !serverUserId || serverUserId !== localUserId) {
        clearMemberDataCache();
        await supabase.auth.signOut();
        setSession(null);
      }
    };
    document.addEventListener("visibilitychange", revalidate);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        signUpNewUser,
        signInUser,
        session,
        signOut,
        sendPasswordResetOtp,
        verifyPasswordResetOtp,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export { AuthContext };

export const UserAuth = () => {
  return useContext(AuthContext);
};