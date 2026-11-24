import { useState } from "react";

const KEY = "h5-blog-feed-sort";

function load() {
  try {
    return localStorage.getItem(KEY) === "updated" ? "updated" : "published";
  } catch {
    return "published";
  }
}

function persist(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Ignore quota / private-mode failures; the in-memory choice still works this visit.
  }
}

export default function useFeedSort() {
  const [sort, setSortState] = useState(() => (typeof window === "undefined" ? "published" : load()));

  const setSort = (next) => {
    const value = next === "updated" ? "updated" : "published";
    setSortState(value);
    persist(value);
  };

  return [sort, setSort];
}
