import { createClient } from "@supabase/supabase-js";

const REMEMBER_SESSION_KEY = "noorfinance-remember-session";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let useSessionStorage = window.localStorage.getItem(REMEMBER_SESSION_KEY) === "false";

const authStorage = {
  getItem(key: string): string | null {
    return (useSessionStorage ? window.sessionStorage : window.localStorage).getItem(key);
  },
  setItem(key: string, value: string): void {
    (useSessionStorage ? window.sessionStorage : window.localStorage).setItem(key, value);
  },
  removeItem(key: string): void {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          storage: authStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export function updateRememberSession(remember: boolean): boolean {
  const nextUseSessionStorage = !remember;
  const changed = useSessionStorage !== nextUseSessionStorage;
  useSessionStorage = nextUseSessionStorage;
  window.localStorage.setItem(REMEMBER_SESSION_KEY, String(remember));
  return changed;
}

export function getRememberSession(): boolean {
  return !useSessionStorage;
}

export function getSupabaseConfigurationError(): string | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.";
  }
  return null;
}
