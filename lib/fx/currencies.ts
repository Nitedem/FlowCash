export type CurrencyCode = string;

export const CURRENCIES = [
  ['XAF', 'Franc CFA BEAC', 'FCFA', '🇨🇲'],
  ['XOF', 'Franc CFA BCEAO', 'F CFA', '🌍'],
  ['EUR', 'Euro', '€', '🇪🇺'],
  ['USD', 'Dollar américain', '$', '🇺🇸'],
  ['GBP', 'Livre sterling', '£', '🇬🇧'],
  ['NGN', 'Naira nigérian', '₦', '🇳🇬'],
  ['GHS', 'Cedi ghanéen', 'GH₵', '🇬🇭'],
  ['KES', 'Shilling kényan', 'KSh', '🇰🇪'],
  ['ZAR', 'Rand sud-africain', 'R', '🇿🇦'],
  ['MAD', 'Dirham marocain', 'د.م.', '🇲🇦'],
  ['CNY', 'Yuan chinois', '¥', '🇨🇳'],
  ['JPY', 'Yen japonais', '¥', '🇯🇵'],
  ['CAD', 'Dollar canadien', 'C$', '🇨🇦'],
  ['CHF', 'Franc suisse', 'CHF', '🇨🇭'],
  ['AED', 'Dirham des Émirats arabes unis', 'د.إ', '🇦🇪'],
] as const;

export const CURRENCY_MAP = Object.fromEntries(
  CURRENCIES.map(([code, name, symbol, flag]) => [code, { code, name, symbol, flag }]),
) as Record<string, { code: string; name: string; symbol: string; flag: string }>;

export function isSupportedCurrency(value: string): boolean {
  return Boolean(CURRENCY_MAP[value]);
}
