import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getSupabaseConfigurationError, supabase } from "../lib/supabaseClient";

export type SavedCalculation = {
  id: string;
  user_id: string;
  calculator_type: string;
  title: string;
  inputs: Record<string, unknown>;
  results: Record<string, unknown>;
  created_at: string;
};

type SaveCalculationPayload = {
  calculator_type: string;
  title: string;
  inputs: Record<string, unknown>;
  results: Record<string, unknown>;
};

export function useSavedCalculations({ autoFetch = true }: { autoFetch?: boolean } = {}) {
  const { user } = useAuth();
  const [calculations, setCalculations] = useState<SavedCalculation[]>([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState<string | null>(null);

  const fetchCalculations = useCallback(async () => {
    if (!user) {
      setCalculations([]);
      setError(null);
      setLoading(false);
      return;
    }
    if (!supabase) {
      setError(getSupabaseConfigurationError() ?? "Supabase is not configured.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("saved_calculations")
        .select("id,user_id,calculator_type,title,inputs,results,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setCalculations((data ?? []) as SavedCalculation[]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load your saved calculations.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (autoFetch) void fetchCalculations();
  }, [autoFetch, fetchCalculations]);

  const saveCalculation = useCallback(async (payload: SaveCalculationPayload) => {
    if (!supabase) throw new Error(getSupabaseConfigurationError() ?? "Supabase is not configured.");
    const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!currentUser) throw new Error("Sign in to save calculations to your dashboard.");

    const { data, error: saveError } = await supabase
      .from("saved_calculations")
      .insert({
        ...payload,
        user_id: currentUser.id,
      })
      .select("id,user_id,calculator_type,title,inputs,results,created_at")
      .single();
    if (saveError) throw saveError;
    const saved = data as SavedCalculation;
    setCalculations((current) => [saved, ...current]);
    return saved;
  }, []);

  const deleteCalculation = useCallback(async (id: string) => {
    if (!supabase) throw new Error(getSupabaseConfigurationError() ?? "Supabase is not configured.");
    const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!currentUser) throw new Error("Sign in to remove saved calculations.");

    const { error: deleteError } = await supabase
      .from("saved_calculations")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);
    if (deleteError) throw deleteError;
    setCalculations((current) => current.filter((item) => item.id !== id));
  }, []);

  return { calculations, loading, error, fetchCalculations, saveCalculation, deleteCalculation };
}
