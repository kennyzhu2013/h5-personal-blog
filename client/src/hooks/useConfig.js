import { useEffect, useState } from "react";
import { api } from "../api.js";

export function useConfig() {
  const [siteName, setSiteName] = useState("我的博客");
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api.config()
      .then((data) => {
        if (cancelled) return;
        if (data?.siteName) {
          setSiteName(data.siteName);
          document.title = data.siteName;
        }
        if (Array.isArray(data?.categories)) setCategories(data.categories);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return { siteName, categories };
}
