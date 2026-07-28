/**
 * CurrencyContext.tsx
 * Global state for the active user country/currency preference.
 *
 * Priority order for active currency:
 *   1. Saved preference in SecureStore (persists across restarts)
 *   2. Country field on authenticated userInfo (from /auth/me)
 *   3. Default: United States / USD
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from '../utils/storage';
import {
  SUPPORTED_COUNTRIES,
  DEFAULT_COUNTRY,
  getCountryOption,
  formatPrice,
  convertFromUSD,
  CountryOption,
} from '../utils/currency';

interface CurrencyContextValue {
  /** The currently active country option */
  activeCountry: CountryOption;
  /** Shorthand: active currency code e.g. "NGN" */
  currency: string;
  /** Shorthand: active currency symbol e.g. "₦" */
  symbol: string;
  /** Format a USD base-price into the active currency display string */
  fmt: (amountUSD: number) => string;
  /** Convert USD amount to active currency number (for passing to payment API) */
  toLocal: (amountUSD: number) => number;
  /** Change the active country/currency — persists to SecureStore */
  setCountry: (countryName: string) => Promise<void>;
  /** All supported country options */
  countries: CountryOption[];
}

const CurrencyContext = createContext<CurrencyContextValue>({
  activeCountry: DEFAULT_COUNTRY,
  currency: DEFAULT_COUNTRY.currency,
  symbol: DEFAULT_COUNTRY.symbol,
  fmt: (v) => `$${v.toFixed(2)}`,
  toLocal: (v) => v,
  setCountry: async () => {},
  countries: SUPPORTED_COUNTRIES,
});

export const useCurrency = () => useContext(CurrencyContext);

export const CurrencyProvider = ({
  children,
  userCountry,
}: {
  children: React.ReactNode;
  /** Country name from the authenticated user profile (optional) */
  userCountry?: string | null;
}) => {
  const [activeCountry, setActiveCountry] = useState<CountryOption>(DEFAULT_COUNTRY);

  // Initialise from SecureStore or userCountry on mount
  useEffect(() => {
    const load = async () => {
      try {
        const stored = await SecureStore.getItemAsync('userCurrency');
        if (stored) {
          const found = getCountryOption(stored);
          setActiveCountry(found);
        } else if (userCountry) {
          const found = getCountryOption(userCountry);
          setActiveCountry(found);
        }
      } catch {
        // ignore
      }
    };
    load();
  }, [userCountry]);

  // When the profile's country changes (e.g. after login), sync it
  useEffect(() => {
    if (!userCountry) return;
    SecureStore.getItemAsync('userCurrency').then((stored) => {
      // Only auto-sync if user hasn't manually overridden
      if (!stored) {
        const found = getCountryOption(userCountry);
        setActiveCountry(found);
      }
    });
  }, [userCountry]);

  const setCountry = useCallback(async (countryName: string) => {
    const found = getCountryOption(countryName);
    setActiveCountry(found);
    await SecureStore.setItemAsync('userCurrency', found.currency);
  }, []);

  const fmt = useCallback(
    (amountUSD: number) => formatPrice(amountUSD, activeCountry.currency),
    [activeCountry]
  );

  const toLocal = useCallback(
    (amountUSD: number) => convertFromUSD(amountUSD, activeCountry.currency),
    [activeCountry]
  );

  return (
    <CurrencyContext.Provider
      value={{
        activeCountry,
        currency: activeCountry.currency,
        symbol: activeCountry.symbol,
        fmt,
        toLocal,
        setCountry,
        countries: SUPPORTED_COUNTRIES,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};
