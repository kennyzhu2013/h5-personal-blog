import { useCallback, useEffect, useState } from "react";

const KEY = "h5-blog-favorites";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function save(slugs) {
  localStorage.setItem(KEY, JSON.stringify(slugs));
}

export function useFavorites() {
  const [slugs, setSlugs] = useState(() => (typeof window === "undefined" ? [] : load()));

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === KEY) setSlugs(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const has = useCallback((slug) => slugs.includes(slug), [slugs]);

  const toggle = useCallback((slug) => {
    if (!slug) return;
    setSlugs((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [slug, ...prev];
      save(next);
      return next;
    });
  }, []);

  return { slugs, has, toggle };
}
