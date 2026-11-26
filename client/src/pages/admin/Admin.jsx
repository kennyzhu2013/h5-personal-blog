import { useEffect, useMemo, useRef, useState } from "react";
import { api, formatDateTime, statusClass, statusLabel } from "../../api.js";
import { useConfig } from "../../hooks/useConfig.js";
import CategoryManager from "../../components/CategoryManager.jsx";
import ThemeToggle from "../../components/ThemeToggle.jsx";

const emptyForm = {
  title: "",
  summary: "",
  tags: "",
  categoryId: "",
  newCategory: "",
  isGame: false,
  html: null,
  cover: null,
  coverAsset: "",
  assets: [],
  folderAssets: [],
  zip: null,
  replaceAssets: false,
};

function fillFormFromPost(post) {
  const src = post?.draft || post?.live || post || {};
  return {
    ...emptyForm,
    title: src.title || post?.title || "",
    summary: src.summary || post?.summary || "",
    tags: (src.tags || post?.tags || []).join("，"),
    categoryId: src.categoryId != null ? String(src.categoryId) : (post?.categoryId != null ? String(post.categoryId) : ""),
    isGame: Boolean(src.isGame ?? post?.isGame),
  };
}

function collectAssetFiles(form) {
  const files = [...(form.assets || []), ...(form.folderAssets || [])];
  const paths = files.map((file) => file.webkitRelativePath || file.name);
  return { files, paths };
}

function metaSnapshot(form) {
  return JSON.stringify({
    title: form.title.trim(),
    summary: form.summary.trim(),
    tags: form.tags,
    categoryId: form.categoryId,
    newCategory: form.newCategory.trim(),
    isGame: Boolean(form.isGame),
    coverAsset: form.coverAsset || "",
  });
}

function isImageAsset(path) {
  return /\.(jpe?g|png|webp|gif|svg)$/i.test(path || "");
}

export default function Admin() {
  const { siteName } = useConfig();
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("ok");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("list"); // list | create | edit
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmId, setConfirmId] = useState(null);
  const [listFilter, setListFilter] = useState("all");
  const [autoSaveLabel, setAutoSaveLabel] = useState("");

  const htmlInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const assetsInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const zipInputRef = useRef(null);
  const formRef = useRef(form);
  const submittingRef = useRef(false);
  const saveGenRef = useRef(0);
  const lastSavedRef = useRef("");
  const autoSavedAtRef = useRef(0);
  const saveLockRef = useRef(Promise.resolve());
  formRef.current = form;

  const loadPosts = async () => {
    const data = await api.adminPosts();
    setPosts(data.posts || []);
    if (Array.isArray(data.categories)) setCategories(data.categories);
  };

  const showToast = (message, type = "ok") => {
    setToast(message);
    setToastType(type);
  };

  const clearFileInputs = () => {
    for (const ref of [htmlInputRef, coverInputRef, assetsInputRef, folderInputRef, zipInputRef]) {
      if (ref.current) ref.current.value = "";
    }
  };

  const applySavedPost = (post, { silent = false, autoCategory = null, intent = "draft", sentSnap = "" } = {}) => {
    setEditing(post);
    setMode("edit");
    const liveSnap = metaSnapshot(formRef.current);
    const canReset = !silent || !sentSnap || liveSnap === sentSnap;
    if (canReset) {
      const next = fillFormFromPost(post);
      setForm(next);
      lastSavedRef.current = metaSnapshot(next);
      clearFileInputs();
    } else {
      lastSavedRef.current = sentSnap;
      setForm((current) => ({
        ...current,
        html: null,
        cover: null,
        assets: [],
        folderAssets: [],
        zip: null,
        replaceAssets: false,
        coverAsset: current.coverAsset === JSON.parse(sentSnap).coverAsset ? "" : current.coverAsset,
      }));
      clearFileInputs();
    }
    if (silent) {
      autoSavedAtRef.current = Date.now();
      setAutoSaveLabel("草稿已自动保存 · 刚才");
      return;
    }
    let msg = intent === "publish"
      ? "文章已发布，读者现在可以看到这一版。"
      : "草稿已保存。可以先预览，确认后再发布。";
    if (autoCategory?.name) {
      msg += `已自动归入「${autoCategory.name}」分类。`;
    }
    setNotice(msg);
    showToast(msg);
  };

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 8000);
    return () => clearTimeout(timer);
  }, [toast, toastType]);

  useEffect(() => {
    let cancelled = false;
    api.adminMe()
      .then(async (data) => {
        if (cancelled) return;
        setUnlocked(Boolean(data.unlocked));
        if (Array.isArray(data.categories)) setCategories(data.categories);
        if (data.unlocked) {
          try {
            await loadPosts();
          } catch (err) {
            setError(err.message);
          }
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.title = `后台 · ${siteName}`;
    return () => {
      document.title = siteName;
    };
  }, [siteName]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    lastSavedRef.current = "";
    setAutoSaveLabel("");
    setError("");
    setNotice("");
    clearFileInputs();
    setMode("create");
  };

  const startEdit = (post) => {
    setEditing(post);
    const next = fillFormFromPost(post);
    setForm(next);
    lastSavedRef.current = metaSnapshot(next);
    setAutoSaveLabel("");
    setError("");
    setNotice(post.status === "published_with_changes"
      ? "这篇已发布文章有尚未发布的修改。现在编辑的是草稿，不会立刻覆盖线上内容。"
      : post.published
        ? "修改会先保存为草稿，确认无误后再点击「发布」。"
        : "");
    clearFileInputs();
    setMode("edit");
  };

  const onUnlock = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.unlock(password);
      setUnlocked(true);
      setPassword("");
      await loadPosts();
    } catch (err) {
      setError(err.message || "口令不正确");
    } finally {
      setBusy(false);
    }
  };

  const onLock = async () => {
    await api.lock();
    setUnlocked(false);
    setMode("list");
  };

  const buildFormData = (intent, current = form) => {
    const data = new FormData();
    data.set("title", current.title.trim());
    data.set("summary", current.summary.trim());
    data.set("tags", current.tags);
    data.set("intent", intent);
    data.set("isGame", current.isGame ? "1" : "0");
    if (current.newCategory.trim()) {
      data.set("newCategory", current.newCategory.trim());
    } else {
      data.set("categoryId", current.categoryId);
    }
    if (current.html) data.set("html", current.html);
    if (current.cover) data.set("cover", current.cover);
    if (!current.cover && current.coverAsset) data.set("coverAsset", current.coverAsset);
    if (current.zip) data.set("assetsZip", current.zip);
    const { files, paths } = collectAssetFiles(current);
    files.forEach((file) => data.append("assets", file));
    if (paths.length) data.set("assetRelPaths", JSON.stringify(paths));
    if (current.replaceAssets) data.set("replaceAssets", "1");
    return data;
  };

  const submit = async (intent, { auto = false } = {}) => {
    if (auto && (mode !== "edit" || !editing?.id || busy)) {
      return;
    }
    let release;
    const prevLock = saveLockRef.current;
    saveLockRef.current = new Promise((resolve) => { release = resolve; });
    await prevLock;

    const current = formRef.current;
    if (!current.title.trim()) {
      if (!auto) setError("请填写标题");
      release();
      return;
    }
    if (mode === "create" && !current.html && !current.zip) {
      if (!auto) setError("请上传 HTML 文件，或上传包含 HTML 的压缩包");
      release();
      return;
    }
    if (auto && (mode !== "edit" || !editing?.id || busy)) {
      release();
      return;
    }
    if (auto && metaSnapshot(current) === lastSavedRef.current) {
      release();
      return;
    }

    submittingRef.current = true;
    saveGenRef.current += 1;
    const gen = saveGenRef.current;
    const sentSnap = metaSnapshot(current);
    if (!auto) {
      setBusy(true);
      setError("");
      setNotice("");
    }
    try {
      const data = buildFormData(intent, current);
      let result;
      if (mode === "create") {
        result = await api.createPost(data);
      } else {
        result = await api.updatePost(editing.id, data);
      }
      if (gen !== saveGenRef.current) return;
      const post = result.post;
      await loadPosts();
      if (gen !== saveGenRef.current) return;
      applySavedPost(post, {
        silent: auto,
        autoCategory: result.autoCategory,
        intent,
        sentSnap,
      });
    } catch (err) {
      if (gen !== saveGenRef.current) return;
      const message = err.message || "保存失败";
      if (auto) {
        setAutoSaveLabel(message);
      } else {
        setError(message);
        showToast(message, "error");
      }
    } finally {
      if (gen === saveGenRef.current) {
        submittingRef.current = false;
        if (!auto) setBusy(false);
      }
      release();
    }
  };

  useEffect(() => {
    if (mode !== "edit" || !editing?.id) return undefined;
    if (busy) return undefined;
    if (!form.title.trim()) return undefined;
    const snap = metaSnapshot(form);
    if (snap === lastSavedRef.current) return undefined;
    const timer = setTimeout(() => {
      submit("draft", { auto: true });
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title, form.summary, form.tags, form.categoryId, form.newCategory, form.isGame, form.coverAsset, mode, editing?.id, busy]);

  const onPublishExisting = async (post) => {
    setBusy(true);
    setError("");
    try {
      const result = await api.publishPost(post.id);
      const updated = result.post;
      if (updated) {
        setPosts((list) => list.map((item) => (item.id === post.id ? updated : item)));
        if (editing?.id === post.id) {
          const next = fillFormFromPost(updated);
          setEditing(updated);
          setForm(next);
          lastSavedRef.current = metaSnapshot(next);
        }
      }
      const msg = post.status === "published_with_changes"
        ? "修改已发布，读者现在可以看到新版本。"
        : "文章已发布，读者现在可以看到这一版。";
      setNotice(msg);
      showToast(msg);
      try {
        await loadPosts();
      } catch {
        // Local list already updated from the publish response.
      }
    } catch (err) {
      setError(err.message || "发布失败");
      showToast(err.message || "发布失败", "error");
    } finally {
      setBusy(false);
    }
  };

  const onUnpublish = async (post) => {
    setBusy(true);
    setError("");
    try {
      const result = await api.unpublishPost(post.id);
      if (result?.post) {
        setPosts((list) => list.map((item) => (item.id === post.id ? result.post : item)));
      }
      const msg = "文章已下架，读者暂时看不到它。";
      setNotice(msg);
      showToast(msg);
      await loadPosts();
    } catch (err) {
      setError(err.message || "下架失败");
      showToast(err.message || "下架失败", "error");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (post) => {
    setBusy(true);
    setError("");
    try {
      await api.deletePost(post.id);
      setConfirmId(null);
      setNotice("文章已删除。");
      showToast("文章已删除。");
      await loadPosts();
      if (editing?.id === post.id) {
        setMode("list");
        setEditing(null);
      }
    } catch (err) {
      setError(err.message || "删除失败");
      showToast(err.message || "删除失败", "error");
    } finally {
      setBusy(false);
    }
  };

  const coverPreview = useMemo(() => {
    if (form.cover) return URL.createObjectURL(form.cover);
    if (form.coverAsset && editing?.previewUrl) return `${editing.previewUrl}${form.coverAsset}`;
    if (editing?.draft?.coverUrl) return editing.draft.coverUrl;
    if (editing?.coverUrl) return editing.coverUrl;
    return "";
  }, [form.cover, form.coverAsset, editing]);

  useEffect(() => {
    return () => {
      if (coverPreview && form.cover) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview, form.cover]);

  const suggestedCategory = useMemo(() => {
    if (form.categoryId || form.newCategory.trim()) return null;
    const tags = form.tags.split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
    const matched = [];
    const seen = new Set();
    for (const tag of tags) {
      const cat = categories.find((item) => item.name === tag);
      if (cat && !seen.has(cat.id)) {
        seen.add(cat.id);
        matched.push(cat);
      }
    }
    return matched.length === 1 ? matched[0] : null;
  }, [form.categoryId, form.newCategory, form.tags, categories]);

  const visiblePosts = useMemo(() => {
    if (listFilter === "all") return posts;
    return posts.filter((post) => String(post.categoryId ?? "") === String(listFilter));
  }, [posts, listFilter]);

  const draftAssets = editing?.draft?.assets || [];
  const imageAssets = draftAssets.filter((item) => isImageAsset(item.path));
  const fileSummary = [
    form.html ? `HTML：${form.html.name}` : null,
    form.assets?.length ? `附件 ${form.assets.length} 个` : null,
    form.folderAssets?.length ? `文件夹 ${form.folderAssets.length} 个文件` : null,
    form.zip ? `压缩包：${form.zip.name}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="app-root">
      <div className="app-frame" style={{ width: "min(100%, 640px)" }}>
        <div className="frame-body">
          {!ready ? (
            <main className="page"><div className="sk-line" /></main>
          ) : !unlocked ? (
            <form className="admin-lock" onSubmit={onUnlock}>
              <div className="brand" style={{ marginBottom: 24 }}>
                <span className="seal">后</span>
                <div className="brand-name">{siteName}</div>
              </div>
              <h1>进入后台</h1>
              <p>输入口令后即可管理文章、草稿、附件和分类。</p>
              {error ? <div className="err">{error}</div> : null}
              <div className="field">
                <label htmlFor="admin-password">口令</label>
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入后台口令"
                />
              </div>
              <button className="btn block" type="submit" disabled={busy || !password}>
                {busy ? "正在验证…" : "进入"}
              </button>
            </form>
          ) : mode === "list" ? (
            <>
              <header className="admin-top">
                <div>
                  <div className="eyebrow">后台</div>
                  <div className="brand-name" style={{ fontSize: 24 }}>文章管理</div>
                </div>
                <div className="btn-row" style={{ marginTop: 0 }}>
                  <ThemeToggle />
                  <button className="btn ghost" type="button" onClick={onLock}>退出</button>
                  <button className="btn" type="button" onClick={startCreate}>写文章</button>
                </div>
              </header>
              <main className="page">
                {error ? <div className="err">{error}</div> : null}
                {notice ? <div className="okmsg">{notice}</div> : null}
                <CategoryManager
                  categories={categories}
                  onUpdated={(next) => {
                    setCategories(next);
                    loadPosts().catch(() => {});
                  }}
                  onNotice={(message) => {
                    setNotice(message);
                    showToast(message);
                  }}
                  onError={(message) => {
                    setError(message);
                    if (message) showToast(message, "error");
                  }}
                />
                {posts.length === 0 ? (
                  <div className="empty">
                    <div className="empty-mark">新</div>
                    <h3>还没有文章</h3>
                    <p>点击右上角「写文章」，上传一份 HTML 即可。</p>
                  </div>
                ) : (
                  <>
                    <div className="chips admin-list-filters">
                      <button
                        type="button"
                        className={`chip${listFilter === "all" ? " active" : ""}`}
                        onClick={() => setListFilter("all")}
                      >
                        全部
                      </button>
                      {categories.map((cat) => (
                        <button
                          type="button"
                          key={cat.id}
                          className={`chip${String(listFilter) === String(cat.id) ? " active" : ""}`}
                          onClick={() => setListFilter(String(cat.id))}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                    {visiblePosts.length === 0 ? (
                      <div className="empty">
                        <div className="empty-mark">空</div>
                        <h3>这个分类下还没有文章</h3>
                        <p>可以换一个分类看看，或写一篇新的。</p>
                      </div>
                    ) : (
                      <div className="admin-list">
                        {visiblePosts.map((post) => (
                          <article className="admin-card" key={post.id}>
                            <h3>{post.title}</h3>
                            {post.status === "published_with_changes" && post.live?.title && post.live.title !== post.title ? (
                              <div className="meta">线上标题：{post.live.title}</div>
                            ) : null}
                            <div className="meta">
                              <span className={`badge ${statusClass(post.status)}`}>
                                {statusLabel(post.status)}
                              </span>
                              {post.isGame ? <span className="badge dirty">游戏</span> : null}
                              {post.category ? <span className="tag cat">{post.category.name}</span> : null}
                              <span>{formatDateTime(post.createdAt)}</span>
                              {(post.tags || []).length ? ` · ${post.tags.join("、")}` : ""}
                            </div>
                            {confirmId === post.id ? (
                              <div>
                                <div className="err">确定删除「{post.title}」吗？删除后正文和附件都不可恢复。</div>
                                <div className="btn-row">
                                  <button className="btn danger" type="button" disabled={busy} onClick={() => onDelete(post)}>确认删除</button>
                                  <button className="btn ghost" type="button" onClick={() => setConfirmId(null)}>取消</button>
                                </div>
                              </div>
                            ) : (
                              <div className="btn-row">
                                <button className="btn ghost" type="button" onClick={() => startEdit(post)}>编辑</button>
                                <a className="btn ghost" href={`/post/${post.slug}/preview`} target="_blank" rel="noreferrer">预览</a>
                                {post.status !== "published" ? (
                                  <button className="btn ghost" type="button" disabled={busy} onClick={() => onPublishExisting(post)}>
                                    {post.status === "published_with_changes" ? "发布修改" : "发布"}
                                  </button>
                                ) : null}
                                {post.published ? (
                                  <button className="btn ghost" type="button" disabled={busy} onClick={() => onUnpublish(post)}>下架</button>
                                ) : null}
                                {post.published ? (
                                  <a className="btn ghost" href={`/post/${post.slug}`} target="_blank" rel="noreferrer">查看线上</a>
                                ) : null}
                                <button className="btn danger" type="button" onClick={() => setConfirmId(post.id)}>删除</button>
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </main>
            </>
          ) : (
            <>
              <header className="admin-top">
                <div>
                  <button type="button" className="back-link" onClick={() => { setMode("list"); setError(""); }}>
                    ← 返回列表
                  </button>
                  <div className="brand-name" style={{ fontSize: 24 }}>
                    {mode === "create" ? "写文章" : "编辑文章"}
                  </div>
                </div>
              </header>
              <main className="page">
                {error ? <div className="err">{error}</div> : null}
                {notice ? <div className="okmsg">{notice}</div> : null}
                {editing?.status === "published_with_changes" ? (
                  <div className="preview-banner">当前编辑的是未发布的修改。读者看到的仍是上一版，直到你点击「发布」。</div>
                ) : null}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("draft");
                  }}
                >
                  <div className="field">
                    <label htmlFor="title">标题<span className="req">*</span></label>
                    <input
                      id="title"
                      type="text"
                      maxLength={80}
                      value={form.title}
                      onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))}
                      placeholder="给这篇文章起一个标题"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="summary">摘要</label>
                    <textarea
                      id="summary"
                      maxLength={400}
                      value={form.summary}
                      onChange={(event) => setForm((f) => ({ ...f, summary: event.target.value }))}
                      placeholder="一两句话，出现在信息流里"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="category">分类 / 专题</label>
                    <p className="field-help">分类决定文章出现在哪个专题页（如技术、生活）。</p>
                    <select
                      id="category"
                      value={form.categoryId}
                      onChange={(event) => setForm((f) => ({ ...f, categoryId: event.target.value, newCategory: "" }))}
                    >
                      <option value="">不分类（只出现在全部文章里）</option>
                      {categories.map((cat) => (
                        <option value={String(cat.id)} key={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    <input
                      style={{ marginTop: 8 }}
                      type="text"
                      maxLength={20}
                      value={form.newCategory}
                      onChange={(event) => setForm((f) => ({ ...f, newCategory: event.target.value }))}
                      placeholder="或输入新分类名称，例如：旅行"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="tags">标签</label>
                    <p className="field-help">标签只用于检索和展示，不会把文章送进专题页。要出现在「技术」「生活」等栏目，请在上面选择分类。</p>
                    <input
                      id="tags"
                      type="text"
                      value={form.tags}
                      onChange={(event) => setForm((f) => ({ ...f, tags: event.target.value }))}
                      placeholder="用逗号分隔，例如：笔记，散步"
                    />
                    {suggestedCategory ? (
                      <div className="suggest-row">
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => setForm((f) => ({ ...f, categoryId: String(suggestedCategory.id), newCategory: "" }))}
                        >
                          将分类设为「{suggestedCategory.name}」
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="field">
                    <label className="toggle" htmlFor="is-game">
                      <input
                        id="is-game"
                        type="checkbox"
                        checked={Boolean(form.isGame)}
                        onChange={(event) => setForm((f) => ({ ...f, isGame: event.target.checked }))}
                      />
                      这是 H5 游戏
                    </label>
                    <p className="field-help" style={{ marginTop: 8 }}>打开后会进入游戏播放页（全屏、横屏），而不是普通文章排版。</p>
                  </div>
                  <div className="field">
                    <div className="file-field">
                      <strong>HTML 文件{mode === "create" ? "（必填）" : "（可选，会写入草稿，不立刻覆盖线上）"}</strong>
                      <span>请上传完整的 HTML5 文件。文中的相对路径图片、样式和字体，请一并在下面上传附件。</span>
                      <input
                        ref={htmlInputRef}
                        type="file"
                        accept=".html,.htm,text/html"
                        onChange={(event) => setForm((f) => ({ ...f, html: event.target.files?.[0] || null }))}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <div className="file-field">
                      <strong>文章附件</strong>
                      <span>可多选文件、选择整个文件夹，或上传一个包含资源目录的 zip。相对路径会按原样保存，例如 img/photo.jpg、style.css。</span>
                      <label className="file-label">
                        选择文件
                        <input
                          ref={assetsInputRef}
                          type="file"
                          multiple
                          onChange={(event) => setForm((f) => ({ ...f, assets: Array.from(event.target.files || []) }))}
                        />
                      </label>
                      <label className="file-label">
                        选择文件夹
                        <input
                          ref={folderInputRef}
                          type="file"
                          webkitdirectory=""
                          directory=""
                          multiple
                          onChange={(event) => setForm((f) => ({ ...f, folderAssets: Array.from(event.target.files || []) }))}
                        />
                      </label>
                      <label className="file-label">
                        上传 zip
                        <input
                          ref={zipInputRef}
                          type="file"
                          accept=".zip,application/zip"
                          onChange={(event) => setForm((f) => ({ ...f, zip: event.target.files?.[0] || null }))}
                        />
                      </label>
                      {fileSummary ? <div className="file-name">{fileSummary}</div> : null}
                      {draftAssets.length ? (
                        <ul className="asset-list">
                          {draftAssets.map((item) => (
                            <li key={item.path}>{item.path}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="hint">当前草稿还没有附件。</div>
                      )}
                      <label className="toggle" style={{ marginTop: 10, justifyContent: "center" }}>
                        <input
                          type="checkbox"
                          checked={form.replaceAssets}
                          onChange={(event) => setForm((f) => ({ ...f, replaceAssets: event.target.checked }))}
                        />
                        清除现有附件后再上传
                      </label>
                    </div>
                  </div>
                  <div className="field">
                    <div className="file-field">
                      <strong>封面图（可选）</strong>
                      <span>支持 jpg、png、webp、gif、svg。也可以从下面已有的附件里选一张，附件本身不会被删掉。</span>
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,.svg"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          setForm((f) => ({ ...f, cover: file, coverAsset: file ? "" : f.coverAsset }));
                        }}
                      />
                      {form.cover ? <div className="file-name">已选择：{form.cover.name}</div> : null}
                      {imageAssets.length ? (
                        <div className="cover-picks">
                          <div className="field-help">从已有附件中选择封面：</div>
                          <div className="cover-pick-row">
                            {imageAssets.map((item) => {
                              const selected = !form.cover && form.coverAsset === item.path;
                              const src = editing?.previewUrl ? `${editing.previewUrl}${item.path}` : "";
                              return (
                                <button
                                  type="button"
                                  key={item.path}
                                  className={`cover-pick${selected ? " is-on" : ""}`}
                                  onClick={() => {
                                    if (coverInputRef.current) coverInputRef.current.value = "";
                                    setForm((f) => ({ ...f, cover: null, coverAsset: item.path }));
                                  }}
                                >
                                  {src ? <img src={src} alt="" /> : null}
                                  <span className="cover-pick-name">{item.path.split("/").pop()}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {coverPreview ? <img className="cover-preview" src={coverPreview} alt="封面预览" /> : null}
                    </div>
                  </div>
                  <div className="btn-row" style={{ marginTop: 20 }}>
                    <button className="btn ghost" type="submit" disabled={busy}>
                      {busy ? "正在保存…" : "保存草稿"}
                    </button>
                    {editing?.slug ? (
                      <a className="btn ghost" href={`/post/${editing.slug}/preview`} target="_blank" rel="noreferrer">预览</a>
                    ) : (
                      <button className="btn ghost" type="button" disabled title="请先保存草稿">预览</button>
                    )}
                    <button className="btn" type="button" disabled={busy} onClick={() => submit("publish")}>
                      {busy ? "正在发布…" : (editing?.status === "published_with_changes" ? "发布修改" : "发布")}
                    </button>
                    <button className="btn ghost" type="button" onClick={() => setMode("list")}>取消</button>
                  </div>
                  {autoSaveLabel ? <div className="autosave-status">{autoSaveLabel}</div> : null}
                </form>
              </main>
            </>
          )}
          {toast ? (
            <div className={`admin-toast ${toastType === "error" ? "is-error" : "is-ok"}`} role="status">
              {toast}
              <button type="button" className="toast-close" onClick={() => setToast("")} aria-label="关闭提示">×</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
