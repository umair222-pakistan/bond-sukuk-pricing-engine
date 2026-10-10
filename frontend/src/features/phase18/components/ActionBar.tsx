import { useState } from "react";
import { useVault, type VaultDeal, COMPARE_STORAGE_KEY } from "../hooks/useVault";
import { generateDealPDF } from "../utils/pdfGenerator";

type Props = {
  dealType: string;
  inputs: Record<string, unknown>;
  results: Record<string, unknown>;
};

export default function ActionBar({ dealType, inputs, results }: Props) {
  const { saveDeal, setShareToken } = useVault();
  const [savedDeal, setSavedDeal] = useState<VaultDeal | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetFeedback() {
    setMessage(null);
    setError(null);
  }

  function handleSave() {
    resetFeedback();
    try {
      const deal = saveDeal(dealType, inputs, results);
      setSavedDeal(deal);
      setMessage("Saved to your local vault.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this deal.");
    }
  }

  async function handleExport() {
    resetFeedback();
    try {
      await generateDealPDF({ title: dealType, inputs, results });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to export this deal as a PDF.");
    }
  }

  async function handleShare() {
    resetFeedback();
    try {
      const deal = savedDeal ?? saveDeal(dealType, inputs, results);
      const token = crypto.randomUUID();
      const updatedDeal = setShareToken(deal.id, token);
      if (!updatedDeal) throw new Error("Unable to associate a share link with this deal.");
      setSavedDeal(updatedDeal);
      const url = `${window.location.origin}/share/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        setMessage("Share link copied. It can be opened in this browser where the deal is stored.");
      } catch (cause) {
        setMessage(`Share link created: ${url}`);
        setError(cause instanceof Error ? `Clipboard access failed: ${cause.message}` : "Clipboard access failed.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create or copy a share link.");
    }
  }

  function handleCompare() {
    resetFeedback();
    try {
      const deal = savedDeal ?? saveDeal(dealType, inputs, results);
      setSavedDeal(deal);
      const stored = window.localStorage.getItem(COMPARE_STORAGE_KEY);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) {
        throw new Error("Saved comparison data has an unexpected format.");
      }
      const compareIds = parsed as string[];
      if (compareIds.includes(deal.id)) {
        setMessage("This deal is already in your comparison.");
        return;
      }
      if (compareIds.length >= 3) {
        setError("You can compare up to three deals. Remove one from the vault first.");
        return;
      }
      window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify([...compareIds, deal.id]));
      setMessage("Added to comparison in your vault.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add this deal to comparison.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
        <button type="button" onClick={handleSave}>Save to Vault</button>
        <button type="button" onClick={() => void handleExport()}>Export PDF</button>
        <button type="button" onClick={() => void handleShare()}>Share Link</button>
        <button type="button" onClick={handleCompare}>Compare</button>
      </div>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert" style={{ color: "#a32020" }}>{error}</p> : null}
    </div>
  );
}
