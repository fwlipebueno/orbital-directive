import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { setFormattingLocale } from "../lib/format";
import { AppLocale, localeOptions, messages } from "./messages";

const STORAGE_KEY = "orbital-directive-locale";
const defaultLocale: AppLocale = "en-US";

type TranslationParams = Record<string, string | number>;

interface I18nContextValue {
  locale: AppLocale;
  setLocale: (next: AppLocale) => void;
  t: (key: string, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function isLocale(value: string): value is AppLocale {
  return localeOptions.includes(value as AppLocale);
}

function resolveInitialLocale(): AppLocale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && isLocale(stored)) {
    return stored;
  }

  const navigatorLocale = navigator.language;
  if (isLocale(navigatorLocale)) {
    return navigatorLocale;
  }

  if (navigatorLocale.toLowerCase().startsWith("pt")) {
    return "pt-BR";
  }

  return defaultLocale;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template;
  }

  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replaceAll(`{{${key}}}`, String(value));
  }
  return result;
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<AppLocale>(resolveInitialLocale);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState((previous) => {
      if (previous === next) {
        return previous;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
    setFormattingLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, params?: TranslationParams) => {
      const catalog = messages[locale];
      const fallbackCatalog = messages[defaultLocale];
      const message = catalog[key] ?? fallbackCatalog[key] ?? key;
      return interpolate(message, params);
    },
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t
    }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}

