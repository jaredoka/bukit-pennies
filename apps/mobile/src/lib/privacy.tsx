import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { kvGet, kvSet } from './kvStore';
import { formatMoney } from './format';

// Wise-style amount cloaking: one global eye toggle hides every amount in
// the UI behind dots. Display-only — exports and the server are untouched.

const KEY = 'bukit.privacy';
const MASK = '••••';

interface PrivacyValue {
  hidden: boolean;
  toggle: () => void;
  /** formatMoney that respects the cloak. */
  money: (amount: number | null, currency?: string) => string;
}

const PrivacyContext = createContext<PrivacyValue>({
  hidden: false,
  toggle: () => {},
  money: formatMoney,
});

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    kvGet(KEY).then((v) => setHidden(v === 'hidden'));
  }, []);

  const value: PrivacyValue = {
    hidden,
    toggle: () => {
      setHidden((h) => {
        void kvSet(KEY, h ? 'visible' : 'hidden');
        return !h;
      });
    },
    money: (amount, currency) => (hidden ? MASK : formatMoney(amount, currency)),
  };

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyValue {
  return useContext(PrivacyContext);
}
