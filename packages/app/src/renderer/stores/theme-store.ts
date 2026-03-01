import { create } from "zustand";

type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

interface ThemeStore {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? getSystemTheme() : pref;
}

function applyTheme(theme: ResolvedTheme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

const savedPref =
  (localStorage.getItem("theme-preference") as ThemePreference) ?? "system";
const initialResolved = resolveTheme(savedPref);
applyTheme(initialResolved);

export const useThemeStore = create<ThemeStore>((set) => ({
  preference: savedPref,
  resolved: initialResolved,
  setPreference: (pref) => {
    localStorage.setItem("theme-preference", pref);
    const resolved = resolveTheme(pref);
    applyTheme(resolved);
    set({ preference: pref, resolved });
  },
}));

// Listen for system theme changes
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    const { preference } = useThemeStore.getState();
    if (preference === "system") {
      const resolved = getSystemTheme();
      applyTheme(resolved);
      useThemeStore.setState({ resolved });
    }
  });
