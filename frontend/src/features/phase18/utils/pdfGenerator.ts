type DealPDFData = {
  title: string;
  inputs: Record<string, unknown>;
  results: Record<string, unknown>;
};

function displayLabel(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function generateDealPDF(deal: DealPDFData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(26, 61, 46);
  pdf.text("NoorFinance", margin, y);
  y += 12;
  pdf.setFontSize(14);
  pdf.text(deal.title, margin, y);
  y += 12;

  const addTable = (heading: string, values: Record<string, unknown>) => {
    const rows = Object.entries(values);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(26, 61, 46);
    pdf.text(heading, margin, y);
    y += 7;

    const rowHeight = 8;
    const keyWidth = contentWidth * 0.38;
    for (const [key, value] of rows) {
      if (y + rowHeight > pageHeight - 25) {
        pdf.addPage();
        y = 20;
      }
      const labelLines = pdf.splitTextToSize(displayLabel(key), keyWidth - 4) as string[];
      const valueLines = pdf.splitTextToSize(displayValue(value), contentWidth - keyWidth - 4) as string[];
      const height = Math.max(rowHeight, Math.max(labelLines.length, valueLines.length) * 5 + 3);
      pdf.setDrawColor(220, 227, 221);
      pdf.rect(margin, y, contentWidth, height);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(48, 58, 51);
      pdf.text(labelLines, margin + 2, y + 5);
      pdf.setFont("helvetica", "normal");
      pdf.text(valueLines, margin + keyWidth + 2, y + 5);
      y += height;
    }
    y += 10;
  };

  addTable("Inputs", deal.inputs);
  addTable("Results", deal.results);

  const footerY = Math.min(y, pageHeight - 14);
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 107, 101);
  pdf.text("Sharia-compliant estimate", margin, footerY);
  pdf.save(`${deal.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "noorfinance-deal"}.pdf`);
}
