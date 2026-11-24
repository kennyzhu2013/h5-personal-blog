import { useEffect, useState } from "react";
import { api } from "../api.js";
import PostCard from "../components/PostCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import CategoryChips from "../components/CategoryChips.jsx";
import FeedSort from "../components/FeedSort.jsx";
import { useFavorites } from "../hooks/useFavorites.js";
import { useConfig } from "../hooks/useConfig.js";
import useFeedSort from "../hooks/useFeedSort.js";

export default function Home() {
  const { siteName, categories } = useConfig();
  const { has, toggle } = useFavorites();
  const [sort, setSort] = useFeedSort();
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setPosts(null);
    api.posts({ sort })
      .then((data) => {
        if (!cancelled) setPosts(data.posts || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "无法加载文章");
      });
    return () => {
      cancelled = true;
    };
  }, [sort]);

  const today = new Date();
  const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日`;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="seal">记</span>
          <div className="brand-name">{siteName}</div>
        </div>
        <div className="topbar-meta">{todayLabel}</div>
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
        {posts == null ? (
          <div className="feed">
            <div className="sk-card" />
            <div className="sk-card" />
          </div>
        ) : posts.length === 0 ? (
          <EmptyState title="还没有文章">
            后台上传一篇 HTML 之后，这里就会出现信息流。
          </EmptyState>
        ) : (
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
        )}
      </main>
    </>
  );
}
