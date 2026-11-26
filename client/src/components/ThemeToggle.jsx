import { useTheme } from "../hooks/useTheme.jsx";

export default function ThemeToggle() {
  const { label, cycle, pref } = useTheme();
  const mark = pref === "dark" ? "夜" : pref === "light" ? "昼" : "随";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      aria-label={`外观：${label}，点击切换`}
      title={`外观：${label}`}
    >
      {mark}
    </button>
  );
}
