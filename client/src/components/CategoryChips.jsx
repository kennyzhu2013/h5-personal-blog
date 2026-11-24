import { NavLink } from "react-router-dom";

export default function CategoryChips({ categories = [], current }) {
  if (!categories.length) return null;
  return (
    <nav className="chips" aria-label="专题分类">
      <NavLink to="/" end className={({ isActive }) => `chip${!current && isActive ? " active" : ""}`}>
        全部
      </NavLink>
      {categories.map((cat) => (
        <NavLink
          key={cat.slug}
          to={`/c/${cat.slug}`}
          className={({ isActive }) => `chip${isActive || current === cat.slug ? " active" : ""}`}
        >
          {cat.name}
        </NavLink>
      ))}
    </nav>
  );
}
