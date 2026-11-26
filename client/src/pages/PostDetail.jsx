import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, formatDate, formatReadingTime } from "../api.js";
import ArticleFrame from "../components/ArticleFrame.jsx";
import GamePlayer from "../components/GamePlayer.jsx";
import HeartButton from "../components/HeartButton.jsx";
import TableOfContents from "../components/TableOfContents.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { useFavorites } from "../hooks/useFavorites.js";
import { useConfig } from "../hooks/useConfig.js";
import useReadingProgress from "../hooks/useReadingProgress.js";

export default function PostDetail({ preview = false }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { siteName } = useConfig();
  const { has, toggle } = useFavorites();
  const frameRef = useRef(null);
  const bodyRef = useRef(null);
  const [post, setPost] = useState(null);
  const [neighbors, setNeighbors] = useState({ prev: null, next: null, related: [] });
  const [error, setError] = useState("");
  const [frameSrc, setFrameSrc] = useState("");
  const [viewportApp, setViewportApp] = useState(false);
  const [headings, setHeadings] = useState([]);
  const [tocOpen, setTocOpen] = useState(false);
  const trackProgress = Boolean(post) && !post.isGame && !preview && !viewportApp;
  const restored = useReadingProgress(post?.slug, bodyRef, trackProgress);

  useEffect(() => {
    let cancelled = false;
    setPost(null);
    setNeighbors({ prev: null, next: null, related: [] });
    setError("");
    setFrameSrc("");
    setViewportApp(false);
    setHeadings([]);
    setTocOpen(false);
    const load = preview ? api.adminPostBySlug(slug) : api.post(slug);
    load
      .then((data) => {
        if (cancelled) return;
        const row = data.post;
        if (preview) {
          const draft = row.draft || row.live;
          setPost({
            ...row,
            title: draft?.title || row.title,
            summary: draft?.summary || row.summary,
            tags: draft?.tags || row.tags,
            category: draft?.category || row.category,
            isGame: Boolean(draft?.isGame ?? row.isGame),
            createdAt: row.createdAt,
            readingMinutes: row.readingMinutes,
          });
          setFrameSrc(row.previewUrl || api.previewContentUrl(row.slug, row.previewToken));
        } else {
          setPost(row);
          setNeighbors({
            prev: data.prev || null,
            next: data.next || null,
            related: data.related || [],
          });
          setFrameSrc(row.contentUrl || api.contentUrl(row.slug));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (preview && err.status === 401) {
          setError("预览需要先登录后台。");
        } else {
          setError(err.status === 404 ? (preview ? "找不到这篇草稿。" : "这篇文章不存在或已下架。") : err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, preview]);

  useEffect(() => {
    if (post?.title) document.title = `${preview ? "预览 · " : ""}${post.title} · ${siteName}`;
    return () => {
      document.title = siteName;
    };
  }, [post, siteName, preview]);

  const goBack = () => (location.key !== "default" ? navigate(-1) : navigate(preview ? "/admin" : "/"));

  const closeToc = useCallback(() => setTocOpen(false), []);

  const jumpToHeading = useCallback((id) => {
    setTocOpen(false);
    frameRef.current?.scrollToHeading(id);
  }, []);

  if (post && !error && post.isGame) {
    return (
      <GamePlayer
        title={post.title}
        src={frameSrc}
        preview={preview}
        favorited={has(post.slug)}
        onToggleFavorite={() => toggle(post.slug)}
        onBack={goBack}
      />
    );
  }

  const reading = post && !post.isGame ? formatReadingTime(post.readingMinutes) : "";
  const showToc = Boolean(post) && !post.isGame && headings.length >= 2;

  return (
    <div className="app-root">
      <div className="app-frame wide">
        <div className={`frame-body${viewportApp ? " is-app-post" : ""}`} ref={bodyRef}>
          <div className="detail-top">
            <button type="button" className="icon-btn" onClick={goBack} aria-label="返回">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showToc ? (
              <button
                type="button"
                className="toc-launch"
                aria-expanded={tocOpen}
                aria-haspopup="dialog"
                onClick={() => setTocOpen(true)}
              >
                目录
              </button>
            ) : (
              <span />
            )}
            <div className="detail-actions">
              <ThemeToggle />
              {post && !preview ? (
                <HeartButton on={has(post.slug)} onToggle={() => toggle(post.slug)} />
              ) : null}
            </div>
          </div>
          {restored && !preview && !viewportApp ? <p className="resume-note">已回到上次读到的位置</p> : null}
          {error ? (
            <main className="page">
              <EmptyState mark="空" title="找不到文章">{error}<br /><Link to={preview ? "/admin" : "/"}>{preview ? "回到后台" : "回到首页"}</Link></EmptyState>
            </main>
          ) : !post ? (
            <main className="page">
              <div className="sk-line" style={{ width: "40%" }} />
              <div className="sk-line" />
              <div className="sk-line" />
            </main>
          ) : (
            <>
              {preview ? (
                <div className="preview-banner">
                  这是草稿预览，读者还看不到这些修改。确认无误后，请到后台点击「发布」。
                  <div>
                    <Link to="/admin">返回后台</Link>
                  </div>
                </div>
              ) : null}
              <header className="detail-head">
                <h1 className="detail-title">{post.title}</h1>
                <div className="post-meta">
                  {post.category ? (
                    <Link className="tag cat" to={`/c/${post.category.slug}`}>{post.category.name}</Link>
                  ) : null}
                  <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
                  {reading ? <span>{reading}</span> : null}
                  {(post.tags || []).map((tag) => (
                    <Link className="tag" key={tag} to={`/tag/${encodeURIComponent(tag)}`}>{tag}</Link>
                  ))}
                </div>
              </header>
              <div className={`article-wrap${viewportApp ? " is-app" : ""}`}>
                <ArticleFrame
                  ref={frameRef}
                  src={frameSrc}
                  title={post.title}
                  onViewportMode={setViewportApp}
                  onOutline={setHeadings}
                />
              </div>
              {!preview && (neighbors.prev || neighbors.next) ? (
                <nav className="post-neighbors" aria-label="前后文章">
                  {neighbors.prev ? (
                    <Link className="post-neighbor" to={`/post/${neighbors.prev.slug}`}>
                      <small>上一篇</small>
                      <strong>{neighbors.prev.title}</strong>
                    </Link>
                  ) : <span />}
                  {neighbors.next ? (
                    <Link className="post-neighbor" to={`/post/${neighbors.next.slug}`}>
                      <small>下一篇</small>
                      <strong>{neighbors.next.title}</strong>
                    </Link>
                  ) : null}
                </nav>
              ) : null}
              {!preview && neighbors.related.length ? (
                <section className="related-block">
                  <h2>相关阅读</h2>
                  <div className="related-list">
                    {neighbors.related.map((item) => (
                      <Link key={item.slug} to={`/post/${item.slug}`}>
                        <strong>{item.title}</strong>
                        <div className="meta">
                          {[item.category?.name, ...(item.tags || []).slice(0, 3)].filter(Boolean).join(" · ")}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
        <TableOfContents
          headings={headings}
          open={tocOpen && showToc}
          onClose={closeToc}
          onJump={jumpToHeading}
        />
      </div>
    </div>
  );
}
