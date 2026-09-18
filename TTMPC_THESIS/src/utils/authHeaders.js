import { supabase } from "../supabaseClient";

// Bearer header for backend endpoints that need to know which staff member is
// calling — the FastAPI backend writes to Supabase on the service-role key,
// so without this the DB has no session context to attribute the action to
// and audit_log rows fall back to "service_role"/System. Same pattern
// AuditLogViewer.jsx already uses for its own reads.
export async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token || ""}` };
}
