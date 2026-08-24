/**
 * currency.ts
 * Supported countries, currencies, and price formatting utilities.
 * Base prices in the DB are stored in USD.
 * All conversion rates are relative to 1 USD.
 */

export interface CountryOption {
  country: string;
  flag: string;
  currency: string;
  symbol: string;
  /** Exchange rate relative to 1 USD */
  rate: number;
  /** Preferred payment provider(s) for this country */
  preferredProviders: string[];
  /** Locale string for Intl.NumberFormat */
  locale: string;
}

export const SUPPORTED_COUNTRIES: CountryOption[] = [
  {
    country: 'Nigeria',
    flag: '🇳🇬',
    currency: 'NGN',
    symbol: '₦',
    rate: 1.0,
    preferredProviders: ['PAYSTACK', 'OPAY', 'FLUTTERWAVE'],
    locale: 'en-NG',
  },
  {
    country: 'United States',
    flag: '🇺🇸',
    currency: 'USD',
    symbol: '$',
    rate: 1 / 1600.0,
    preferredProviders: ['STRIPE'],
    locale: 'en-US',
  },
  {
    country: 'United Kingdom',
    flag: '🇬🇧',
    currency: 'GBP',
    symbol: '£',
    rate: 1 / 2050.0,
    preferredProviders: ['STRIPE'],
    locale: 'en-GB',
  },
  {
    country: 'European Union',
    flag: '🇪🇺',
    currency: 'EUR',
    symbol: '€',
    rate: 1 / 1750.0,
    preferredProviders: ['STRIPE'],
    locale: 'de-DE',
  },
  {
    country: 'Canada',
    flag: '🇨🇦',
    currency: 'CAD',
    symbol: 'CA$',
    rate: 1 / 1180.0,
    preferredProviders: ['STRIPE'],
    locale: 'en-CA',
  },
  {
    country: 'Kenya',
    flag: '🇰🇪',
    currency: 'KES',
    symbol: 'KSh',
    rate: 130.0 / 1600.0,
    preferredProviders: ['PAYSTACK', 'FLUTTERWAVE'],
    locale: 'en-KE',
  },
  {
    country: 'Ghana',
    flag: '🇬🇭',
    currency: 'GHS',
    symbol: 'GH₵',
    rate: 15.0 / 1600.0,
    preferredProviders: ['PAYSTACK', 'FLUTTERWAVE'],
    locale: 'en-GH',
  },
  {
    country: 'South Africa',
    flag: '🇿🇦',
    currency: 'ZAR',
    symbol: 'R',
    rate: 18.5 / 1600.0,
    preferredProviders: ['PAYSTACK'],
    locale: 'en-ZA',
  },
];

/** Default/fallback country */
export const DEFAULT_COUNTRY = SUPPORTED_COUNTRIES[0];

/**
 * Look up a CountryOption by currency code or country name.
 */
export function getCountryOption(currencyOrCountry: string): CountryOption {
  return (
    SUPPORTED_COUNTRIES.find(
      (c) =>
        c.currency.toLowerCase() === (currencyOrCountry || '').toLowerCase() ||
        c.country.toLowerCase() === (currencyOrCountry || '').toLowerCase()
    ) || DEFAULT_COUNTRY
  );
}

/**
 * Convert a base (NGN) price to the target currency amount.
 */
export function convertFromUSD(amountNGN: number, currencyCode: string): number {
  const option = getCountryOption(currencyCode);
  return (amountNGN || 0) * (option.rate || 1.0);
}

/**
 * Format a price for display in the target currency (defaults to NGN ₦).
 * @param amountNGN - Base amount in NGN as stored in DB
 * @param currencyCode - Target currency code (e.g. 'NGN', 'USD', 'GBP')
 */
export function formatPrice(amountNGN: number, currencyCode: string = 'NGN'): string {
  const option = getCountryOption(currencyCode || 'NGN');
  const converted = (amountNGN || 0) * (option.rate || 1.0);
  const isNGN = option.currency === 'NGN';

  try {
    return new Intl.NumberFormat(option.locale, {
      style: 'currency',
      currency: option.currency,
      minimumFractionDigits: isNGN ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(converted);
  } catch {
    return `${option.symbol}${Math.round(converted).toLocaleString()}`;
  }
}

/**
 * Format already-converted amount (no conversion applied).
 */
export function formatLocalAmount(amount: number, currencyCode: string = 'NGN'): string {
  const option = getCountryOption(currencyCode || 'NGN');
  const isNGN = option.currency === 'NGN';
  try {
    return new Intl.NumberFormat(option.locale, {
      style: 'currency',
      currency: option.currency,
      minimumFractionDigits: isNGN ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  } catch {
    return `${option.symbol}${Math.round(amount || 0).toLocaleString()}`;
  }
}
