import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import PostCard from "../components/PostCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import CategoryChips from "../components/CategoryChips.jsx";
import FeedSort from "../components/FeedSort.jsx";
import { useFavorites } from "../hooks/useFavorites.js";
import { useConfig } from "../hooks/useConfig.js";
import useFeedSort from "../hooks/useFeedSort.js";

export default function Category() {
  const { slug } = useParams();
  const { siteName, categories } = useConfig();
  const { has, toggle } = useFavorites();
  const [sort, setSort] = useFeedSort();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    api.category(slug, { sort })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.status === 404 ? "这个专题还不存在。" : err.message || "无法加载专题");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, sort]);

  useEffect(() => {
    const name = data?.category?.name;
    if (name) document.title = `${name} · ${siteName}`;
    return () => {
      document.title = siteName;
    };
  }, [data, siteName]);

  const category = data?.category;
  const posts = data?.posts;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="seal">栏</span>
          <div className="brand-name">{category?.name || "专题"}</div>
        </div>
      </header>
      <main className="page">
        <div className="h-group">
          <p className="eyebrow">专题</p>
          <h1 className="page-title">{category?.name || "专题"}</h1>
          <p className="page-desc">只看这一栏的已发布文章。也可以回到<Link to="/" className="inline-link">全部文章</Link>。</p>
        </div>
        <div className="feed-toolbar">
          <CategoryChips categories={categories} current={slug} />
          <FeedSort value={sort} onChange={setSort} />
        </div>
        {error ? (
          <EmptyState mark="空" title="找不到专题">{error}<br /><Link to="/">回到首页</Link></EmptyState>
        ) : posts == null ? (
          <div className="feed">
            <div className="sk-card" />
          </div>
        ) : posts.length === 0 ? (
          <EmptyState title="这一栏还是空的">
            分类后的文章会出现在这里。你可以先看看<Link to="/">全部文章</Link>。
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
