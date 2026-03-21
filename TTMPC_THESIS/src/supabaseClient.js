import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const browserSessionStorage =
	typeof window !== "undefined" ? window.sessionStorage : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		// Keep auth state per-tab to prevent session bleeding across tabs.
		storage: browserSessionStorage,
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true,
		multiTab: false,
	},
});