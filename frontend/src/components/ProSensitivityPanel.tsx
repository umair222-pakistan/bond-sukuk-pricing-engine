import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Plot from "react-plotly.js";
import { apiFetch, isOfflineResponse } from "../api/config";

export type ProInputs = {
  face: number;
  coupon: number;
  yieldRate: number;
  years: number;
  freq: number;
};

type SensitivityRow = { bump_bps: number; yield: number; price: number };

type SensitivityResponse = {
  base: { price: number };
  table: SensitivityRow[];
  audit: { id: string };
};

type Mode = "basic" | "pro";

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QR_ENDPOINT = "https://api.qrserver.com/v1/create-qr-code/";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export default function ProSensitivityPanel({ inputs, proUnlocked }: { inputs: ProInputs; proUnlocked: boolean }) {
  const [mode, setMode] = useState<Mode>("basic");
  const [data, setData] = useState<SensitivityResponse | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const { face, coupon, yieldRate, years, freq } = inputs;
  const proActive = mode === "pro" && proUnlocked;

  useEffect(() => {
    if (!proActive) return;
    let active = true;
    setLoading(true);
    setError(null);
    void apiFetch(
      "/api/v2/sensitivity",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ face, coupon, yield: yieldRate, years, freq }),
      },
      8000,
    )
      .then(async (response) => {
        if (!active) return;
        if (isOfflineResponse(response)) {
          setError("Sensitivity analysis needs the API, which is currently offline.");
          return;
        }
        const payload = await response.json();
        if (!response.ok) {
          setError(payload.message ?? "Sensitivity analysis failed.");
          return;
        }
        setData(payload as SensitivityResponse);
        setAuditId(response.headers.get("X-Audit-ID") ?? payload.audit?.id ?? null);
      })
      .catch(() => {
        if (active) setError("Sensitivity analysis failed.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [proActive, face, coupon, yieldRate, years, freq]);


  const plotData = data
    ? [
        {
          x: data.table.map((row) => row.bump_bps),
          y: data.table.map((row) => row.price),
          type: "scatter" as const,
          mode: "lines+markers" as const,
          name: "Price",
          line: { color: "#1A3D2E", width: 3 },
          marker: { size: 6, color: "#1A3D2E" },
        },
      ]
    : [];

  async function downloadPdf() {
    if (!data) return;
    const id = auditId ?? data.audit.id;
    setPdfBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF();
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.setTextColor(26, 61, 46);
      pdf.text("NoorFinance: Bond & Sukuk Pricing Report", 18, 22);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Price: ${money.format(data.base.price)}`, 18, 36);
      pdf.text(`Audit ID: ${id}`, 18, 44);
      pdf.text(`Generated: ${new Date().toISOString()}`, 18, 52);
      try {
        const qr = await fetch(`${QR_ENDPOINT}?size=200x200&data=${encodeURIComponent(id)}`);
        if (!qr.ok) throw new Error(`QR service returned ${qr.status}`);
        const dataUrl = await blobToDataUrl(await qr.blob());
        pdf.addImage(dataUrl, "PNG", 18, 60, 45, 45);
        pdf.text("Scan to verify the audit record.", 18, 110);
      } catch {
        pdf.text("QR code unavailable; use the audit ID above to verify.", 18, 62);
      }
      pdf.save(`noorfinance-${id.slice(0, 8)}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <section className="panel" aria-label="Basic and Pro analysis">
      <div className="kind">
        <button type="button" className={mode === "basic" ? "on" : ""} onClick={() => setMode("basic")}>
          Basic
        </button>
        <button type="button" className={mode === "pro" ? "on" : ""} onClick={() => setMode("pro")}>
          Pro
        </button>
      </div>
      {mode === "basic" ? (
        <p>
          Basic shows the price, premium or discount, and 12-month cash flows. Pro adds a ±300 bp sensitivity
          chart and a PDF report with an audit ID and QR code.
        </p>
      ) : !proUnlocked ? (
        <p>
          Pro features need a Pro plan. <Link to="/pricing">View plans</Link> or{" "}
          <Link to="/activate">activate a license</Link>.
        </p>
      ) : (
        <>
          {loading ? <p>Running sensitivity analysis…</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          {data ? (
            <>
              <Plot
                data={plotData}
                layout={{
                  title: { text: "Price sensitivity, −300 to +300 bp" },
                  xaxis: { title: { text: "Parallel yield shock (bp)" } },
                  yaxis: { title: { text: "Price" } },
                  margin: { t: 40, r: 20, b: 50, l: 60 },
                  height: 340,
                  autosize: true,
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%" }}
              />
              <p>
                Audit ID: <code>{auditId ?? data.audit.id}</code>
              </p>
              <button className="export-button" type="button" disabled={pdfBusy} onClick={() => void downloadPdf()}>
                {pdfBusy ? "Preparing PDF…" : "Download PDF"}
              </button>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
