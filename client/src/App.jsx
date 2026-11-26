import { Link, Outlet, Route, Routes } from "react-router-dom";
import TabBar from "./components/TabBar.jsx";
import Home from "./pages/Home.jsx";
import Category from "./pages/Category.jsx";
import Search from "./pages/Search.jsx";
import Favorites from "./pages/Favorites.jsx";
import PostDetail from "./pages/PostDetail.jsx";
import Tag from "./pages/Tag.jsx";
import Admin from "./pages/admin/Admin.jsx";
import EmptyState from "./components/EmptyState.jsx";

function ReaderLayout() {
  return (
    <div className="app-root">
      <div className="app-frame">
        <div className="frame-body">
          <Outlet />
        </div>
        <TabBar />
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="app-root">
      <div className="app-frame">
        <main className="page">
          <EmptyState mark="失" title="页面不存在">
            <Link to="/">回到首页</Link>，看看最近的文章。
          </EmptyState>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<ReaderLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/c/:slug" element={<Category />} />
        <Route path="/tag/:name" element={<Tag />} />
        <Route path="/search" element={<Search />} />
        <Route path="/favorites" element={<Favorites />} />
      </Route>
      <Route path="/post/:slug/preview" element={<PostDetail preview />} />
      <Route path="/post/:slug" element={<PostDetail />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
