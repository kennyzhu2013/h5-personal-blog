async function request(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: options.body instanceof FormData
      ? { ...(options.headers || {}) }
      : { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || "响应无法解析" };
  }
  if (!res.ok) {
    const error = new Error(data?.error || `请求失败（${res.status}）`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  config: () => request("/api/config"),
  posts: (opts) => {
    const options = typeof opts === "string" ? { category: opts } : (opts || {});
    const params = new URLSearchParams();
    if (options.category) params.set("category", options.category);
    if (options.sort && options.sort !== "published") params.set("sort", options.sort);
    const query = params.toString();
    return request(query ? `/api/posts?${query}` : "/api/posts");
  },
  categories: () => request("/api/categories"),
  category: (slug, opts = {}) => {
    const params = new URLSearchParams();
    if (opts.sort && opts.sort !== "published") params.set("sort", opts.sort);
    const query = params.toString();
    const path = `/api/categories/${encodeURIComponent(slug)}`;
    return request(query ? `${path}?${query}` : path);
  },
  search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),
  post: (slug) => request(`/api/posts/${encodeURIComponent(slug)}`),
  contentUrl: (slug) => `/media/articles/${encodeURIComponent(slug)}/live/`,
  previewContentUrl: (slug, token) => `/media/articles/${encodeURIComponent(slug)}/p/${encodeURIComponent(token)}/`,
  adminMe: () => request("/api/admin/me"),
  unlock: (password) => request("/api/admin/unlock", { method: "POST", body: JSON.stringify({ password }) }),
  lock: () => request("/api/admin/lock", { method: "POST", body: JSON.stringify({}) }),
  adminPosts: () => request("/api/admin/posts"),
  adminPost: (id) => request(`/api/admin/posts/${id}`),
  adminPostBySlug: (slug) => request(`/api/admin/posts/slug/${encodeURIComponent(slug)}`),
  createPost: (formData) => request("/api/admin/posts", { method: "POST", body: formData }),
  updatePost: (id, formData) => request(`/api/admin/posts/${id}`, { method: "PATCH", body: formData }),
  publishPost: (id) => request(`/api/admin/posts/${id}/publish`, { method: "POST", body: JSON.stringify({}) }),
  unpublishPost: (id) => request(`/api/admin/posts/${id}/unpublish`, { method: "POST", body: JSON.stringify({}) }),
  deletePost: (id) => request(`/api/admin/posts/${id}`, { method: "DELETE" }),
  createCategory: (name) => request("/api/admin/categories", { method: "POST", body: JSON.stringify({ name }) }),
};

export function formatReadingTime(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n < 1) return "";
  return `约 ${Math.round(n)} 分钟`;
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(iso)} ${hh}:${mm}`;
}

export function statusLabel(status) {
  if (status === "published_with_changes") return "已发布 · 有未发布的修改";
  if (status === "published") return "已发布";
  return "草稿";
}

export function statusClass(status) {
  if (status === "published_with_changes") return "dirty";
  if (status === "published") return "on";
  return "off";
}
