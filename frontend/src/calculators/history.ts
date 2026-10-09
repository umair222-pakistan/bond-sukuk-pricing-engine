export const HISTORY_STORAGE_KEY = "noorfinance-calculation-history";

export type CalculationRecord = {
  id: string;
  date: string;
  instrument: "Bond" | "Ijara Sukuk" | "Murabaha" | "Zakat" | "Ijara" | "Musharaka";
  face: number;
  coupon: number;
  yieldRate: number;
  years: number;
  frequency: number;
  price: number;
};

function isCalculationRecord(value: unknown): value is CalculationRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.date === "string" &&
    (record.instrument === "Bond" || record.instrument === "Ijara Sukuk" || record.instrument === "Murabaha" || record.instrument === "Zakat" || record.instrument === "Ijara" || record.instrument === "Musharaka") &&
    typeof record.face === "number" &&
    typeof record.coupon === "number" &&
    typeof record.yieldRate === "number" &&
    typeof record.years === "number" &&
    typeof record.frequency === "number" &&
    typeof record.price === "number"
  );
}

export function readCalculationHistory(): CalculationRecord[] {
  const stored = window.localStorage.getItem(HISTORY_STORAGE_KEY);
  if (stored === null) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isCalculationRecord)) {
    throw new Error("Saved calculation history has an invalid format.");
  }
  return parsed;
}

export function saveCalculation(record: CalculationRecord): void {
  const history = readCalculationHistory();
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([record, ...history].slice(0, 100)));
}
