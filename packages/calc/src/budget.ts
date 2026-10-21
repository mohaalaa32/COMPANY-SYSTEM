import type {
  Product,
  BudgetMatchResult,
  RecommendedBundle,
} from './types';
import { formatIQD, roundIraqiCurrency } from './currency';
import { scoreProduct } from './scoring';
import { verifyMargin } from './margin';

export interface BudgetOptions {
  /** Target minimum profit margin percentage (default: 5%) */
  minMarginPct?: number;
  /** Percentage discount applied to the bundle (default: 5%) */
  bundleDiscountPct?: number;
  /** Maximum number of direct matches to return (default: 10) */
  maxDirectMatches?: number;
}

/**
 * Helper to safely extract effective customer selling price in IQD.
 * Never uses costIQD.
 */
function getSellingPriceIQD(product: Product): number {
  return roundIraqiCurrency(
    product.salePriceIQD ??
      product.basePriceIQD ??
      (product as unknown as { priceIQD?: number }).priceIQD ??
      0,
    250
  );
}

/**
 * Checks whether a product is currently available in stock.
 */
function isProductInStock(product: Product): boolean {
  if (product.isAvailable === false) return false;
  if (typeof product.totalStock === 'number' && product.totalStock <= 0) return false;
  return true;
}

/**
 * Identifies if a product is a smartphone/phone.
 */
function isPhone(product: Product): boolean {
  if (product.category === 'accessory' || product.category === 'audio' || product.category === 'wearable') {
    return false;
  }
  if (product.category === 'phone') {
    return true;
  }
  const combined = `${product.nameAr} ${product.nameEn} ${product.tags?.join(' ') ?? ''}`.toLowerCase();
  return /هاتف|موبايل|جوال|phone/i.test(combined);
}

/**
 * Identifies if a product is a protective cover/case.
 */
function isCover(product: Product): boolean {
  if (product.category && product.category !== 'accessory') {
    return false;
  }
  const combined = `${product.nameAr} ${product.nameEn} ${product.tags?.join(' ') ?? ''}`.toLowerCase();
  return /كفر|حافظة|جراب|بيت|cover|case|protection/i.test(combined);
}

/**
 * Identifies if a product is a charger/power adapter.
 */
function isCharger(product: Product): boolean {
  if (product.category && product.category !== 'accessory') {
    return false;
  }
  const combined = `${product.nameAr} ${product.nameEn} ${product.tags?.join(' ') ?? ''}`.toLowerCase();
  return /شاحن|شاحنة|راس شاحن|محول|charger|adapter|power delivery/i.test(combined);
}

/**
 * Solves knapsack-style bundle optimization:
 * Finds the optimal combination of (Phone + Cover [+ Charger]) that stays within budgetIQD,
 * maximizes customer value, applies bundle discount while strictly preserving minimum margin.
 *
 * Notice: docs/CONTRACTS.md §3 mandates that `cover: Product` is required in RecommendedBundle,
 * while `charger?: Product` is optional.
 */
function findOptimalBundle(
  phones: Product[],
  covers: Product[],
  chargers: Product[],
  budgetIQD: number,
  preference?: string,
  options?: BudgetOptions
): RecommendedBundle | undefined {
  if (phones.length === 0 || covers.length === 0 || budgetIQD <= 0) {
    return undefined;
  }

  const discountPct = Math.max(0, Math.min(25, options?.bundleDiscountPct ?? 5));
  const minMarginPct = options?.minMarginPct ?? 5;

  let bestBundle: RecommendedBundle | undefined;
  let bestScore = -1;

  for (const phone of phones) {
    const phonePrice = getSellingPriceIQD(phone);
    if (phonePrice > budgetIQD) continue;

    for (const cover of covers) {
      const coverPrice = getSellingPriceIQD(cover);

      // Check combination with each charger, as well as without charger
      const chargerCandidates: Array<Product | undefined> = chargers.length > 0 ? [...chargers, undefined] : [undefined];

      for (const charger of chargerCandidates) {
        const chargerPrice = charger ? getSellingPriceIQD(charger) : 0;
        const totalBeforeDiscountIQD = roundIraqiCurrency(phonePrice + coverPrice + chargerPrice, 250);

        // Calculate potential bundle discount
        let bundleDiscountIQD = roundIraqiCurrency(totalBeforeDiscountIQD * (discountPct / 100), 250);
        let totalPriceIQD = totalBeforeDiscountIQD - bundleDiscountIQD;

        // Margin safety verification:
        // Combined cost: phone.costIQD + cover.costIQD + charger.costIQD
        const totalCostIQD = (phone.costIQD || 0) + (cover.costIQD || 0) + (charger ? charger.costIQD || 0 : 0);
        const marginCheck = verifyMargin(totalCostIQD, totalPriceIQD, minMarginPct);

        if (!marginCheck.isSafe) {
          // If discount breaches minimum margin, reduce discount to recommended safe minimum price
          if (marginCheck.recommendedMinPriceIQD <= totalBeforeDiscountIQD) {
            totalPriceIQD = marginCheck.recommendedMinPriceIQD;
            bundleDiscountIQD = totalBeforeDiscountIQD - totalPriceIQD;
          } else {
            // Breaches min margin even at full price! Skip unsafe bundle.
            continue;
          }
        }

        // Must strictly fit inside budgetIQD
        if (totalPriceIQD > budgetIQD) {
          continue;
        }

        // Compute bundle fitness score:
        // Phone score (weighted by budget, preference, margin)
        const phoneScore = scoreProduct(
          phone,
          { budgetFit: 0.45, usageFit: 0.35, stock: 0.1, margin: 0.1 },
          { targetBudgetIQD: budgetIQD, targetUsageTag: preference }
        );

        // Preference match bonus if accessory matches phone brand
        const phoneBrand = (phone.brand || '').toLowerCase().trim();
        const coverBrandBonus = phoneBrand && (cover.brand || '').toLowerCase().includes(phoneBrand) ? 5 : 0;
        const chargerBrandBonus = charger && phoneBrand && (charger.brand || '').toLowerCase().includes(phoneBrand) ? 5 : 0;

        // Bonus for offering a complete package with charger
        const chargerBonus = charger ? 10 : 0;

        // Proximity bonus: bundles utilizing more of the budget safely get higher value score
        const budgetUtilizationRatio = totalPriceIQD / budgetIQD;
        const utilizationBonus = budgetUtilizationRatio * 15;

        const compositeScore = phoneScore + coverBrandBonus + chargerBrandBonus + chargerBonus + utilizationBonus;

        if (compositeScore > bestScore) {
          bestScore = compositeScore;
          bestBundle = {
            phone,
            cover,
            ...(charger ? { charger } : {}),
            totalPriceIQD,
            savingsIQD: bundleDiscountIQD,
            totalBeforeDiscountIQD,
            bundleDiscountIQD,
          };
        }
      }
    }
  }

  return bestBundle;
}

/**
 * Matches products and bundles against customer budget and preferences.
 * Implements ICalcEngine.matchBudget strictly following docs/CONTRACTS.md §3.
 *
 * Rules:
 * 1. costIQD must NEVER be exposed in explanationAr or customer-facing data.
 * 2. cover is required in recommendedBundle; charger is optional.
 * 3. IQD amounts are rounded to realistic 250 IQD multiples.
 */
export function matchBudget(
  products: Product[],
  budgetIQD: number,
  preference?: string,
  options?: BudgetOptions
): BudgetMatchResult {
  const safeBudget = typeof budgetIQD === 'number' && !isNaN(budgetIQD) ? Math.max(0, budgetIQD) : 0;

  if (!products || !Array.isArray(products) || products.length === 0) {
    return {
      directMatches: [],
      recommendedBundle: undefined,
      explanationAr: 'لا تتوفر منتجات حالياً في المخزون للمطابقة.',
      budgetIQD: safeBudget,
      cheapestAvailableIQD: null,
      budgetDeficitIQD: null,
    };
  }

  if (safeBudget <= 0) {
    const inStock = products.filter(isProductInStock);
    const cheapest = inStock.length > 0
      ? Math.min(...inStock.map(getSellingPriceIQD).filter((p) => p > 0))
      : null;

    return {
      directMatches: [],
      recommendedBundle: undefined,
      explanationAr: 'يرجى تحديد ميزانية صالحة بالدينار العراقي لعرض الخيارات المتاحة.',
      budgetIQD: 0,
      cheapestAvailableIQD: cheapest,
      budgetDeficitIQD: cheapest,
    };
  }

  const availableProducts = products.filter(isProductInStock);

  // Categorize available items
  const phones = availableProducts.filter(isPhone);
  const covers = availableProducts.filter(isCover);
  const chargers = availableProducts.filter(isCharger);

  // Find direct matches within budget
  const directCandidates = availableProducts.filter((p) => {
    const price = getSellingPriceIQD(p);
    return price > 0 && price <= safeBudget;
  });

  // Rank direct matches using scoring algorithm
  const rankedDirectMatches = [...directCandidates].sort((a, b) => {
    const scoreA = scoreProduct(
      a,
      { budgetFit: 0.4, usageFit: 0.35, stock: 0.15, margin: 0.1 },
      { targetBudgetIQD: safeBudget, targetUsageTag: preference }
    );
    const scoreB = scoreProduct(
      b,
      { budgetFit: 0.4, usageFit: 0.35, stock: 0.15, margin: 0.1 },
      { targetBudgetIQD: safeBudget, targetUsageTag: preference }
    );
    return scoreB - scoreA;
  });

  const maxMatches = options?.maxDirectMatches ?? 10;
  const directMatches = rankedDirectMatches.slice(0, maxMatches);

  // Find optimal bundle (phone + cover [+ charger])
  const recommendedBundle = findOptimalBundle(
    phones,
    covers,
    chargers,
    safeBudget,
    preference,
    options
  );

  // Compute deficit if no phone fits the budget
  let cheapestAvailableIQD: number | null = null;
  let budgetDeficitIQD: number | null = null;

  const phonePrices = phones.map(getSellingPriceIQD).filter((p) => p > 0);
  if (phonePrices.length > 0) {
    cheapestAvailableIQD = Math.min(...phonePrices);
    if (safeBudget < cheapestAvailableIQD) {
      budgetDeficitIQD = cheapestAvailableIQD - safeBudget;
    }
  } else if (availableProducts.length > 0) {
    const allPrices = availableProducts.map(getSellingPriceIQD).filter((p) => p > 0);
    if (allPrices.length > 0) {
      cheapestAvailableIQD = Math.min(...allPrices);
      if (safeBudget < cheapestAvailableIQD) {
        budgetDeficitIQD = cheapestAvailableIQD - safeBudget;
      }
    }
  }

  // Construct Arabic explanation without ever leaking costIQD
  let explanationAr = '';

  if (budgetDeficitIQD && budgetDeficitIQD > 0 && cheapestAvailableIQD) {
    explanationAr =
      `الميزانية المحددة (${formatIQD(safeBudget)}) أقل من سعر أرخص هاتف متوفر لدينا حالياً (${formatIQD(cheapestAvailableIQD)}). ` +
      `الفارق هو ${formatIQD(budgetDeficitIQD)}. يسعدنا تقديم خطة أقساط مريحة تناسبك بدون فوائد معقدة.`;
  } else if (recommendedBundle) {
    const bundleItems = [
      recommendedBundle.phone.nameAr,
      recommendedBundle.cover.nameAr,
      recommendedBundle.charger ? recommendedBundle.charger.nameAr : null,
    ]
      .filter(Boolean)
      .join(' + ');

    const savingsText =
      recommendedBundle.savingsIQD > 0
        ? ` مع توفير خاص قدره ${formatIQD(recommendedBundle.savingsIQD)}`
        : '';

    explanationAr =
      `ضمن ميزانيتك البالغة ${formatIQD(safeBudget)}، نقترح لك الحزمة المتكاملة الأفضل: (${bundleItems}) ` +
      `بسعر إجمالي ${formatIQD(recommendedBundle.totalPriceIQD)}${savingsText}.`;
  } else if (directMatches.length > 0 && directMatches[0]) {
    const topMatch = directMatches[0];
    explanationAr =
      `تم العثور على ${directMatches.length} خيارات متوافقة مع ميزانيتك (${formatIQD(safeBudget)}). ` +
      `أفضل خيار مرشح لك هو ${topMatch.nameAr} بسعر ${formatIQD(getSellingPriceIQD(topMatch))}.`;
  } else {
    explanationAr = `لم نتمكن من العثور على خيارات مطابقة تماماً للميزانية ${formatIQD(safeBudget)}.`;
  }

  return {
    directMatches,
    recommendedBundle,
    explanationAr,
    budgetIQD: safeBudget,
    cheapestAvailableIQD,
    budgetDeficitIQD,
  };
}
