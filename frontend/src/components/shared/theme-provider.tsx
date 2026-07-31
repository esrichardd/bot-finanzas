"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = Exclude<Theme, "system">;

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  themes: Theme[];
}

const THEME_STORAGE_KEY = "theme";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function getResolvedTheme(
  theme: Theme,
  systemTheme: ResolvedTheme,
): ResolvedTheme {
  return theme === "system" ? systemTheme : theme;
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
}

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "system",
  enableSystem = true,
}: {
  children: ReactNode;
  attribute?: "class" | `data-${string}`;
  defaultTheme?: Theme;
  enableSystem?: boolean;
}) {
  const theme = useSyncExternalStore(
    (onChange) => {
      const notify = () => onChange();
      window.addEventListener("storage", notify);
      window.addEventListener("theme-change", notify);
      return () => {
        window.removeEventListener("storage", notify);
        window.removeEventListener("theme-change", notify);
      };
    },
    () => {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      return isTheme(storedTheme) ? storedTheme : defaultTheme;
    },
    () => defaultTheme,
  );

  const systemTheme = useSyncExternalStore(
    (onChange) => {
      if (!enableSystem) return () => {};

      const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    },
    () => (enableSystem ? getSystemTheme() : "light"),
    (): ResolvedTheme => "light",
  );

  const setTheme = useCallback((nextTheme: Theme) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    window.dispatchEvent(new Event("theme-change"));
  }, []);

  useEffect(() => {
    const resolvedTheme = getResolvedTheme(
      enableSystem ? theme : theme === "dark" ? "dark" : "light",
      systemTheme,
    );
    const root = document.documentElement;

    if (attribute === "class") {
      root.classList.remove("light", "dark");
      root.classList.add(resolvedTheme);
    } else {
      root.setAttribute(attribute, resolvedTheme);
    }
    root.style.colorScheme = resolvedTheme;
  }, [attribute, enableSystem, systemTheme, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme: getResolvedTheme(
        enableSystem ? theme : theme === "dark" ? "dark" : "light",
        systemTheme,
      ),
      setTheme,
      themes: enableSystem ? ["light", "dark", "system"] : ["light", "dark"],
    }),
    [enableSystem, setTheme, systemTheme, theme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
