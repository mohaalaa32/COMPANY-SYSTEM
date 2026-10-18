/**
 * Deterministic Currency Rounding and Conversion for Iraqi Dinar (IQD)
 * No float errors: all final IQD values are integer multiples of the configured step.
 */

export type RoundingStep = 250 | 500 | 1000;

/**
 * Rounds an amount in IQD to the nearest realistic cash step (250, 500, or 1000 IQD).
 * Guarantees integer output. Non-positive numbers return 0.
 */
export function roundIraqiCurrency(amount: number, step: RoundingStep = 250): number {
  if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount) || amount <= 0) {
    return 0;
  }
  const validStep = step === 500 || step === 1000 ? step : 250;
  return Math.round(amount / validStep) * validStep;
}

/**
 * Converts between IQD and USD with deterministic rounding.
 * Default official / market rate can be supplied per call.
 */
export function convertCurrency(
  amount: number,
  exchangeRate: number,
  target: 'IQD' | 'USD'
): number {
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return 0;
  if (typeof exchangeRate !== 'number' || isNaN(exchangeRate) || exchangeRate <= 0) return 0;

  if (target === 'IQD') {
    // amount is in USD, multiply by rate and round to nearest 250 IQD
    return roundIraqiCurrency(amount * exchangeRate, 250);
  } else {
    // amount is in IQD, divide by rate and round to nearest USD integer
    return Math.round(amount / exchangeRate);
  }
}

/**
 * Formats integer IQD amount with standard commas and Arabic currency symbol
 * e.g. 95000 -> "95,000 د.ع"
 */
export function formatIQD(amount: number): string {
  const safe = Math.max(0, Math.round(amount || 0));
  return `${safe.toLocaleString('en-US')} د.ع`;
}
