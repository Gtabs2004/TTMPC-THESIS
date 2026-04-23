import { createContext, useContext, useEffect, useState } from "react";
// 1. IMPORTANT: You must import the supabase client here!
// Check your file structure. It might be '../supabaseClient' or '../config/supabaseClient'
import { supabase } from '../supabaseClient'; 

const AuthContext = createContext();

export const AuthContextProvider = ({ children }) => {
  const [session, setSession] = useState(undefined);
  const [memberUser, setMemberUser] = useState(() => {
    try {
      const raw = localStorage.getItem("memberUser");
      return raw ? JSON.parse(raw) : null;
    } catch (_err) {
      return null;
    }
  });

  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

  const persistMemberUser = (user) => {
    setMemberUser(user || null);
    try {
      if (user) {
        localStorage.setItem("memberUser", JSON.stringify(user));
      } else {
        localStorage.removeItem("memberUser");
      }
    } catch (_err) {
      // Ignore localStorage failures; in-memory state still works for this tab.
    }
  };

  const getAccountByEmail = async (normalizedEmail) => {
    const { data, error } = await supabase
      .from("member_account")
      .select("email, role")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (error) {
      return { account: null, error };
    }

    return { account: data || null, error: null };
  };

  // Sign up
  const signUpNewUser = async (email, password, role = "treasurer") => {
    const { data, error } = await supabase.auth.signUp({
      email: email.toLowerCase(),
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
        { email: email.toLowerCase(), role: role }
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

      let { account: memberAccount, error: memberError } = await getAccountByEmail(normalizedEmail);

      if (memberError) {
        console.error("Error fetching member account:", memberError.message);
        return { success: false, error: "Unable to verify account." };
      }

      let data;
      let error;

      // If pre-auth profile lookup misses (often due policy/timing), validate credentials first.
      if (!memberAccount?.email) {
        const authAttempt = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: password,
        });

        data = authAttempt.data;
        error = authAttempt.error;

        if (error) {
          console.error("Sign-in error:", error.message);
          return { success: false, error: error.message };
        }

        const authenticatedEmail =
          authAttempt.data?.user?.email?.trim().toLowerCase() || normalizedEmail;

        const profileAfterAuth = await getAccountByEmail(authenticatedEmail);
        memberAccount = profileAfterAuth.account;
        memberError = profileAfterAuth.error;

        if (memberError) {
          console.error("Error fetching member account after auth:", memberError.message);
          return { success: false, error: "Unable to load account role." };
        }

        if (!memberAccount?.email) {
          await supabase.auth.signOut();
          return {
            success: false,
            error: "Authenticated, but account profile is missing in member_account.",
          };
        }
      } else {
        const authAttempt = await supabase.auth.signInWithPassword({
          email: memberAccount.email.toLowerCase(),
          password: password,
        });

        data = authAttempt.data;
        error = authAttempt.error;
      }

      if (error) {
        console.error("Sign-in error:", error.message);
        return { success: false, error: error.message };
      }

      console.log("Sign-in success:", data);
      return {
        success: true,
        data,
        role: memberAccount.role || null,
        email: memberAccount.email,
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

 const signInWithIdentifier = async (membershipId, password) => {
  const cleanId = String(membershipId || "").trim();
  if (!cleanId) return { success: false, error: "Membership ID is required." };

  try {
    // Resolve account metadata through backend so login does not depend on client-side RLS visibility.
    const resolveResponse = await fetch(`${apiBaseUrl}/api/member/resolve-login-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: cleanId }),
    });

    const resolveBody = await resolveResponse.json();
    if (!resolveResponse.ok) {
      return { success: false, error: resolveBody.detail || "Membership ID not found." };
    }

    const account = resolveBody?.data || {};
    const role = String(account.role || "").trim() || "Member";
    const email = String(account.email || "").trim().toLowerCase();

    if (role !== 'Member') {
      if (!email) {
        return { success: false, error: "Officer account has no linked email." };
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) return { success: false, error: authError.message };
      return { success: true, role, data: authData };
    }

    // Prefer Supabase auth for Member when an email-auth record exists.
    if (email) {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!authError) {
        persistMemberUser(null);
        return { success: true, role: "Member", data: authData };
      }
    }

    // Legacy/local member fallback using backend hash verification.
    const response = await fetch(`${apiBaseUrl}/api/member/login-with-id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        membership_id: cleanId,
        password,
      }),
    });

    const body = await response.json();
    if (!response.ok) return { success: false, error: body.detail || "Login failed." };

    const memberData = {
      membership_id: body.membership_id,
      role: "Member",
      token: body.access_token,
      user_id: body.user_id || null,
    };

    persistMemberUser(memberData);
    return { success: true, role: "Member", data: memberData };
  } catch (err) {
    console.error("Login error:", err);
    return { success: false, error: "Connection error. Please try again." };
  }
};
  // Sign out
  const signOut = async () => {
    persistMemberUser(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
    }
  };

  // Listen for auth changes
 useEffect(() => {
  // Check session on mount
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
    // ONLY clear memberUser if there is NO session AND we aren't 
    // currently holding a valid member token in localStorage.
    if (!session && !localStorage.getItem("memberUser")) {
      persistMemberUser(null);
    }
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
    // Change this logic: Only wipe memberUser if the event is a SIGN_OUT
    if (_event === "SIGNED_OUT") {
      persistMemberUser(null);
    }
  });

  return () => subscription.unsubscribe();
}, []);

  return (
    <AuthContext.Provider
      value={{
        signUpNewUser,
        signInUser,
        signInWithIdentifier,
        session,
        memberUser,
        signOut,
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