"use client";

import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "evidara.theme";

type Theme = "dark" | "light";

// Runs as a parser-blocking inline script before first paint so a stored
// light preference never flashes dark. Kept in sync with applyTheme below.
export const THEME_BOOTSTRAP_SCRIPT = `try{if(window.localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})==="light"){document.documentElement.dataset.theme="light"}}catch(e){}`;

function applyTheme(theme: Theme) {
  if (theme === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Preference simply does not persist without storage access.
  }
}

export function ThemeToggle() {
  // Dark is the default; the real value syncs from the DOM after hydration
  // because the bootstrap script may have applied a stored preference.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(
      document.documentElement.dataset.theme === "light" ? "light" : "dark",
    );
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="buttonSecondary"
      aria-label={`Switch to ${next} theme`}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
    >
      {next === "light" ? "Light mode" : "Dark mode"}
    </button>
  );
}
