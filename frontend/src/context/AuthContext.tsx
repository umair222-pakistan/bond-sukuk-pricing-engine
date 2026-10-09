import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseConfigurationError, supabase, updateRememberSession } from "../lib/supabaseClient";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  configurationError: string | null;
  signUp: (email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const configurationError = getSupabaseConfigurationError();

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setAuthError(null);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthError(error.message);
        setLoading(false);
        return;
      }
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    }).catch((cause: unknown) => {
      if (!active) return;
      setAuthError(cause instanceof Error ? cause.message : "Unable to restore your Supabase session.");
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signUp(email: string, password: string): Promise<boolean> {
    if (!supabase) throw new Error(configurationError ?? "Supabase is not configured.");
    setAuthError(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
      return true;
    }
    return false;
  }

  async function signIn(email: string, password: string, remember = true): Promise<void> {
    if (!supabase) throw new Error(configurationError ?? "Supabase is not configured.");
    setAuthError(null);
    const persistenceChanged = updateRememberSession(remember);
    if (persistenceChanged) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setSession(data.session);
    setUser(data.user);
  }

  async function signOut(): Promise<void> {
    if (!supabase) throw new Error(configurationError ?? "Supabase is not configured.");
    setAuthError(null);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setUser(null);
  }

  const value = useMemo(
    () => ({ user, session, loading, authError, configurationError, signUp, signIn, signOut }),
    [user, session, loading, authError, configurationError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider.");
  return context;
}
