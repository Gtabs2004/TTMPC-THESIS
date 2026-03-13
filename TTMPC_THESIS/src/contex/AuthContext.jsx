import { createContext, useContext, useEffect, useState } from "react";
// 1. IMPORTANT: You must import the supabase client here!
// Check your file structure. It might be '../supabaseClient' or '../config/supabaseClient'
import { supabase } from '../supabaseClient'; 

const AuthContext = createContext();

export const AuthContextProvider = ({ children }) => {
  const [session, setSession] = useState(undefined);

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
  const signUpNewUser = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.toLowerCase(),
      password: password,
    });

    if (error) {
      console.error("Error signing up: ", error);
      return { success: false, error };
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

  // Sign out
  const signOut = async () => {
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

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{ signUpNewUser, signInUser, session, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const UserAuth = () => {
  return useContext(AuthContext);
};