import { useCallback } from "react";
import { api } from "../api.js";
import PostCard from "../components/PostCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import CategoryChips from "../components/CategoryChips.jsx";
import FeedSort from "../components/FeedSort.jsx";
import LoadMore from "../components/LoadMore.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { useFavorites } from "../hooks/useFavorites.js";
import { useConfig } from "../hooks/useConfig.js";
import useFeedSort from "../hooks/useFeedSort.js";
import usePagedList from "../hooks/usePagedList.js";

export default function Home() {
  const { siteName, categories } = useConfig();
  const { has, toggle } = useFavorites();
  const [sort, setSort] = useFeedSort();
  const loadPage = useCallback((page) => api.posts({ sort, page }), [sort]);
  const { posts, loading, loadingMore, error, hasMore, loadMore } = usePagedList(loadPage, [sort]);

  const today = new Date();
  const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日`;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="seal">记</span>
          <div className="brand-name">{siteName}</div>
        </div>
        <div className="topbar-meta">
          <ThemeToggle />
          <span>{todayLabel}</span>
        </div>
      </header>
      <main className="page">
        <div className="h-group">
          <p className="eyebrow">今日阅读</p>
          <h1 className="page-title">文章</h1>
        </div>
        <div className="feed-toolbar">
          <CategoryChips categories={categories} />
          <FeedSort value={sort} onChange={setSort} />
        </div>
        {error ? <div className="err">{error}</div> : null}
        {loading && posts.length === 0 ? (
          <div className="feed">
            <div className="sk-card" />
            <div className="sk-card" />
          </div>
        ) : posts.length === 0 ? (
          <EmptyState title="还没有文章">
            后台上传一篇 HTML 之后，这里就会出现信息流。
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
