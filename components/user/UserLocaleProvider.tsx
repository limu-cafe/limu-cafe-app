'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type UserLocale = 'ja' | 'en';

type UserLocaleContextValue = {
  locale: UserLocale;
  setLocale: (locale: UserLocale) => void;
  toggleLocale: () => void;
};

const STORAGE_KEY = 'limu-user-locale';

const UserLocaleContext = createContext<UserLocaleContextValue | null>(null);

export function UserLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<UserLocale>('ja');

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(STORAGE_KEY);
    if (storedLocale === 'ja' || storedLocale === 'en') {
      setLocale(storedLocale);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      toggleLocale: () => setLocale((current) => (current === 'ja' ? 'en' : 'ja')),
    }),
    [locale]
  );

  return <UserLocaleContext.Provider value={value}>{children}</UserLocaleContext.Provider>;
}

export function useUserLocale() {
  const context = useContext(UserLocaleContext);
  if (!context) {
    throw new Error('useUserLocale must be used within UserLocaleProvider');
  }
  return context;
}
