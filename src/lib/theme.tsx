import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

type ThemeContextType = {
  theme: Theme;
  isDark: boolean;
  setTheme: (t: Theme) => void;
  setDark: (d: boolean) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const fromStorage = typeof window !== "undefined" ? (localStorage.getItem("theme") as Theme | null) : null;
    return fromStorage ?? "dark";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark"); else root.classList.remove("dark");
    try { localStorage.setItem("theme", theme); } catch { }
  }, [theme]);

  const value = useMemo<ThemeContextType>(() => ({
    theme,
    isDark: theme === "dark",
    setTheme,
    setDark: (d: boolean) => setTheme(d ? "dark" : "light"),
    toggle: () => setTheme(prev => (prev === "dark" ? "light" : "dark")),
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}


