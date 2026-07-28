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
    country: 'United States',
    flag: '🇺🇸',
    currency: 'USD',
    symbol: '$',
    rate: 1.0,
    preferredProviders: ['STRIPE'],
    locale: 'en-US',
  },
  {
    country: 'Nigeria',
    flag: '🇳🇬',
    currency: 'NGN',
    symbol: '₦',
    rate: 1600.0,
    preferredProviders: ['PAYSTACK', 'OPAY', 'FLUTTERWAVE'],
    locale: 'en-NG',
  },
  {
    country: 'United Kingdom',
    flag: '🇬🇧',
    currency: 'GBP',
    symbol: '£',
    rate: 0.78,
    preferredProviders: ['STRIPE'],
    locale: 'en-GB',
  },
  {
    country: 'European Union',
    flag: '🇪🇺',
    currency: 'EUR',
    symbol: '€',
    rate: 0.92,
    preferredProviders: ['STRIPE'],
    locale: 'de-DE',
  },
  {
    country: 'Canada',
    flag: '🇨🇦',
    currency: 'CAD',
    symbol: 'CA$',
    rate: 1.36,
    preferredProviders: ['STRIPE'],
    locale: 'en-CA',
  },
  {
    country: 'Kenya',
    flag: '🇰🇪',
    currency: 'KES',
    symbol: 'KSh',
    rate: 130.0,
    preferredProviders: ['PAYSTACK', 'FLUTTERWAVE'],
    locale: 'en-KE',
  },
  {
    country: 'Ghana',
    flag: '🇬🇭',
    currency: 'GHS',
    symbol: 'GH₵',
    rate: 15.0,
    preferredProviders: ['PAYSTACK', 'FLUTTERWAVE'],
    locale: 'en-GH',
  },
  {
    country: 'South Africa',
    flag: '🇿🇦',
    currency: 'ZAR',
    symbol: 'R',
    rate: 18.5,
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
        c.currency === currencyOrCountry ||
        c.country.toLowerCase() === currencyOrCountry.toLowerCase()
    ) || DEFAULT_COUNTRY
  );
}

/**
 * Convert a USD price to the target currency amount.
 */
export function convertFromUSD(amountUSD: number, currencyCode: string): number {
  const option = getCountryOption(currencyCode);
  return amountUSD * option.rate;
}

/**
 * Format a price for display.
 * @param amountUSD  - Base amount in USD (as stored in DB)
 * @param currencyCode - Target currency code (e.g. 'NGN', 'GBP')
 */
export function formatPrice(amountUSD: number, currencyCode: string): string {
  const option = getCountryOption(currencyCode);
  const converted = amountUSD * option.rate;

  // Use compact notation only for very large numbers (like NGN)
  const isLargeRate = option.rate >= 100;

  try {
    return new Intl.NumberFormat(option.locale, {
      style: 'currency',
      currency: option.currency,
      minimumFractionDigits: isLargeRate ? 0 : 2,
      maximumFractionDigits: isLargeRate ? 0 : 2,
    }).format(converted);
  } catch {
    // Fallback if Intl is not supported
    return `${option.symbol}${converted.toFixed(isLargeRate ? 0 : 2)}`;
  }
}

/**
 * Format already-converted amount (no USD conversion applied).
 */
export function formatLocalAmount(amount: number, currencyCode: string): string {
  const option = getCountryOption(currencyCode);
  const isLargeRate = option.rate >= 100;
  try {
    return new Intl.NumberFormat(option.locale, {
      style: 'currency',
      currency: option.currency,
      minimumFractionDigits: isLargeRate ? 0 : 2,
      maximumFractionDigits: isLargeRate ? 0 : 2,
    }).format(amount);
  } catch {
    return `${option.symbol}${amount.toFixed(isLargeRate ? 0 : 2)}`;
  }
}
