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
const CONVERT_KEY = 'bukit.convert_currencies';
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
  /**
   * Fold non-primary currencies into `currency` at monthly reference rates.
   * Off by default: with it off the app behaves exactly as it did before
   * conversion existed, which is the only safe default for a number that
   * people read as "what I spent".
   */
  convertOthers: boolean;
  setConvertOthers: (on: boolean) => void;
}

const Ctx = createContext<PrimaryCurrencyValue>({
  currency: DEFAULT_CURRENCY,
  setCurrency: () => {},
  convertOthers: false,
  setConvertOthers: () => {},
});

export function PrimaryCurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState(DEFAULT_CURRENCY);
  const [convertOthers, setConvertState] = useState(false);

  useEffect(() => {
    void kvGet(KEY).then((v) => {
      if (v) setCurrencyState(v);
    });
    void kvGet(CONVERT_KEY).then((v) => {
      if (v) setConvertState(v === '1');
    });
  }, []);

  const value = useMemo<PrimaryCurrencyValue>(
    () => ({
      currency,
      setCurrency: (c) => {
        setCurrencyState(c);
        void kvSet(KEY, c);
      },
      convertOthers,
      setConvertOthers: (on) => {
        setConvertState(on);
        void kvSet(CONVERT_KEY, on ? '1' : '0');
      },
    }),
    [currency, convertOthers],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrimaryCurrency() {
  return useContext(Ctx);
}
