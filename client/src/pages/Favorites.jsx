import { useEffect, useState } from "react";
import { api } from "../api.js";
import PostCard from "../components/PostCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { useFavorites } from "../hooks/useFavorites.js";

export default function Favorites() {
  const { slugs, has, toggle } = useFavorites();
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!slugs.length) {
      setPosts([]);
      return undefined;
    }
    api.posts({ slugs })
      .then((data) => {
        if (cancelled) return;
        const map = new Map((data.posts || []).map((post) => [post.slug, post]));
        setPosts(slugs.map((slug) => map.get(slug)).filter(Boolean));
      })
      .catch(() => {
        if (!cancelled) setPosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [slugs]);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="seal">藏</span>
          <div className="brand-name">收藏</div>
        </div>
        <ThemeToggle />
      </header>
      <main className="page">
        <div className="h-group">
          <p className="eyebrow">仅保存在这台设备</p>
          <h1 className="page-title">我喜欢的</h1>
        </div>
        {posts == null ? (
          <div className="sk-card" />
        ) : posts.length === 0 ? (
          <EmptyState mark="心" title="还没有收藏">
            在首页或文章页点一下心形，就会出现在这里。收藏只保存在当前浏览器里。
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
