export default function EmptyState({ mark = "记", title, children }) {
  return (
    <div className="empty">
      <div className="empty-mark">{mark}</div>
      {title ? <h3>{title}</h3> : null}
      {children ? <p>{children}</p> : null}
    </div>
  );
}
