import { NavLink } from "react-router-dom";

const items = [
  {
    to: "/",
    label: "首页",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: "/search",
    label: "搜索",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: "/favorites",
    label: "收藏",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 20s-7-4.4-9.3-8.2C.8 8.8 2.2 5 6 5c2 0 3.3 1.1 4 2.2C10.7 6.1 12 5 14 5c3.8 0 5.2 3.8 3.3 6.8C19 15.6 12 20 12 20z" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function TabBar() {
  return (
    <nav className="tabbar" aria-label="主导航">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) => `tab${isActive ? " active" : ""}`}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
