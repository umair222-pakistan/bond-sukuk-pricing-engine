import type { VaultDeal } from "../features/phase18/hooks/useVault";

function csvCell(value: unknown): string {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportDealsToCSV(deals: VaultDeal[]): void {
  const columns = [
    "id", "title", "calculator_type", "created_at", "tags",
    ...new Set(deals.flatMap((deal) => Object.keys(deal.inputs).map((key) => `input:${key}`))),
    ...new Set(deals.flatMap((deal) => Object.keys(deal.results).map((key) => `result:${key}`))),
  ];
  const rows = deals.map((deal) => {
    const values: Record<string, unknown> = {
      id: deal.id,
      title: deal.title,
      calculator_type: deal.calculator_type,
      created_at: deal.created_at,
      tags: deal.tags ?? [],
    };
    for (const [key, value] of Object.entries(deal.inputs)) values[`input:${key}`] = value;
    for (const [key, value] of Object.entries(deal.results)) values[`result:${key}`] = value;
    return columns.map((column) => csvCell(values[column])).join(",");
  });
  const csv = [columns.map(csvCell).join(","), ...rows].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "noorfinance-deals.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportDealsToExcel(deals: VaultDeal[]): void {
  exportDealsToCSV(deals);
}
