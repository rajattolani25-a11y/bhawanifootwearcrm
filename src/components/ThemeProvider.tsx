import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
type ThemeState = { mode: ThemeMode; setMode: (mode: ThemeMode) => void; resolved: "light" | "dark" };

const ThemeContext = createContext<ThemeState>({ mode: "system", setMode: () => {}, resolved: "light" });
const THEME_KEY = "solestack-theme";

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") setModeState(saved);
    } catch { /* A blocked preference store must not crash the shop or public catalog. */ }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next = mode === "system" ? systemTheme() : mode;
      document.documentElement.classList.toggle("dark", next === "dark");
      document.documentElement.style.colorScheme = next;
      setResolved(next);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode]);

  const setMode = (next: ThemeMode) => {
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Keep a working session-only theme. */ }
    setModeState(next);
  };

  return <ThemeContext.Provider value={{ mode, setMode, resolved }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
