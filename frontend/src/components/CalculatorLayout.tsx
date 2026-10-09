import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type CalculatorLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export default function CalculatorLayout({ title, description, children }: CalculatorLayoutProps) {
  return (
    <div className="calculator-page">
      <div className="calculator-page-heading">
        <Link className="back-link" to="/calculators">← All calculators</Link>
        <p className="eyebrow">NOORFINANCE CALCULATOR</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
