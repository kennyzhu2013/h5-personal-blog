import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

function findScrollParent(node) {
  let current = node?.parentElement;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return current;
    current = current.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

const ArticleFrame = forwardRef(function ArticleFrame({ src, title = "文章正文", onViewportMode, onOutline }, ref) {
  const iframeRef = useRef(null);
  const onModeRef = useRef(onViewportMode);
  const onOutlineRef = useRef(onOutline);
  const modeRef = useRef("document");
  const growTick = useRef({ count: 0, at: 0 });
  const [height, setHeight] = useState(360);
  const [mode, setMode] = useState("document");

  onModeRef.current = onViewportMode;
  onOutlineRef.current = onOutline;
  modeRef.current = mode;

  useImperativeHandle(ref, () => ({
    scrollToHeading(id) {
      const frame = iframeRef.current;
      if (!frame?.contentWindow || !id) return;
      frame.contentWindow.postMessage({
        type: "article-scroll-to",
        id,
        mode: modeRef.current,
      }, "*");
    },
  }), []);

  useEffect(() => {
    setHeight(360);
    setMode("document");
    modeRef.current = "document";
    growTick.current = { count: 0, at: 0 };
    onModeRef.current?.(false);
    onOutlineRef.current?.([]);
    const onMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "article-outline" && Array.isArray(data.headings)) {
        onOutlineRef.current?.(data.headings);
        return;
      }
      if (data.type === "article-heading-pos" && typeof data.top === "number") {
        const iframe = iframeRef.current;
        if (!iframe) return;
        const scroller = findScrollParent(iframe);
        const iframeRect = iframe.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect ? scroller.getBoundingClientRect() : { top: 0 };
        const nextTop = (scroller.scrollTop || 0) + (iframeRect.top - scrollerRect.top) + data.top - 16;
        if (typeof scroller.scrollTo === "function") {
          scroller.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
        } else {
          scroller.scrollTop = Math.max(0, nextTop);
        }
        return;
      }
      if (data.type !== "article-height" || typeof data.height !== "number") return;
      if (data.mode === "viewport") {
        setMode("viewport");
        modeRef.current = "viewport";
        onModeRef.current?.(true);
        return;
      }
      const iframeHeight = iframeRef.current?.clientHeight || 360;
      // Fullscreen pages report a height that tracks the iframe itself.
      // Adding padding would make them grow forever and scroll the outer page.
      if (Math.abs(data.height - iframeHeight) <= 4) {
        const tick = growTick.current;
        const now = Date.now();
        if (now - tick.at > 1500) tick.count = 0;
        tick.count += 1;
        tick.at = now;
        if (tick.count >= 4) {
          setMode("viewport");
          modeRef.current = "viewport";
          onModeRef.current?.(true);
        }
        return;
      }
      const next = Math.max(200, Math.min(Math.ceil(data.height) + 12, 24000));
      setHeight(next);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [src]);

  if (!src) return null;

  const fill = mode === "viewport";

  return (
    <iframe
      ref={iframeRef}
      key={src}
      title={title}
      src={src}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className={fill ? "is-app-frame" : undefined}
      style={{
        width: "100%",
        height: fill ? "100%" : `${height}px`,
        border: 0,
        display: "block",
        background: fill ? "#0b0d0f" : "transparent",
      }}
    />
  );
});

export default ArticleFrame;
