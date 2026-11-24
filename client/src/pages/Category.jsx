import { useCallback, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
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

export default function Category() {
  const { slug } = useParams();
  const { siteName, categories } = useConfig();
  const { has, toggle } = useFavorites();
  const [sort, setSort] = useFeedSort();
  const loadPage = useCallback((page) => api.category(slug, { sort, page }), [slug, sort]);
  const { posts, loading, loadingMore, error, hasMore, loadMore, meta } = usePagedList(loadPage, [slug, sort]);

  const category = meta?.category;
  const missing = error && /不存在|找不到/.test(error);

  useEffect(() => {
    const name = category?.name;
    if (name) document.title = `${name} · ${siteName}`;
    return () => {
      document.title = siteName;
    };
  }, [category, siteName]);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="seal">栏</span>
          <div className="brand-name">{category?.name || "专题"}</div>
        </div>
        <ThemeToggle />
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
        {missing ? (
          <EmptyState mark="空" title="找不到专题">{error}<br /><Link to="/">回到首页</Link></EmptyState>
        ) : error ? (
          <div className="err">{error}</div>
        ) : null}
        {loading && posts.length === 0 && !missing ? (
          <div className="feed"><div className="sk-card" /></div>
        ) : !missing && posts.length === 0 && !loading ? (
          <EmptyState title="这一栏还是空的">
            分类后的文章会出现在这里。你可以先看看<Link to="/">全部文章</Link>。
          </EmptyState>
        ) : posts.length > 0 ? (
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
        ) : null}
      </main>
    </>
  );
}
