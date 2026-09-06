import { isSupportedCurrency } from '@/lib/fx/currencies';

export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.frankfurter.dev/v2';
const MAX_AMOUNT = 1_000_000_000_000;

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = (searchParams.get('from') || '').trim().toUpperCase();
  const to = (searchParams.get('to') || '').trim().toUpperCase();
  const amountRaw = (searchParams.get('amount') || '').trim();

  if (!isSupportedCurrency(from) || !isSupportedCurrency(to)) {
    return jsonError('Devise non prise en charge.', 400);
  }

  if (from === to) {
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      return jsonError('Montant invalide.', 400);
    }
    return Response.json({ from, to, amount, rate: 1, convertedAmount: amount, source: 'identity' });
  }

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return jsonError('Montant invalide.', 400);
  }

  try {
    const upstream = await fetch(`${API_BASE}/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!upstream.ok) {
      return jsonError('Taux de change indisponible pour cette paire.', 422);
    }

    const quote = (await upstream.json()) as { date?: string; base?: string; quote?: string; rate?: number };
    if (!quote.rate || !Number.isFinite(quote.rate) || quote.rate <= 0) {
      return jsonError('Taux de change invalide reçu de la source.', 502);
    }

    return Response.json({
      from,
      to,
      amount,
      rate: quote.rate,
      convertedAmount: amount * quote.rate,
      rateDate: quote.date ?? null,
      source: 'frankfurter',
      indicative: true,
      executable: false,
    });
  } catch {
    return jsonError('Service de taux temporairement indisponible.', 503);
  }
}
