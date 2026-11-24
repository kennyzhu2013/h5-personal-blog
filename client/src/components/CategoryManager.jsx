import { useState } from "react";
import { api } from "../api.js";

export default function CategoryManager({ categories, onUpdated, onNotice, onError }) {
  const [draftName, setDraftName] = useState("");
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [busy, setBusy] = useState(false);

  const apply = (data, message) => {
    if (Array.isArray(data?.categories)) onUpdated(data.categories);
    if (message) onNotice(message);
  };

  const run = async (work) => {
    setBusy(true);
    onError("");
    try {
      await work();
    } catch (err) {
      onError(err.message || "专题操作失败");
    } finally {
      setBusy(false);
    }
  };

  const create = () => run(async () => {
    const name = draftName.trim();
    if (!name) throw new Error("请填写专题名称");
    const data = await api.createCategory(name);
    setDraftName("");
    apply(data, `已新建专题「${name}」。`);
  });

  const saveRename = (cat) => run(async () => {
    const name = renameValue.trim();
    if (!name) throw new Error("请填写专题名称");
    const data = await api.renameCategory(cat.id, name);
    setRenameId(null);
    apply(data, `专题已改名为「${name}」。地址仍是 /c/${cat.slug}。`);
  });

  const move = (index, delta) => run(async () => {
    const next = [...categories];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    const data = await api.reorderCategories(next.map((cat) => cat.id));
    apply(data, "专题顺序已保存。");
  });

  const remove = (cat) => run(async () => {
    const data = await api.deleteCategory(cat.id);
    setDeleteId(null);
    apply(data, `已删除专题「${cat.name}」。`);
  });

  return (
    <section className="topic-admin">
      <div className="topic-admin-head">
        <h2>专题管理</h2>
      </div>
      <p className="field-help">
        顺序会用在读者端的专题芯片上。改名不会更换网址。若仍有文章或草稿使用该专题，删除会被拒绝，文章不会被改动。
      </p>
      <div className="topic-create">
        <input
          type="text"
          maxLength={20}
          value={draftName}
          placeholder="新专题名称"
          onChange={(event) => setDraftName(event.target.value)}
        />
        <button type="button" className="btn" disabled={busy || !draftName.trim()} onClick={create}>新建</button>
      </div>
      <div className="topic-list">
        {categories.map((cat, index) => (
          <div className="topic-row" key={cat.id}>
            {renameId === cat.id ? (
              <input
                type="text"
                maxLength={20}
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            ) : (
              <div className="topic-name">
                {cat.name}
                <span>{typeof cat.postCount === "number" ? `${cat.postCount} 篇` : ""}</span>
              </div>
            )}
            {deleteId === cat.id ? (
              <div className="topic-confirm">
                <p>
                  确定删除「{cat.name}」吗？若仍有文章或草稿使用它，删除会被拒绝，已有文章不会被取消分类。
                  {cat.postCount > 0 ? ` 当前有 ${cat.postCount} 篇。` : ""}
                </p>
                <div className="btn-row">
                  <button type="button" className="btn danger" disabled={busy} onClick={() => remove(cat)}>确认删除</button>
                  <button type="button" className="btn ghost" onClick={() => setDeleteId(null)}>取消</button>
                </div>
              </div>
            ) : (
              <div className="topic-actions">
                <button type="button" className="mini-btn" disabled={busy || index === 0} onClick={() => move(index, -1)}>上移</button>
                <button type="button" className="mini-btn" disabled={busy || index === categories.length - 1} onClick={() => move(index, 1)}>下移</button>
                {renameId === cat.id ? (
                  <>
                    <button type="button" className="mini-btn" disabled={busy} onClick={() => saveRename(cat)}>保存</button>
                    <button type="button" className="mini-btn" onClick={() => setRenameId(null)}>取消</button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => {
                      setRenameId(cat.id);
                      setRenameValue(cat.name);
                      setDeleteId(null);
                    }}
                  >
                    改名
                  </button>
                )}
                <button type="button" className="mini-btn danger" onClick={() => { setDeleteId(cat.id); setRenameId(null); }}>删除</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
