import { useCallback, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import PostCard from "../components/PostCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import FeedSort from "../components/FeedSort.jsx";
import LoadMore from "../components/LoadMore.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { useFavorites } from "../hooks/useFavorites.js";
import { useConfig } from "../hooks/useConfig.js";
import useFeedSort from "../hooks/useFeedSort.js";
import usePagedList from "../hooks/usePagedList.js";

export default function Tag() {
  const { name = "" } = useParams();
  const tag = decodeURIComponent(name);
  const { siteName } = useConfig();
  const { has, toggle } = useFavorites();
  const [sort, setSort] = useFeedSort();
  const loadPage = useCallback((page) => api.tag(tag, { sort, page }), [tag, sort]);
  const { posts, loading, loadingMore, error, hasMore, loadMore } = usePagedList(loadPage, [tag, sort], { enabled: Boolean(tag) });

  useEffect(() => {
    if (tag) document.title = `${tag} · ${siteName}`;
    return () => {
      document.title = siteName;
    };
  }, [tag, siteName]);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="seal">签</span>
          <div className="brand-name">{tag || "标签"}</div>
        </div>
        <ThemeToggle />
      </header>
      <main className="page">
        <div className="h-group">
          <p className="eyebrow">标签</p>
          <h1 className="page-title">{tag || "标签"}</h1>
          <p className="page-desc">带有这个标签的已发布文章。也可以回到<Link to="/" className="inline-link">全部文章</Link>。</p>
        </div>
        <div className="feed-toolbar">
          <FeedSort value={sort} onChange={setSort} />
        </div>
        {error ? <div className="err">{error}</div> : null}
        {loading && posts.length === 0 ? (
          <div className="feed"><div className="sk-card" /></div>
        ) : posts.length === 0 ? (
          <EmptyState title="这个标签下还没有文章">
            换一个标签看看，或回到<Link to="/">全部文章</Link>。
          </EmptyState>
        ) : (
          <>
            <div className="feed">
              {posts.map((post) => (
                <PostCard
                  key={post.slug}
                  post={post}
                  favorited={has(post.slug)}
                  onToggleFavorite={toggle}
                />
              ))}
            </div>
            <LoadMore hasMore={hasMore} loading={loadingMore} onLoad={loadMore} />
          </>
        )}
      </main>
    </>
  );
}
