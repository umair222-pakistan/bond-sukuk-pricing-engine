export type PricingInput = {
  face: number;
  coupon: number;
  yield: number;
  years: number;
  freq: number;
};

export type PricingCashflow = {
  period: number;
  time_years: number;
  coupon_or_rental: number;
  principal: number;
  cashflow: number;
  df: number;
  pv: number;
};

export type PricingResult = {
  instrument: string;
  price: number;
  premium_discount: number;
  quote_vs_par: string;
  macaulay_duration: number;
  modified_duration: number;
  convexity: number;
  dv01: number;
  closed_form: {
    periodic_payment: number;
    a_angle_n: number;
    s_angle_n: number;
    v_n: number;
    pv_coupons_or_rentals: number;
    pv_principal: number;
    price: number;
  };
  cashflows: PricingCashflow[];
  price_yield_curve: { yield: number; price: number }[];
  structure?: {
    type: string;
    rental: string;
    maturity: string;
    note: string;
  };
};

function decimalRate(value: number): number {
  return value > 1.5 ? value / 100 : value;
}

function priceAtYield(face: number, coupon: number, annualYield: number, periods: number, freq: number): number {
  const perPeriodYield = annualYield / freq;
  const payment = face * coupon / freq;
  let price = 0;
  for (let period = 1; period <= periods; period += 1) {
    const cashflow = payment + (period === periods ? face : 0);
    price += cashflow / (1 + perPeriodYield) ** period;
  }
  return price;
}

function buildPriceYieldCurve(input: PricingInput, periodCount: number): { yield: number; price: number }[] {
  const coupon = decimalRate(input.coupon);
  return Array.from({ length: 81 }, (_, index) => {
    const annualYield = index * 0.0025;
    return {
      yield: Number(annualYield.toFixed(4)),
      price: Number(priceAtYield(input.face, coupon, annualYield, periodCount, input.freq).toFixed(6)),
    };
  });
}

export function priceInstrument(input: PricingInput, kind: "bond" | "sukuk"): PricingResult {
  const { face, years, freq } = input;
  if (
    !Number.isFinite(face) || face <= 0 ||
    !Number.isFinite(years) || years <= 0 ||
    !Number.isInteger(freq) || freq < 1 ||
    !Number.isFinite(input.coupon) || input.coupon < 0 ||
    !Number.isFinite(input.yield) || input.yield < 0
  ) {
    throw new Error("Enter valid non-negative rates, a positive face value, and a positive tenor.");
  }

  const coupon = decimalRate(input.coupon);
  const annualYield = decimalRate(input.yield);
  const periodCount = Math.round(years * freq);
  if (periodCount < 1) throw new Error("Tenor must produce at least one payment period.");

  const periodicYield = annualYield / freq;
  const periodicPayment = face * coupon / freq;
  const vN = 1 / (1 + periodicYield) ** periodCount;
  const annuity = Math.abs(periodicYield) < 1e-12
    ? periodCount
    : (1 - vN) / periodicYield;
  const accumulatedAnnuity = Math.abs(periodicYield) < 1e-12
    ? periodCount
    : ((1 + periodicYield) ** periodCount - 1) / periodicYield;
  const cashflows = Array.from({ length: periodCount }, (_, index): PricingCashflow => {
    const period = index + 1;
    const principal = period === periodCount ? face : 0;
    const cashflow = periodicPayment + principal;
    const df = 1 / (1 + periodicYield) ** period;
    return {
      period,
      time_years: period / freq,
      coupon_or_rental: Number(periodicPayment.toFixed(8)),
      principal,
      cashflow,
      df: Number(df.toFixed(10)),
      pv: Number((cashflow * df).toFixed(8)),
    };
  });
  const price = cashflows.reduce((total, row) => total + row.pv, 0);
  const macaulay = price > 0
    ? cashflows.reduce((total, row) => total + row.time_years * row.pv, 0) / price
    : 0;
  const modified = macaulay / (1 + periodicYield);
  const convexity = price > 0
    ? cashflows.reduce(
        (total, row) => total + row.period * (row.period + 1) * row.cashflow /
          (1 + periodicYield) ** (row.period + 2),
        0,
      ) / (price * freq ** 2)
    : 0;

  const result: PricingResult = {
    instrument: kind === "bond" ? "conventional_bond" : "ijara_sukuk",
    price: Number(price.toFixed(8)),
    premium_discount: Number((price - face).toFixed(8)),
    quote_vs_par: price > face + 1e-8 ? "premium" : price < face - 1e-8 ? "discount" : "par",
    macaulay_duration: Number(macaulay.toFixed(8)),
    modified_duration: Number(modified.toFixed(8)),
    convexity: Number(convexity.toFixed(8)),
    dv01: Number((modified * price / 10000).toFixed(8)),
    closed_form: {
      periodic_payment: Number(periodicPayment.toFixed(8)),
      a_angle_n: Number(annuity.toFixed(10)),
      s_angle_n: Number(accumulatedAnnuity.toFixed(10)),
      v_n: Number(vN.toFixed(10)),
      pv_coupons_or_rentals: Number((periodicPayment * annuity).toFixed(8)),
      pv_principal: Number((face * vN).toFixed(8)),
      price: Number((periodicPayment * annuity + face * vN).toFixed(8)),
    },
    cashflows,
    price_yield_curve: buildPriceYieldCurve(input, periodCount),
  };
  if (kind === "sukuk") {
    result.structure = {
      type: "Ijara",
      rental: "Periodic lease rental = face * rental_rate / freq",
      maturity: "Underlying asset / face value paid at maturity",
      note: "Priced as PV(rentals) + PV(face), identical closed form to a coupon bond.",
    };
  }
  return result;
}
