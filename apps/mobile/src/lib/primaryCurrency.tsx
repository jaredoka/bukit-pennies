import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { kvGet, kvSet } from './kvStore';

const KEY = 'bukit.primary_currency';
export const DEFAULT_CURRENCY = 'BND';

export const CURRENCY_OPTIONS = [
  { code: 'BND', label: 'BND — Brunei Dollar' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'MYR', label: 'MYR — Malaysian Ringgit' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
];

interface PrimaryCurrencyValue {
  currency: string;
  setCurrency: (c: string) => void;
}

const Ctx = createContext<PrimaryCurrencyValue>({
  currency: DEFAULT_CURRENCY,
  setCurrency: () => {},
});

export function PrimaryCurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState(DEFAULT_CURRENCY);

  useEffect(() => {
    kvGet(KEY).then((v) => {
      if (v) setCurrencyState(v);
    });
  }, []);

  const value = useMemo<PrimaryCurrencyValue>(
    () => ({
      currency,
      setCurrency: (c) => {
        setCurrencyState(c);
        void kvSet(KEY, c);
      },
    }),
    [currency],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrimaryCurrency() {
  return useContext(Ctx);
}
