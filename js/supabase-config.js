/* Supabase project connection details.
 *
 * The anon key below is safe to ship in client-side code — it identifies
 * the project, it isn't a secret credential. Access control is enforced by
 * the Row Level Security policies in supabase/schema.sql, not by hiding
 * this value. Never put the *service role* key here or anywhere in the
 * frontend — that one is a real secret and belongs only in the GitHub
 * repository secrets used by the daily email (see README.md).
 *
 * Fill these in after creating the Supabase project: Project Settings ->
 * API -> "Project URL" and "anon public" key. Until they're filled in, the
 * site keeps working exactly as before (no accounts, no magic links, no
 * daily email) — every account-related feature fails gracefully and logs
 * a clear console message instead of breaking the page.
 */
window.SUPABASE_URL = "https://qcdclyucosvjbexjgjnm.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_ogmiGMjLNLPpjOL6y7Q5nw_1v8Izy0A";
