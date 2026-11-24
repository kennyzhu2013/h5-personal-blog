import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import HeartButton from "./HeartButton.jsx";

const GAME_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-fullscreen";
const GAME_ALLOW = "fullscreen; pointer-lock; gamepad";

export default function GamePlayer({
  title,
  src,
  preview = false,
  favorited = false,
  onToggleFavorite,
  onBack,
}) {
  const shellRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [narrowPortrait, setNarrowPortrait] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);

  useEffect(() => {
    const update = () => {
      const wide = window.matchMedia("(orientation: landscape)").matches
        || window.innerWidth > window.innerHeight;
      setLandscape(wide);
      setNarrowPortrait(!wide && window.innerWidth <= 820);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement || document.webkitFullscreenElement;
      setFullscreen(Boolean(shellRef.current && (active === shellRef.current || shellRef.current.contains(active))));
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    const el = shellRef.current;
    if (!el) return;
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (active) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch {
      // Some browsers reject fullscreen without a direct gesture; keep the current layout.
    }
  };

  const showHint = narrowPortrait && !hintDismissed && !fullscreen;

  return (
    <div className="app-root game-root">
      <div
        ref={shellRef}
        className={`game-shell${landscape ? " is-landscape" : ""}${fullscreen ? " is-fullscreen" : ""}`}
      >
        <header className="game-chrome">
          <button type="button" className="icon-btn game-icon-btn" onClick={onBack} aria-label="返回">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="game-title" title={title}>{title}</div>
          <div className="game-chrome-actions">
            {!preview ? (
              <HeartButton on={favorited} onToggle={onToggleFavorite} />
            ) : null}
            <button
              type="button"
              className="icon-btn game-icon-btn game-full-btn"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "退出全屏" : "全屏"}
            >
              {fullscreen ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M9 3H5v4M15 3h4v4M9 21H5v-4M15 21h4v-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span className="game-full-label">{fullscreen ? "退出全屏" : "全屏"}</span>
            </button>
          </div>
        </header>
        {preview ? (
          <div className="preview-banner game-preview-banner">
            这是草稿预览，读者还看不到这些修改。确认无误后，请到后台点击「发布」。
            <div>
              <Link to="/admin">返回后台</Link>
            </div>
          </div>
        ) : null}
        {showHint ? (
          <div className="game-hint">
            <span>横屏玩更舒服</span>
            <button type="button" onClick={() => setHintDismissed(true)} aria-label="关闭提示">×</button>
          </div>
        ) : null}
        <div className="game-stage">
          {src ? (
            <iframe
              key={src}
              title={title || "游戏"}
              src={src}
              sandbox={GAME_SANDBOX}
              allow={GAME_ALLOW}
              allowFullScreen
              referrerPolicy="no-referrer"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
