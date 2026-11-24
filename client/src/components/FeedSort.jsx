export default function FeedSort({ value = "published", onChange }) {
  return (
    <div className="feed-sort" role="group" aria-label="排序">
      <button
        type="button"
        className={value === "published" ? "active" : undefined}
        aria-pressed={value === "published"}
        onClick={() => onChange?.("published")}
      >
        发布时间
      </button>
      <button
        type="button"
        className={value === "updated" ? "active" : undefined}
        aria-pressed={value === "updated"}
        onClick={() => onChange?.("updated")}
      >
        最近更新
      </button>
    </div>
  );
}
