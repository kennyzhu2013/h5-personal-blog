import { Link } from "react-router-dom";
import { formatDate, formatReadingTime } from "../api.js";
import HeartButton from "./HeartButton.jsx";

function Snippet({ segments }) {
  if (!segments?.length) return null;
  return (
    <p className="post-summary post-snippet">
      {segments.map((segment, index) => (
        segment.hit
          ? <mark key={index}>{segment.text}</mark>
          : <span key={index}>{segment.text}</span>
      ))}
    </p>
  );
}

export default function PostCard({ post, favorited, onToggleFavorite }) {
  const reading = post.isGame ? "" : formatReadingTime(post.readingMinutes);
  return (
    <article className="post-card">
      <Link to={`/post/${post.slug}`} className="post-cover-link">
        <div className={post.coverUrl ? "post-cover" : "post-cover placeholder"}>
          {post.coverUrl ? (
            <img src={post.coverUrl} alt="" />
          ) : (
            <span>{(post.title || "记").slice(0, 1)}</span>
          )}
          {post.isGame ? <span className="game-badge">游戏</span> : null}
        </div>
      </Link>
      <div className="post-body">
        <HeartButton on={favorited} onToggle={() => onToggleFavorite(post.slug)} className="floating" />
        <h2 className="post-title">
          <Link to={`/post/${post.slug}`} className="post-title-link">{post.title}</Link>
        </h2>
        {post.snippet?.length ? <Snippet segments={post.snippet} /> : (post.summary ? <p className="post-summary">{post.summary}</p> : null)}
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
      </div>
    </article>
  );
}
