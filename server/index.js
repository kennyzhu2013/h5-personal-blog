import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import dotenv from "dotenv";
import {
  ROOT,
  DATA_DIR,
  COVERS_DIR,
  TMP_DIR,
  ensureDirs,
  getDb,
  parseTags,
  publicPost,
  adminPost,
  nowIso,
  newPreviewToken,
  listCategories,
  listAdminCategories,
  getCategoryBySlug,
  getCategoryById,
  ensureCategoryByName,
  renameCategory,
  deleteCategory,
  reorderCategories,
  POST_SELECT,
} from "./db.js";
import { buildArticleDocument, compactText, estimateReadingMinutes } from "./html.js";
import {
  buildMatchQuery,
  buildSnippet,
  readingMinutesFromHtml,
  removePostSearch,
  upsertPostSearch,
} from "./fts.js";
import { safePasswordEqual, setSession, clearSession, isUnlocked, requireAdmin } from "./auth.js";
import { seedIfNeeded } from "./seed.js";
import {
  MAX_FILE_SIZE,
  MAX_ZIP_SIZE,
  listAssets,
  copyRevisionFiles,
  removeRevisionDir,
  readRevisionHtml,
  writeRevisionHtml,
  writeAssetFile,
  extractZipToRevision,
  clearAssets,
  resolveAsset,
  isHtmlPath,
  mimeFor,
  safeRelPath,
  isAllowedAsset,
  assertBudget,
  htmlPath,
} from "./assets.js";

dotenv.config({ path: path.join(ROOT, ".env") });

const PORT = Number(process.env.PORT) || 3000;
const SITE_NAME = (process.env.SITE_NAME || "我的博客").trim() || "我的博客";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

ensureDirs();
getDb();
seedIfNeeded();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use(
  "/media/covers",
  express.static(COVERS_DIR, {
    fallthrough: false,
    maxAge: "7d",
    index: false,
  })
);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(TMP_DIR, req.uploadId || "anon");
    fs.mkdirSync(dir, { recursive: true });
    if (file.fieldname === "cover") {
      const coverDir = path.join(dir, "cover");
      fs.mkdirSync(coverDir, { recursive: true });
      return cb(null, coverDir);
    }
    cb(null, dir);
  },
  filename(req, file, cb) {
    const id = crypto.randomBytes(8).toString("hex");
    if (file.fieldname === "cover") {
      cb(null, `cover-${id}${coverExt(file)}`);
      return;
    }
    if (file.fieldname === "html") {
      cb(null, `upload-${id}.html`);
      return;
    }
    const original = (file.originalname || "file").replace(/[/\\]/g, "_");
    const ext = path.extname(original).slice(0, 12);
    cb(null, `file-${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_ZIP_SIZE, files: 80, fields: 40 },
  fileFilter(req, file, cb) {
    if (file.fieldname === "html") {
      const ok =
        /\.html?$/i.test(file.originalname || "") ||
        /html/.test(file.mimetype || "");
      return ok ? cb(null, true) : cb(new Error("请上传 HTML 文件"));
    }
    if (file.fieldname === "cover") {
      const ok =
        /image\/(jpeg|png|webp|gif|svg\+xml)/.test(file.mimetype || "") ||
        /\.(jpe?g|png|webp|gif|svg)$/i.test(file.originalname || "");
      return ok ? cb(null, true) : cb(new Error("封面请使用 jpg、png、webp、gif 或 svg"));
    }
    if (file.fieldname === "assetsZip") {
      const ok =
        /\.zip$/i.test(file.originalname || "") ||
        /zip/.test(file.mimetype || "");
      return ok ? cb(null, true) : cb(new Error("请上传 zip 压缩包"));
    }
    if (file.fieldname === "assets") {
      const rel = safeRelPath(file.originalname) || file.originalname;
      if (rel && isAllowedAsset(rel)) return cb(null, true);
      return cb(new Error(`不支持的附件类型：${file.originalname || ""}`));
    }
    cb(new Error("不支持的上传字段"));
  },
});

function coverExt(file) {
  const raw = path.extname(file.originalname || "").toLowerCase();
  if (raw === ".jpeg") return ".jpg";
  if ([".jpg", ".png", ".webp", ".gif", ".svg"].includes(raw)) return raw;
  if ((file.mimetype || "").includes("svg")) return ".svg";
  if ((file.mimetype || "").includes("png")) return ".png";
  if ((file.mimetype || "").includes("webp")) return ".webp";
  if ((file.mimetype || "").includes("gif")) return ".gif";
  return ".jpg";
}

function cleanupDir(dir) {
  if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function cleanupReq(req) {
  if (req.uploadDir) cleanupDir(req.uploadDir);
}

function formUpload(req, res, next) {
  req.uploadId = crypto.randomBytes(8).toString("hex");
  req.uploadDir = path.join(TMP_DIR, req.uploadId);
  fs.mkdirSync(req.uploadDir, { recursive: true });
  upload.fields([
    { name: "html", maxCount: 1 },
    { name: "cover", maxCount: 1 },
    { name: "assets", maxCount: 60 },
    { name: "assetsZip", maxCount: 5 },
  ])(req, res, (err) => {
    if (!err) return next();
    cleanupReq(req);
    const message = err instanceof multer.MulterError
      ? err.code === "LIMIT_FILE_SIZE"
        ? "文件过大，单个文件请控制在 12 MB 以内"
        : "上传失败"
      : err.message || "上传失败";
    return res.status(400).json({ error: message });
  });
}

function makeSlug() {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `post-${day}-${suffix}`;
}

function searchTextOf({ title, summary, tags, categoryName, html }) {
  return [title, summary, (tags || []).join(" "), categoryName || "", compactText(html || "")]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPostBySlug(slug) {
  return getDb().prepare(`${POST_SELECT} WHERE posts.slug = ?`).get(slug);
}

function getPostById(id) {
  return getDb().prepare(`${POST_SELECT} WHERE posts.id = ?`).get(id);
}

function parseFeedSort(value) {
  return String(value || "").trim() === "updated" ? "updated" : "published";
}

function feedOrderSql(sort) {
  if (parseFeedSort(sort) === "updated") {
    return "ORDER BY datetime(posts.updated_at) DESC, posts.id DESC";
  }
  return "ORDER BY datetime(posts.created_at) DESC, posts.id DESC";
}

const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 30;

function pageParams(query) {
  const page = Math.max(1, Math.floor(Number(query?.page) || 1));
  let limit = Math.floor(Number(query?.limit) || DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_PAGE_SIZE;
  limit = Math.min(MAX_PAGE_SIZE, limit);
  return { page, limit, offset: (page - 1) * limit };
}

function pageResult({ posts, total, page, limit, extra = {} }) {
  return {
    ...extra,
    posts,
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}

function indexPublishedRow(row) {
  if (!row?.id || !row.published) return;
  const html = row.published_revision_id ? (readRevisionHtml(row.published_revision_id) || "") : "";
  const tags = parseTags(row.tags);
  const category = getCategoryById(row.category_id)?.name || "";
  const body = compactText(html);
  const search = searchTextOf({
    title: row.title,
    summary: row.summary,
    tags,
    categoryName: category,
    html,
  });
  getDb().prepare("UPDATE posts SET search_text = ? WHERE id = ?").run(search, row.id);
  if (row.published_revision_id) {
    getDb().prepare("UPDATE post_revisions SET search_text = ? WHERE id = ?").run(search, row.published_revision_id);
  }
  upsertPostSearch(getDb(), {
    id: row.id,
    title: row.title,
    summary: row.summary || "",
    tags: tags.join(" "),
    category,
    body,
  });
}

function reindexPublishedInCategory(categoryId) {
  const rows = getDb().prepare("SELECT * FROM posts WHERE published = 1 AND category_id = ?").all(categoryId);
  for (const row of rows) indexPublishedRow(row);
}

function listPublished({ whereSql, params, sort, pageQuery }) {
  const { page, limit, offset } = pageParams(pageQuery);
  const total = getDb().prepare(`SELECT COUNT(*) AS n FROM posts WHERE ${whereSql}`).get(...params).n;
  const rows = getDb()
    .prepare(`${POST_SELECT} WHERE ${whereSql} ${feedOrderSql(sort)} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  return pageResult({
    posts: rows.map((row) => publicPost(row)).filter(Boolean),
    total,
    page,
    limit,
    extra: { sort: parseFeedSort(sort) },
  });
}

function neighborPost(row, direction) {
  const newer = direction === "newer";
  const sql = newer
    ? `${POST_SELECT}
        WHERE posts.published = 1
          AND (
            datetime(posts.created_at) > datetime(@created)
            OR (datetime(posts.created_at) = datetime(@created) AND posts.id > @id)
          )
        ORDER BY datetime(posts.created_at) ASC, posts.id ASC
        LIMIT 1`
    : `${POST_SELECT}
        WHERE posts.published = 1
          AND (
            datetime(posts.created_at) < datetime(@created)
            OR (datetime(posts.created_at) = datetime(@created) AND posts.id < @id)
          )
        ORDER BY datetime(posts.created_at) DESC, posts.id DESC
        LIMIT 1`;
  const found = getDb().prepare(sql).get({ created: row.created_at, id: row.id });
  if (!found) return null;
  return {
    slug: found.slug,
    title: found.title,
    isGame: Boolean(Number(found.is_game || 0)),
  };
}

function relatedPosts(row, limit = 4) {
  const tags = parseTags(row.tags);
  let rows = [];
  try {
    if (tags.length) {
      rows = getDb().prepare(`
        ${POST_SELECT}
        WHERE posts.published = 1
          AND posts.id != ?
          AND (
            (? IS NOT NULL AND posts.category_id = ?)
            OR EXISTS (
              SELECT 1 FROM json_each(posts.tags) AS jt
              WHERE jt.value IN (SELECT value FROM json_each(?))
            )
          )
      `).all(row.id, row.category_id ?? null, row.category_id ?? null, JSON.stringify(tags));
    } else if (row.category_id) {
      rows = getDb().prepare(`
        ${POST_SELECT}
        WHERE posts.published = 1 AND posts.id != ? AND posts.category_id = ?
      `).all(row.id, row.category_id);
    }
  } catch {
    return [];
  }
  return rows
    .map((item) => {
      const itemTags = parseTags(item.tags);
      const overlap = itemTags.filter((tag) => tags.includes(tag)).length;
      const sameCategory = row.category_id && Number(item.category_id) === Number(row.category_id) ? 1 : 0;
      return { item, score: sameCategory * 3 + overlap * 2 };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || String(b.item.created_at).localeCompare(String(a.item.created_at)) || b.item.id - a.item.id)
    .slice(0, limit)
    .map((entry) => publicPost(entry.item))
    .filter(Boolean);
}

function previewReading(post, row) {
  if (!post) return post;
  if (post.isGame) return { ...post, readingMinutes: null };
  const id = row.draft_revision_id || row.published_revision_id;
  const html = id ? readRevisionHtml(id) : "";
  return { ...post, readingMinutes: estimateReadingMinutes(compactText(html || "")) };
}

function resolveCategoryId(body) {
  const newName = String(body?.newCategory ?? body?.categoryName ?? "").trim();
  if (newName) {
    const created = ensureCategoryByName(newName);
    return created?.id ?? null;
  }
  if (body?.categoryId != null && String(body.categoryId).trim() !== "") {
    const id = Number(body.categoryId);
    if (!Number.isFinite(id)) throw new Error("分类无效");
    const row = getCategoryById(id);
    if (!row) throw new Error("分类不存在");
    return row.id;
  }
  if (body?.categorySlug) {
    const row = getCategoryBySlug(String(body.categorySlug));
    if (!row) throw new Error("分类不存在");
    return row.id;
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "categoryId") && (body.categoryId === "" || body.categoryId == null)) {
    return null;
  }
  return undefined;
}

function parseIsGame(value, fallback = undefined) {
  if (value === undefined || value === null || value === "") return fallback;
  const raw = Array.isArray(value) ? value[0] : value;
  const s = String(raw).trim().toLowerCase();
  if (raw === true || raw === 1 || s === "1" || s === "true" || s === "on" || s === "yes") return 1;
  return 0;
}

function maybeAutoCategory(categoryId, tags) {
  if (categoryId) return { categoryId, autoCategory: null };
  const matched = [];
  const seen = new Set();
  for (const tag of tags || []) {
    const cat = listCategories().find((item) => item.name === tag);
    if (cat && !seen.has(cat.id)) {
      seen.add(cat.id);
      matched.push(cat);
    }
  }
  if (matched.length === 1) {
    return { categoryId: matched[0].id, autoCategory: matched[0] };
  }
  return { categoryId: categoryId ?? null, autoCategory: null };
}

function settleCoverFromAsset(revisionId, rel) {
  const clean = safeRelPath(rel);
  if (!clean) throw new Error("封面附件无效");
  if (!/\.(jpe?g|png|webp|gif|svg)$/i.test(clean)) {
    throw new Error("封面请使用 jpg、png、webp、gif 或 svg");
  }
  const full = resolveAsset(revisionId, clean);
  if (!full) throw new Error("找不到该附件");
  let ext = path.extname(clean).toLowerCase();
  if (ext === ".jpeg") ext = ".jpg";
  const name = `cover-${crypto.randomBytes(8).toString("hex")}${ext}`;
  fs.mkdirSync(COVERS_DIR, { recursive: true });
  fs.copyFileSync(full, path.join(COVERS_DIR, name));
  return name;
}

function resolveCover({ file, assetRel, revisionId }) {
  if (file) return settleCover(file);
  if (assetRel) return settleCoverFromAsset(revisionId, assetRel);
  return undefined;
}

function toAdmin(row, { withPreviewReading = false } = {}) {
  if (!row) return null;
  const post = adminPost(row, {
    liveAssets: row.published_revision_id ? listAssets(row.published_revision_id) : [],
    draftAssets: row.draft_revision_id ? listAssets(row.draft_revision_id) : [],
  });
  return withPreviewReading ? previewReading(post, row) : post;
}

function parseAssetPaths(req) {
  const raw = req.body?.assetRelPaths;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return String(raw).split("\n").map((item) => item.trim()).filter(Boolean);
  }
}


function stripSharedRoot(paths) {
  const normalized = paths.map((item) => String(item || "").replace(/\\/g, "/"));
  const firstSegs = normalized
    .map((item) => item.split("/").filter(Boolean)[0])
    .filter(Boolean);
  if (!firstSegs.length || firstSegs.length !== normalized.length) return normalized;
  const root = firstSegs[0];
  if (!root || !firstSegs.every((seg) => seg === root)) return normalized;
  const hasNested = normalized.some((item) => item.includes("/"));
  if (!hasNested) return normalized;
  return normalized.map((item) => {
    const prefix = root + "/";
    return item.startsWith(prefix) ? item.slice(prefix.length) : item;
  });
}

function settleCover(file) {
  if (!file) return null;
  const name = file.filename || path.basename(file.path);
  const dest = path.join(COVERS_DIR, name);
  fs.mkdirSync(COVERS_DIR, { recursive: true });
  fs.copyFileSync(file.path, dest);
  return name;
}

function unusedCover(filename, exceptPostId = null) {
  if (!filename) return;
  const base = path.basename(filename);
  if (base !== filename) return;
  const params = exceptPostId == null ? [base, base] : [base, base, exceptPostId];
  const sql = exceptPostId == null
    ? "SELECT 1 FROM post_revisions WHERE cover_file = ? UNION SELECT 1 FROM posts WHERE cover_file = ? LIMIT 1"
    : "SELECT 1 FROM post_revisions WHERE cover_file = ? UNION SELECT 1 FROM posts WHERE cover_file = ? AND id != ? LIMIT 1";
  const used = getDb().prepare(sql).get(...params);
  if (!used) {
    const full = path.join(COVERS_DIR, base);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
}

async function applyFilesToRevision(revisionId, req, { replaceAssets = false, htmlRequired = false } = {}) {
  const htmlFile = req.files?.html?.[0];
  const assetFiles = req.files?.assets || [];
  const zipFiles = req.files?.assetsZip || [];
  const assetPaths = stripSharedRoot(parseAssetPaths(req));

  if (htmlRequired && !htmlFile && !zipFiles.length) {
    throw new Error("请上传 HTML 文件");
  }

  if (replaceAssets) {
    clearAssets(revisionId, { keepHtml: !htmlFile });
  }

  if (htmlFile) {
    const raw = fs.readFileSync(htmlFile.path, "utf8");
    writeRevisionHtml(revisionId, raw);
  }

  for (const zip of zipFiles) {
    await extractZipToRevision(revisionId, zip.path, { skipHtml: Boolean(htmlFile) });
  }

  if (assetFiles.length) {
    assertBudget(
      revisionId,
      assetFiles.reduce((n, file) => n + (file.size || 0), 0),
      assetFiles.length
    );
    assetFiles.forEach((file, index) => {
      const hinted = assetPaths[index] || file.originalname;
      const rel = safeRelPath(hinted) || safeRelPath(path.basename(file.originalname || file.filename));
      if (!rel || !isAllowedAsset(rel)) {
        throw new Error(`不支持的附件：${hinted || file.originalname || ""}`);
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`「${rel}」超过 8 MB`);
      }
      writeAssetFile(revisionId, rel, file.path);
    });
  }

  if (!fs.existsSync(htmlPath(revisionId)) || !readRevisionHtml(revisionId)) {
    if (htmlRequired) throw new Error("请上传 HTML 文件");
  }
}

function ensureDraftRevision(post) {
  const db = getDb();
  if (post.draft_revision_id && post.draft_revision_id !== post.published_revision_id) {
    return post.draft_revision_id;
  }
  const sourceId = post.draft_revision_id || post.published_revision_id;
  const source = sourceId
    ? db.prepare("SELECT * FROM post_revisions WHERE id = ?").get(sourceId)
    : null;
  const info = db.prepare(`
    INSERT INTO post_revisions
      (post_id, title, summary, tags, category_id, cover_file, search_text, created_at, is_game)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    post.id,
    source?.title ?? post.title,
    source?.summary ?? post.summary ?? "",
    source?.tags ?? post.tags ?? "[]",
    source?.category_id ?? post.category_id ?? null,
    source?.cover_file ?? post.cover_file ?? null,
    source?.search_text ?? post.search_text ?? "",
    nowIso(),
    Number(source?.is_game ?? post.is_game ?? 0) ? 1 : 0
  );
  const newId = info.lastInsertRowid;
  if (sourceId) copyRevisionFiles(sourceId, newId);
  db.prepare("UPDATE posts SET draft_revision_id = ? WHERE id = ?").run(newId, post.id);
  return newId;
}

function updateRevisionMeta(revisionId, { title, summary, tags, categoryId, coverFile, html, isGame }) {
  const current = getDb().prepare("SELECT * FROM post_revisions WHERE id = ?").get(revisionId);
  if (!current) throw new Error("草稿版本不存在");
  const nextTitle = title ?? current.title;
  const nextSummary = summary ?? current.summary;
  const nextTags = tags ?? parseTags(current.tags);
  const nextCategoryId = categoryId === undefined ? current.category_id : categoryId;
  const nextCover = coverFile === undefined ? current.cover_file : coverFile;
  const nextIsGame = isGame === undefined ? Number(current.is_game || 0) : (isGame ? 1 : 0);
  const raw = html ?? readRevisionHtml(revisionId) ?? "";
  const categoryName = getCategoryById(nextCategoryId)?.name || "";
  const search = searchTextOf({
    title: nextTitle,
    summary: nextSummary,
    tags: nextTags,
    categoryName,
    html: raw,
  });
  getDb().prepare(`
    UPDATE post_revisions SET
      title = ?, summary = ?, tags = ?, category_id = ?, cover_file = ?, search_text = ?, created_at = ?, is_game = ?
    WHERE id = ?
  `).run(
    nextTitle,
    nextSummary,
    JSON.stringify(nextTags),
    nextCategoryId,
    nextCover,
    search,
    nowIso(),
    nextIsGame,
    revisionId
  );
  return getDb().prepare("SELECT * FROM post_revisions WHERE id = ?").get(revisionId);
}

function syncLiveFieldsFromDraft(postId) {
  const post = getDb().prepare("SELECT * FROM posts WHERE id = ?").get(postId);
  const draft = post?.draft_revision_id
    ? getDb().prepare("SELECT * FROM post_revisions WHERE id = ?").get(post.draft_revision_id)
    : null;
  if (!post || !draft) return;
  getDb().prepare(`
    UPDATE posts SET
      title = ?, summary = ?, tags = ?, cover_file = ?, search_text = ?, category_id = ?, is_game = ?, updated_at = ?
    WHERE id = ?
  `).run(
    draft.title,
    draft.summary,
    draft.tags,
    draft.cover_file,
    draft.search_text,
    draft.category_id,
    Number(draft.is_game || 0) ? 1 : 0,
    nowIso(),
    postId
  );
}

function publishPost(postId) {
  const post = getDb().prepare("SELECT * FROM posts WHERE id = ?").get(postId);
  if (!post) throw new Error("文章不存在");
  if (!post.draft_revision_id) throw new Error("没有可发布的草稿");
  const draft = getDb().prepare("SELECT * FROM post_revisions WHERE id = ?").get(post.draft_revision_id);
  if (!draft) throw new Error("没有可发布的草稿");
  const draftHtml = readRevisionHtml(draft.id);
  if (!draftHtml) throw new Error("草稿还没有正文，请先上传 HTML");
  const minutes = readingMinutesFromHtml(draftHtml, Number(draft.is_game) === 1);
  const oldPublished = post.published_revision_id;
  getDb().prepare(`
    UPDATE posts SET
      published = 1,
      published_revision_id = ?,
      draft_revision_id = ?,
      title = ?,
      summary = ?,
      tags = ?,
      cover_file = ?,
      search_text = ?,
      category_id = ?,
      is_game = ?,
      reading_minutes = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    draft.id,
    draft.id,
    draft.title,
    draft.summary,
    draft.tags,
    draft.cover_file,
    draft.search_text,
    draft.category_id,
    Number(draft.is_game || 0) ? 1 : 0,
    minutes,
    nowIso(),
    postId
  );
  if (oldPublished && oldPublished !== draft.id) {
    removeRevisionDir(oldPublished);
    getDb().prepare("DELETE FROM post_revisions WHERE id = ?").run(oldPublished);
  }
  indexPublishedRow(getDb().prepare("SELECT * FROM posts WHERE id = ?").get(postId));
  const leftover = getDb().prepare("SELECT cover_file FROM post_revisions WHERE post_id = ?").all(postId);
  unusedCover(post.cover_file, postId);
  for (const row of leftover) unusedCover(row.cover_file);
  return getPostById(postId);
}

function articleTheme(value) {
  if (value === "dark" || value === "light") return value;
  return "";
}

function sendArticleDocument(res, revisionId, title, { cache = "private, no-store", theme = "" } = {}) {
  const raw = readRevisionHtml(revisionId);
  if (raw == null) {
    return res.status(404).type("html").send("<!DOCTYPE html><title>未找到</title><p>正文文件缺失</p>");
  }
  const html = buildArticleDocument(raw, { title, theme: articleTheme(theme) });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  // HTML is generated with a frame-resize script; never let a stale copy keep growing the iframe.
  res.setHeader("Cache-Control", "private, no-store");
  return res.send(html);
}

function sendRevisionAsset(res, revisionId, rel, { cache, title, theme }) {
  const clean = (rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean === "index.html" || clean === "index.htm") {
    return sendArticleDocument(res, revisionId, title, { cache, theme });
  }
  const full = resolveAsset(revisionId, clean);
  if (!full) return res.status(404).type("text").send("未找到附件");
  if (isHtmlPath(clean)) {
    const raw = fs.readFileSync(full, "utf8");
    const html = buildArticleDocument(raw, { title: path.basename(clean), theme: articleTheme(theme) });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(html);
  }
  res.setHeader("Content-Type", mimeFor(full));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", cache);
  if (path.extname(full).toLowerCase() === ".svg") {
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:");
  }
  return res.sendFile(full);
}

// ---------- article media (HTML + attachments share a prefix) ----------

app.use("/media/articles/:slug/live", (req, res) => {
  if ((req.path === "/" || req.path === "") && !(req.originalUrl.split("?")[0] || "").endsWith("/")) {
    const suffix = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    return res.redirect(301, req.baseUrl + "/" + suffix);
  }
  const row = getPostBySlug(req.params.slug);
  if (!row || !row.published || !row.published_revision_id) {
    return res.status(404).type("html").send("<!DOCTYPE html><title>未找到</title><p>文章不存在</p>");
  }
  const rel = decodeURIComponent((req.path || "/")).replace(/^\/+/, "");
  return sendRevisionAsset(res, row.published_revision_id, rel, {
    cache: "public, max-age=300",
    title: row.title,
    theme: articleTheme(req.query.theme),
  });
});

app.use("/media/articles/:slug/p/:token", (req, res) => {
  if ((req.path === "/" || req.path === "") && !(req.originalUrl.split("?")[0] || "").endsWith("/")) {
    const suffix = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    return res.redirect(301, req.baseUrl + "/" + suffix);
  }
  const row = getPostBySlug(req.params.slug);
  if (!row || !row.preview_token || !row.draft_revision_id) {
    return res.status(404).type("html").send("<!DOCTYPE html><title>未找到</title><p>预览不存在</p>");
  }
  if (!safePasswordEqual(req.params.token, row.preview_token)) {
    return res.status(404).type("html").send("<!DOCTYPE html><title>未找到</title><p>预览不存在</p>");
  }
  const draft = getDb().prepare("SELECT * FROM post_revisions WHERE id = ?").get(row.draft_revision_id);
  const rel = decodeURIComponent((req.path || "/")).replace(/^\/+/, "");
  return sendRevisionAsset(res, row.draft_revision_id, rel, {
    cache: "private, no-store",
    title: draft?.title || row.title,
    theme: articleTheme(req.query.theme),
  });
});

// ---------- public API ----------

app.get("/api/config", (_req, res) => {
  res.json({ siteName: SITE_NAME, categories: listCategories() });
});

app.get("/api/categories", (_req, res) => {
  res.json({ categories: listCategories() });
});

app.get("/api/categories/:slug", (req, res) => {
  const category = getCategoryBySlug(req.params.slug);
  if (!category) return res.status(404).json({ error: "专题不存在" });
  const sort = parseFeedSort(req.query.sort);
  const result = listPublished({
    whereSql: "posts.published = 1 AND posts.category_id = ?",
    params: [category.id],
    sort,
    pageQuery: req.query,
  });
  res.json({ ...result, category });
});

app.get("/api/tags/:name", (req, res) => {
  const name = String(req.params.name || "").trim();
  if (!name || name.length > 20) return res.status(404).json({ error: "标签不存在" });
  const sort = parseFeedSort(req.query.sort);
  const result = listPublished({
    whereSql: "posts.published = 1 AND EXISTS (SELECT 1 FROM json_each(posts.tags) AS jt WHERE jt.value = ?)",
    params: [name],
    sort,
    pageQuery: req.query,
  });
  res.json({ ...result, tag: name });
});

app.get("/api/posts", (req, res) => {
  if (req.query.slugs != null) {
    const slugs = [...new Set(String(req.query.slugs).split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 100);
    if (!slugs.length) {
      return res.json(pageResult({ posts: [], total: 0, page: 1, limit: 0 }));
    }
    const placeholders = slugs.map(() => "?").join(",");
    const rows = getDb()
      .prepare(`${POST_SELECT} WHERE posts.published = 1 AND posts.slug IN (${placeholders})`)
      .all(...slugs);
    const bySlug = new Map(rows.map((row) => [row.slug, publicPost(row)]));
    const posts = slugs.map((slug) => bySlug.get(slug)).filter(Boolean);
    return res.json(pageResult({ posts, total: posts.length, page: 1, limit: posts.length || 1 }));
  }
  const slug = String(req.query.category || "").trim();
  const sort = parseFeedSort(req.query.sort);
  if (slug) {
    const category = getCategoryBySlug(slug);
    if (!category) {
      const { page, limit } = pageParams(req.query);
      return res.json(pageResult({ posts: [], total: 0, page, limit, extra: { category: null, sort } }));
    }
    const result = listPublished({
      whereSql: "posts.published = 1 AND posts.category_id = ?",
      params: [category.id],
      sort,
      pageQuery: req.query,
    });
    return res.json({ ...result, category });
  }
  const result = listPublished({
    whereSql: "posts.published = 1",
    params: [],
    sort,
    pageQuery: req.query,
  });
  res.json(result);
});

app.get("/api/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  const { page, limit, offset } = pageParams(req.query);
  if (!q) return res.json(pageResult({ posts: [], total: 0, page, limit, extra: { query: q } }));
  const match = buildMatchQuery(q);
  if (!match) return res.json(pageResult({ posts: [], total: 0, page, limit, extra: { query: q } }));
  try {
    const total = getDb().prepare(`
      SELECT COUNT(*) AS n
        FROM posts_fts
        JOIN posts ON posts.id = posts_fts.rowid
       WHERE posts.published = 1 AND posts_fts MATCH ?
    `).get(match).n;
    const ids = getDb().prepare(`
      SELECT posts.id
        FROM posts_fts
        JOIN posts ON posts.id = posts_fts.rowid
       WHERE posts.published = 1 AND posts_fts MATCH ?
       ORDER BY datetime(posts.created_at) DESC, posts.id DESC
       LIMIT ? OFFSET ?
    `).all(match, limit, offset);
    const posts = ids.map(({ id }) => {
      const row = getPostById(id);
      const post = publicPost(row);
      if (!post) return null;
      return { ...post, snippet: buildSnippet(row.search_text, q) };
    }).filter(Boolean);
    res.json(pageResult({ posts, total, page, limit, extra: { query: q } }));
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "搜索词无法解析" });
  }
});

app.get("/api/posts/:slug", (req, res) => {
  const row = getPostBySlug(req.params.slug);
  if (!row || !row.published) return res.status(404).json({ error: "文章不存在" });
  const post = publicPost(row);
  let readingMinutes = post.readingMinutes;
  if (!post.isGame && readingMinutes == null) {
    const html = row.published_revision_id ? (readRevisionHtml(row.published_revision_id) || "") : "";
    readingMinutes = estimateReadingMinutes(compactText(html));
    getDb().prepare("UPDATE posts SET reading_minutes = ? WHERE id = ?").run(readingMinutes, row.id);
  }
  res.json({
    post: {
      ...post,
      readingMinutes: post.isGame ? null : readingMinutes,
      contentUrl: `/media/articles/${row.slug}/live/`,
    },
    prev: neighborPost(row, "older"),
    next: neighborPost(row, "newer"),
    related: relatedPosts(row),
  });
});

app.get("/api/posts/:slug/content", (req, res) => {
  const row = getPostBySlug(req.params.slug);
  if (!row || !row.published) {
    return res.status(404).type("html").send("<!DOCTYPE html><title>未找到</title><p>文章不存在</p>");
  }
  res.redirect(302, `/media/articles/${encodeURIComponent(row.slug)}/live/`);
});

// ---------- admin auth ----------

app.get("/api/admin/me", (req, res) => {
  res.json({ unlocked: isUnlocked(req), siteName: SITE_NAME, categories: listCategories() });
});

app.post("/api/admin/unlock", (req, res) => {
  const password = String(req.body?.password ?? "");
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: "服务器尚未配置 ADMIN_PASSWORD" });
  }
  if (!safePasswordEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "口令不正确" });
  }
  setSession(res);
  res.json({ ok: true });
});

app.post("/api/admin/lock", (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get("/api/admin/categories", requireAdmin, (_req, res) => {
  res.json({ categories: listAdminCategories() });
});

app.post("/api/admin/categories", requireAdmin, (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "请填写分类名称" });
  if (name.length > 20) return res.status(400).json({ error: "分类名称请控制在 20 字以内" });
  const category = ensureCategoryByName(name);
  res.status(201).json({ category, categories: listAdminCategories() });
});

app.put("/api/admin/categories/order", requireAdmin, (req, res) => {
  try {
    reorderCategories(req.body?.ids);
    res.json({ categories: listAdminCategories() });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || "排序失败" });
  }
});

app.patch("/api/admin/categories/:id", requireAdmin, (req, res) => {
  try {
    const updated = renameCategory(Number(req.params.id), req.body?.name);
    reindexPublishedInCategory(updated.id);
    res.json({ category: updated, categories: listAdminCategories() });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || "改名失败" });
  }
});

app.delete("/api/admin/categories/:id", requireAdmin, (req, res) => {
  try {
    deleteCategory(Number(req.params.id));
    res.json({ ok: true, categories: listAdminCategories() });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || "删除失败" });
  }
});

// ---------- admin posts ----------

app.get("/api/admin/posts", requireAdmin, (_req, res) => {
  const rows = getDb()
    .prepare(`${POST_SELECT} ORDER BY datetime(posts.created_at) DESC, posts.id DESC`)
    .all();
  res.json({ posts: rows.map((row) => toAdmin(row)), categories: listAdminCategories() });
});

app.get("/api/admin/posts/slug/:slug", requireAdmin, (req, res) => {
  const row = getPostBySlug(req.params.slug);
  if (!row) return res.status(404).json({ error: "文章不存在" });
  res.json({ post: toAdmin(row, { withPreviewReading: true }) });
});

app.get("/api/admin/posts/:id", requireAdmin, (req, res) => {
  const row = getPostById(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "文章不存在" });
  res.json({ post: toAdmin(row, { withPreviewReading: true }) });
});

app.post("/api/admin/posts", requireAdmin, formUpload, async (req, res) => {
  try {
    const title = String(req.body?.title ?? "").trim();
    const summary = String(req.body?.summary ?? "").trim().slice(0, 400);
    const tags = parseTags(req.body?.tags);
    const intent = String(req.body?.intent || "draft");
    let categoryId = resolveCategoryId(req.body);
    const auto = maybeAutoCategory(categoryId ?? null, tags);
    categoryId = auto.categoryId;
    const isGame = parseIsGame(req.body?.isGame ?? req.body?.is_game, 0) ? 1 : 0;
    if (!title) throw new Error("请填写标题");
    if (title.length > 80) throw new Error("标题请控制在 80 字以内");

    const created = nowIso();
    const slug = makeSlug();
    const uploadedCover = settleCover(req.files?.cover?.[0]);
    const db = getDb();
    const info = db.prepare(`
      INSERT INTO posts
        (slug, title, summary, tags, cover_file, html_file, search_text, published,
         created_at, updated_at, category_id, published_revision_id, draft_revision_id, preview_token, is_game)
      VALUES (?, ?, ?, ?, ?, '', ?, 0, ?, ?, ?, NULL, NULL, ?, ?)
    `).run(
      slug,
      title,
      summary,
      JSON.stringify(tags),
      uploadedCover,
      "",
      created,
      created,
      categoryId ?? null,
      newPreviewToken(),
      isGame
    );
    const postId = info.lastInsertRowid;
    const revInfo = db.prepare(`
      INSERT INTO post_revisions
        (post_id, title, summary, tags, category_id, cover_file, search_text, created_at, is_game)
      VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)
    `).run(postId, title, summary, JSON.stringify(tags), categoryId ?? null, uploadedCover, created, isGame);
    const revId = revInfo.lastInsertRowid;
    db.prepare("UPDATE posts SET draft_revision_id = ? WHERE id = ?").run(revId, postId);

    await applyFilesToRevision(revId, req, { htmlRequired: true });
    const coverName = uploadedCover ?? (req.body?.coverAsset
      ? settleCoverFromAsset(revId, req.body.coverAsset)
      : null);
    updateRevisionMeta(revId, {
      title,
      summary,
      tags,
      categoryId: categoryId ?? null,
      coverFile: coverName,
      isGame,
    });
    syncLiveFieldsFromDraft(postId);

    if (intent === "publish") {
      publishPost(postId);
    }

    cleanupReq(req);
    res.status(201).json({
      post: toAdmin(getPostById(postId)),
      autoCategory: auto.autoCategory || null,
    });
  } catch (err) {
    cleanupReq(req);
    return res.status(400).json({ error: err.message || "保存失败" });
  }
});

app.patch("/api/admin/posts/:id", requireAdmin, formUpload, async (req, res) => {
  const row = getPostById(Number(req.params.id));
  if (!row) {
    cleanupReq(req);
    return res.status(404).json({ error: "文章不存在" });
  }
  try {
    const title = req.body?.title != null ? String(req.body.title).trim() : undefined;
    const summary = req.body?.summary != null ? String(req.body.summary).trim().slice(0, 400) : undefined;
    const tags = req.body?.tags != null ? parseTags(req.body.tags) : undefined;
    let categoryId = resolveCategoryId(req.body);
    const isGame = parseIsGame(req.body?.isGame ?? req.body?.is_game, undefined);
    if (title !== undefined && !title) throw new Error("请填写标题");
    if (title !== undefined && title.length > 80) throw new Error("标题请控制在 80 字以内");

    const draftId = ensureDraftRevision(row);
    const replaceAssets = req.body?.replaceAssets === "1" || req.body?.replaceAssets === 1;
    await applyFilesToRevision(draftId, req, { replaceAssets, htmlRequired: false });

    const currentDraft = getDb().prepare("SELECT * FROM post_revisions WHERE id = ?").get(draftId);
    const resolvedTags = tags ?? parseTags(currentDraft?.tags);
    const currentCategoryId = categoryId === undefined ? currentDraft?.category_id ?? null : categoryId;
    let autoCategory = null;
    if (!currentCategoryId) {
      const auto = maybeAutoCategory(null, resolvedTags);
      if (auto.autoCategory) {
        categoryId = auto.categoryId;
        autoCategory = auto.autoCategory;
      }
    }

    const coverName = req.files?.cover?.[0]
      ? settleCover(req.files.cover[0])
      : (req.body?.coverAsset ? settleCoverFromAsset(draftId, req.body.coverAsset) : undefined);
    const updated = updateRevisionMeta(draftId, {
      title,
      summary,
      tags,
      categoryId,
      coverFile: coverName,
      isGame,
    });
    const fresh = getDb().prepare("SELECT * FROM posts WHERE id = ?").get(row.id);
    if (!fresh.published) {
      syncLiveFieldsFromDraft(row.id);
    } else {
      getDb().prepare("UPDATE posts SET updated_at = ? WHERE id = ?").run(nowIso(), row.id);
    }
    if (coverName && updated.cover_file !== row.cover_file) {
      // keep old cover if still referenced by live revision
    }
    cleanupReq(req);
    const intent = String(req.body?.intent || "draft");
    if (intent === "publish") {
      publishPost(row.id);
    }
    res.json({ post: toAdmin(getPostById(row.id)), autoCategory });
  } catch (err) {
    cleanupReq(req);
    return res.status(400).json({ error: err.message || "保存失败" });
  }
});

app.post("/api/admin/posts/:id/publish", requireAdmin, (req, res) => {
  try {
    const row = getPostById(Number(req.params.id));
    if (!row) return res.status(404).json({ error: "文章不存在" });
    const published = publishPost(row.id);
    res.json({ post: toAdmin(published) });
  } catch (err) {
    res.status(400).json({ error: err.message || "发布失败" });
  }
});

app.post("/api/admin/posts/:id/unpublish", requireAdmin, (req, res) => {
  const row = getPostById(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "文章不存在" });
  getDb().prepare("UPDATE posts SET published = 0, updated_at = ? WHERE id = ?").run(nowIso(), row.id);
  removePostSearch(getDb(), row.id);
  res.json({ post: toAdmin(getPostById(row.id)) });
});

app.delete("/api/admin/posts/:id", requireAdmin, (req, res) => {
  const row = getDb().prepare("SELECT * FROM posts WHERE id = ?").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "文章不存在" });
  const revs = getDb().prepare("SELECT id, cover_file FROM post_revisions WHERE post_id = ?").all(row.id);
  removePostSearch(getDb(), row.id);
  getDb().prepare("DELETE FROM posts WHERE id = ?").run(row.id);
  for (const rev of revs) {
    removeRevisionDir(rev.id);
    unusedCover(rev.cover_file);
  }
  unusedCover(row.cover_file);
  res.json({ ok: true });
});

// ---------- frontend ----------

const distDir = path.join(ROOT, "client", "dist");

if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir, { index: false, maxAge: "1h" }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/media")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res
      .status(503)
      .type("text")
      .send("前端尚未构建。开发请运行 npm run dev；生产请先运行 npm start 或 npm run build。");
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "服务器出错了" });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`${SITE_NAME} 已启动：http://127.0.0.1:${PORT}`);
  if (!ADMIN_PASSWORD) console.warn("警告：未设置 ADMIN_PASSWORD，后台将无法解锁。");
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    console.log("未检测到前端构建结果。生产环境请先执行 npm run build；开发可用 npm run dev。");
  }
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
