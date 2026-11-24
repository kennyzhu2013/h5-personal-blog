import { useEffect, useRef } from "react";

export default function LoadMore({ hasMore, loading, onLoad }) {
  const ref = useRef(null);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    if (!hasMore || loading || !ref.current) return undefined;
    const node = ref.current;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadRef.current?.();
    }, { rootMargin: "160px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  if (!hasMore) return null;
  return (
    <div className="load-more" ref={ref}>
      <button type="button" className="btn ghost" disabled={loading} onClick={onLoad}>
        {loading ? "正在加载…" : "加载更多"}
      </button>
    </div>
  );
}
