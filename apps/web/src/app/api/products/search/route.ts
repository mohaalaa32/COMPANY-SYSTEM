import { NextResponse, type NextRequest } from 'next/server';
import { validatePriceRange } from '../../../../lib/customer-search';
import { searchCustomerCatalog } from '../../../../lib/demo-data';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get('q') ?? undefined;
  const brand = searchParams.get('brand') ?? undefined;
  const minRaw = searchParams.get('minPrice') ?? '';
  const maxRaw = searchParams.get('maxPrice') ?? '';
  const inStockParam = searchParams.get('inStock');
  const inStockOnly = inStockParam === '1' || inStockParam === 'true';

  const priceValidation = validatePriceRange(minRaw, maxRaw);
  if (!priceValidation.valid) {
    return NextResponse.json(
      {
        errorAr: priceValidation.errorAr ?? 'نطاق السعر المدخل غير صالح.',
      },
      { status: 400 }
    );
  }

  const response = await searchCustomerCatalog({
    query,
    brand,
    minPriceIQD: priceValidation.minPriceIQD,
    maxPriceIQD: priceValidation.maxPriceIQD,
    inStockOnly,
  });

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
