import { useEffect, useState } from "react";

function keyFor(slug) {
  return `h5-blog-progress:${slug}`;
}

function readRatio(slug) {
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(slug)) || "null");
    const ratio = Number(saved?.ratio);
    if (Number.isFinite(ratio) && ratio > 0.02 && ratio < 0.98) return ratio;
  } catch {
    // Ignore unreadable progress.
  }
  return null;
}

function writeRatio(slug, ratio) {
  try {
    localStorage.setItem(keyFor(slug), JSON.stringify({ ratio, at: Date.now() }));
  } catch {
    // Ignore quota and private-mode failures.
  }
}

export default function useReadingProgress(slug, scrollerRef, enabled) {
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setRestored(false);
    const scroller = scrollerRef.current;
    if (!enabled || !slug || !scroller) return undefined;

    const ratio = readRatio(slug);
    let userMoved = false;
    let applying = false;

    const apply = () => {
      if (userMoved || ratio == null) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max < 48) return;
      const next = max * ratio;
      if (Math.abs(scroller.scrollTop - next) > 2) {
        applying = true;
        scroller.scrollTop = next;
        applying = false;
      }
      setRestored(true);
    };

    if (ratio == null) scroller.scrollTop = 0;

    let timer = 0;
    const save = () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max <= 0) return;
      writeRatio(slug, Math.min(1, Math.max(0, scroller.scrollTop / max)));
    };

    const markUser = () => {
      if (applying) return;
      userMoved = true;
      window.clearTimeout(timer);
      timer = window.setTimeout(save, 180);
    };

    const observer = new ResizeObserver(() => apply());
    const watch = () => {
      observer.observe(scroller);
      scroller.querySelectorAll("iframe, .article-wrap").forEach((node) => observer.observe(node));
    };
    watch();
    apply();
    const interval = window.setInterval(() => {
      watch();
      apply();
    }, 200);
    const stopInterval = window.setTimeout(() => window.clearInterval(interval), 4000);

    scroller.addEventListener("wheel", markUser, { passive: true });
    scroller.addEventListener("touchmove", markUser, { passive: true });
    scroller.addEventListener("pointerdown", markUser);
    scroller.addEventListener("keydown", markUser);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      window.clearTimeout(stopInterval);
      window.clearTimeout(timer);
      scroller.removeEventListener("wheel", markUser);
      scroller.removeEventListener("touchmove", markUser);
      scroller.removeEventListener("pointerdown", markUser);
      scroller.removeEventListener("keydown", markUser);
      if (userMoved) save();
    };
  }, [slug, enabled, scrollerRef]);

  return restored;
}