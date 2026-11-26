import { createContext, useContext, useEffect, useMemo, useState } from "react";

const KEY = "h5-blog-theme";
const ThemeContext = createContext(null);

function readPref() {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Ignore private-mode storage failures.
  }
  return "system";
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }) {
  const [pref, setPref] = useState(() => (typeof window === "undefined" ? "system" : readPref()));
  const [systemDark, setSystemDark] = useState(() => (typeof window === "undefined" ? false : systemPrefersDark()));

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolved = pref === "dark" || (pref === "system" && systemDark) ? "dark" : "light";

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePref = pref;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#12100e" : "#F7F2EA");
    window.dispatchEvent(new CustomEvent("blog-theme", { detail: resolved }));
  }, [pref, resolved]);

  const value = useMemo(() => {
    const cycle = () => {
      const next = pref === "system" ? "dark" : pref === "dark" ? "light" : "system";
      setPref(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // The choice still applies for this visit.
      }
    };
    const label = pref === "dark" ? "深色" : pref === "light" ? "浅色" : "跟随系统";
    return { pref, resolved, label, cycle };
  }, [pref, resolved]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (value) return value;
  return { pref: "system", resolved: "light", label: "跟随系统", cycle: () => {} };
}
