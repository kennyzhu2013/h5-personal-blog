import { useEffect, useRef } from "react";

export default function TableOfContents({ headings = [], open, onClose, onJump }) {
  const closeRef = useRef(null);
  const usable = (headings || []).filter((item) => item && item.id && item.text);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || usable.length < 2) return null;

  return (
    <div className="toc-backdrop" onClick={onClose}>
      <div
        className="toc-sheet"
        role="dialog"
        aria-label="目录"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="toc-sheet-head">
          <h2>目录</h2>
          <button type="button" className="toc-close" ref={closeRef} onClick={onClose}>
            关闭
          </button>
        </div>
        <nav className="toc-list">
          {usable.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`toc-item level-${item.level || 2}`}
              onClick={() => onJump?.(item.id)}
            >
              {item.text}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
