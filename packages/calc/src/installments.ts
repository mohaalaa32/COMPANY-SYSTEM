import type { InstallmentPlan } from './types';
import { formatIQD, roundIraqiCurrency } from './currency';

export interface InstallmentOptions {
  /** Optional administration or partner fee percentage (defaults to 0%) */
  feePct?: number;
}

/**
 * Calculates installment plan with clear Arabic explanation.
 * Deterministic calculation ensuring realistic Iraqi currency denominations.
 */
export function calculateInstallments(
  priceIQD: number,
  months: number,
  downPaymentIQD: number = 0,
  options?: InstallmentOptions
): InstallmentPlan {
  const safePrice = roundIraqiCurrency(Math.max(0, priceIQD || 0), 250);
  const safeMonths = Math.max(1, Math.min(36, Math.round(months || 1)));
  const safeDownPayment = roundIraqiCurrency(
    Math.max(0, Math.min(downPaymentIQD || 0, safePrice)),
    250
  );

  const baseRemaining = Math.max(0, safePrice - safeDownPayment);
  const feeRate = Math.max(0, options?.feePct ?? 0);
  const feeAmount = roundIraqiCurrency(baseRemaining * (feeRate / 100), 250);
  const remainingAmountIQD = baseRemaining + feeAmount;

  let monthlyAmountIQD = 0;
  if (remainingAmountIQD > 0 && safeMonths > 0) {
    // Round monthly amount up to nearest 250 IQD so the customer completes the payment accurately
    monthlyAmountIQD = Math.ceil(remainingAmountIQD / safeMonths / 250) * 250;
  }

  const downText =
    safeDownPayment > 0
      ? `دفعة مقدمة قدرها ${formatIQD(safeDownPayment)}، `
      : 'بدون دفعة مقدمة، ';

  const feeText = feeAmount > 0 ? ` (شامل رسوم إدارية ${formatIQD(feeAmount)})` : '';

  const breakdownAr =
    `السعر الإجمالي: ${formatIQD(safePrice)}، ${downText}` +
    `المبلغ المتبقي: ${formatIQD(remainingAmountIQD)}${feeText} مقسم على ${safeMonths} أشهر، ` +
    `القسط الشهري: ${formatIQD(monthlyAmountIQD)}.`;

  return {
    totalPriceIQD: safePrice,
    downPaymentIQD: safeDownPayment,
    months: safeMonths,
    remainingAmountIQD,
    monthlyAmountIQD,
    breakdownAr,
  };
}
