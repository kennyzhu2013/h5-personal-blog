export default function HeartButton({ on, onToggle, className = "", title }) {
  return (
    <button
      type="button"
      className={`heart ${on ? "on" : ""} ${className}`.trim()}
      aria-pressed={on}
      aria-label={on ? "取消收藏" : "收藏"}
      title={title || (on ? "取消收藏" : "收藏")}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
        <path d="M12 20s-7-4.4-9.3-8.2C.8 8.8 2.2 5 6 5c2 0 3.3 1.1 4 2.2C10.7 6.1 12 5 14 5c3.8 0 5.2 3.8 3.3 6.8C19 15.6 12 20 12 20z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
