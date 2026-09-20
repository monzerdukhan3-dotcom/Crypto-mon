"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "crypto-mon:theme";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle() {
  // Matches whatever the blocking script in layout.tsx already set on
  // <html> before this component ever mounts, so there's no mismatch to
  // reconcile — just read it straight from the DOM.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // Deferred a tick so this reconciliation-from-the-DOM doesn't run
    // synchronously inside the effect body itself.
    queueMicrotask(() => {
      setTheme((document.documentElement.getAttribute("data-theme") as Theme | null) ?? systemTheme());
    });

    // Keep following the system preference live for as long as the person
    // hasn't made an explicit choice of their own.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function handleSystemChange() {
      if (localStorage.getItem(STORAGE_KEY)) return;
      const next = systemTheme();
      document.documentElement.setAttribute("data-theme", next);
      setTheme(next);
    }
    media.addEventListener("change", handleSystemChange);
    return () => media.removeEventListener("change", handleSystemChange);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing or storage disabled — the toggle still works for this page view.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "dark" ? "التبديل إلى الوضع النهاري" : "التبديل إلى الوضع الليلي"}
      aria-label={theme === "dark" ? "التبديل إلى الوضع النهاري" : "التبديل إلى الوضع الليلي"}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface hover:text-foreground"
    >
      {/* Rendered only once the real theme is known client-side, to avoid a
          hydration mismatch against the server's theme-less markup — the
          blocking script already prevents any visible flash in the
          meantime. */}
      {theme === "dark" ? (
        <Sun className="h-4 w-4" strokeWidth={2.25} />
      ) : theme === "light" ? (
        <Moon className="h-4 w-4" strokeWidth={2.25} />
      ) : (
        <span className="h-4 w-4" />
      )}
    </button>
  );
}
