import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import PostCard from "../components/PostCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import LoadMore from "../components/LoadMore.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { useFavorites } from "../hooks/useFavorites.js";
import usePagedList from "../hooks/usePagedList.js";

export default function Search() {
  const { has, toggle } = useFavorites();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 280);
    return () => clearTimeout(timer);
  }, [query]);

  const loadPage = useCallback((page) => api.search(debounced, { page }), [debounced]);
  const { posts, loading, loadingMore, error, hasMore, loadMore } = usePagedList(
    loadPage,
    [debounced],
    { enabled: Boolean(debounced) }
  );

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="seal">寻</span>
          <div className="brand-name">搜索</div>
        </div>
        <ThemeToggle />
      </header>
      <main className="page tight">
        <label className="search-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            placeholder="搜索标题、摘要、标签或正文"
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        </label>
        {error ? <div className="err">{error}</div> : null}
        {!debounced ? (
          <EmptyState mark="搜" title="找一篇想读的文章">
            支持搜索标题、摘要、标签和正文，命中的句子会高亮。
          </EmptyState>
        ) : loading && posts.length === 0 ? (
          <div className="sk-line" />
        ) : posts.length === 0 ? (
          <EmptyState mark="空" title={`没有找到「${debounced}」`}>
            换个关键词试试，或回到首页看看最近的文章。
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
