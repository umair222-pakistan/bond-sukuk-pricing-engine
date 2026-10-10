import { useState } from "react";

const EMBED_CODE = '<iframe src="https://noorfinance.vercel.app/embed/calculator"></iframe>';

export default function ApiKeysPage() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const licenseKey = window.localStorage.getItem("license_key");

  async function copyEmbedCode() {
    setError(null);
    try {
      await navigator.clipboard.writeText(EMBED_CODE);
      setCopied(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to copy the embed code.");
    }
  }

  return (
    <div className="standard-page">
      <header className="page-heading">
        <p className="eyebrow">INTEGRATIONS</p>
        <h1>API Keys & Embed</h1>
        <p>Manage your local license display and embed the NoorFinance calculator.</p>
      </header>
      <section className="saved-calculation-card">
        <h2>License key</h2>
        <p>{licenseKey ?? "No license key found in this browser."}</p>
      </section>
      <section className="saved-calculation-card" style={{ marginTop: 16 }}>
        <h2>Calculator embed</h2>
        <pre style={{ overflowX: "auto", whiteSpace: "pre-wrap" }}>{EMBED_CODE}</pre>
        <button type="button" onClick={() => void copyEmbedCode()}>Copy embed code</button>
        {copied ? <p role="status">Embed code copied.</p> : null}
        {error ? <p className="page-error" role="alert">{error}</p> : null}
      </section>
    </div>
  );
}
