import { Link } from "react-router-dom";
import { formatDate, formatReadingTime } from "../api.js";
import HeartButton from "./HeartButton.jsx";

export default function PostCard({ post, favorited, onToggleFavorite }) {
  const reading = post.isGame ? "" : formatReadingTime(post.readingMinutes);
  return (
    <Link to={`/post/${post.slug}`} className="post-card">
      <div className={post.coverUrl ? "post-cover" : "post-cover placeholder"}>
        {post.coverUrl ? (
          <img src={post.coverUrl} alt="" />
        ) : (
          <span>{(post.title || "记").slice(0, 1)}</span>
        )}
        {post.isGame ? <span className="game-badge">游戏</span> : null}
      </div>
      <div className="post-body">
        <HeartButton on={favorited} onToggle={() => onToggleFavorite(post.slug)} className="floating" />
        <h2 className="post-title">{post.title}</h2>
        {post.summary ? <p className="post-summary">{post.summary}</p> : null}
        <div className="post-meta">
          {post.category ? <span className="tag cat">{post.category.name}</span> : null}
          <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
          {reading ? <span>{reading}</span> : null}
          {(post.tags || []).map((tag) => (
            <span className="tag" key={tag}>{tag}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}
