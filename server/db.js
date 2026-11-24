import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = path.join(ROOT, "data");
export const POSTS_DIR = path.join(DATA_DIR, "posts");
export const COVERS_DIR = path.join(DATA_DIR, "covers");
export const REVISIONS_DIR = path.join(DATA_DIR, "revisions");
export const TMP_DIR = path.join(DATA_DIR, "tmp");
export const DB_PATH = path.join(DATA_DIR, "blog.db");

export const DEFAULT_CATEGORIES = [
  { slug: "jishu", name: "技术", sortOrder: 1 },
  { slug: "shenghuo", name: "生活", sortOrder: 2 },
];

export const SEED_CATEGORY_BY_SLUG = {
  "bendi-biji": "jishu",
  "bangwan-sanbu": "shenghuo",
  "zuowan-yijian-xiaoshi": "shenghuo",
};

export function ensureDirs() {
  for (const dir of [DATA_DIR, POSTS_DIR, COVERS_DIR, REVISIONS_DIR, TMP_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

let db;

export function getDb() {
  if (db) return db;
  ensureDirs();
  const isNew = !fs.existsSync(DB_PATH);
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      cover_file TEXT,
      html_file TEXT NOT NULL DEFAULT '',
      search_text TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_posts_published_created
      ON posts (published, created_at DESC);
  `);
  migrate(db);
  getDb.isNew = isNew;
  return db;
}

function tableExists(database, name) {
  return Boolean(
    database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  );
}

function columnNames(database, table) {
  return database.prepare(`PRAGMA table_info(${table})`).all().map((col) => col.name);
}

function addColumn(database, table, def) {
  const name = def.split(/\s+/)[0];
  const cols = columnNames(database, table);
  if (!cols.includes(name)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`);
  }
}

function migrateTo2(database) {
  const tx = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS post_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        cover_file TEXT,
        search_text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_revisions_post ON post_revisions (post_id);
    `);

    addColumn(database, "posts", "category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL");
    addColumn(database, "posts", "published_revision_id INTEGER");
    addColumn(database, "posts", "draft_revision_id INTEGER");
    addColumn(database, "posts", "preview_token TEXT");

    ensureDefaultCategories(database);

    const posts = database.prepare("SELECT * FROM posts").all();
    const hasRevision = database.prepare(
      "SELECT id FROM post_revisions WHERE post_id = ? ORDER BY id ASC LIMIT 1"
    );
    const insertRev = database.prepare(`
      INSERT INTO post_revisions
        (post_id, title, summary, tags, category_id, cover_file, search_text, created_at)
      VALUES
        (@post_id, @title, @summary, @tags, @category_id, @cover_file, @search_text, @created_at)
    `);
    const updatePost = database.prepare(`
      UPDATE posts
         SET category_id = ?,
             published_revision_id = ?,
             draft_revision_id = ?,
             preview_token = COALESCE(preview_token, ?)
       WHERE id = ?
    `);

    for (const row of posts) {
      if (hasRevision.get(row.id)) {
        if (!row.preview_token || !row.draft_revision_id) {
          const existing = hasRevision.get(row.id);
          updatePost.run(
            row.category_id ?? null,
            row.published && existing ? existing.id : row.published_revision_id,
            row.draft_revision_id || existing?.id || null,
            row.preview_token || newPreviewToken(),
            row.id
          );
        }
        continue;
      }

      const info = insertRev.run({
        post_id: row.id,
        title: row.title,
        summary: row.summary || "",
        tags: row.tags || "[]",
        category_id: row.category_id ?? null,
        cover_file: row.cover_file,
        search_text: row.search_text || "",
        created_at: row.updated_at || row.created_at || nowIso(),
      });
      const revId = info.lastInsertRowid;
      const destDir = path.join(REVISIONS_DIR, String(revId));
      fs.mkdirSync(destDir, { recursive: true });
      const srcName = row.html_file && path.basename(row.html_file);
      const src = srcName ? path.join(POSTS_DIR, srcName) : null;
      if (src && fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(destDir, "index.html"));
      } else {
        fs.writeFileSync(path.join(destDir, "index.html"), "", "utf8");
      }
      const publishedRev = row.published ? revId : null;
      updatePost.run(
        row.category_id ?? null,
        publishedRev,
        revId,
        row.preview_token || newPreviewToken(),
        row.id
      );
    }

    database.pragma("user_version = 2");
  });

  tx();
  assignSeedCategories(database);
}

function migrateTo3(database) {
  const version = Number(database.pragma("user_version", { simple: true }) || 0);
  if (version >= 3) return;
  addColumn(database, "posts", "is_game INTEGER NOT NULL DEFAULT 0");
  if (tableExists(database, "post_revisions")) {
    addColumn(database, "post_revisions", "is_game INTEGER NOT NULL DEFAULT 0");
  }
  database.pragma("user_version = 3");
}

function migrate(database) {
  const version = Number(database.pragma("user_version", { simple: true }) || 0);
  if (version < 2 || !tableExists(database, "post_revisions") || !tableExists(database, "categories")) {
    migrateTo2(database);
  } else {
    ensureDefaultCategories(database);
    assignSeedCategories(database);
  }
  migrateTo3(database);
}

function ensureDefaultCategories(database) {
  const insert = database.prepare(`
    INSERT INTO categories (slug, name, sort_order, created_at)
    VALUES (@slug, @name, @sort_order, @created_at)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      sort_order = excluded.sort_order
  `);
  for (const cat of DEFAULT_CATEGORIES) {
    insert.run({
      slug: cat.slug,
      name: cat.name,
      sort_order: cat.sortOrder,
      created_at: nowIso(),
    });
  }
}

function assignSeedCategories(database) {
  const find = database.prepare("SELECT id FROM categories WHERE slug = ?");
  const update = database.prepare(
    "UPDATE posts SET category_id = ? WHERE slug = ? AND category_id IS NULL"
  );
  const updateRev = database.prepare(
    `UPDATE post_revisions
        SET category_id = ?
      WHERE post_id = (SELECT id FROM posts WHERE slug = ?)
        AND category_id IS NULL`
  );
  for (const [postSlug, catSlug] of Object.entries(SEED_CATEGORY_BY_SLUG)) {
    const cat = find.get(catSlug);
    if (!cat) continue;
    update.run(cat.id, postSlug);
    updateRev.run(cat.id, postSlug);
  }
}

export function newPreviewToken() {
  return crypto.randomBytes(16).toString("hex");
}

export function parseTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return normalizeTags(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeTags(parsed);
    } catch {
      // comma / whitespace separated
    }
    return normalizeTags(trimmed.split(/[,，、]/));
  }
  return [];
}

function normalizeTags(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const tag = String(item ?? "").trim().slice(0, 20);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

export function listCategories() {
  return getDb()
    .prepare("SELECT id, slug, name, sort_order AS sortOrder FROM categories ORDER BY sort_order ASC, id ASC")
    .all();
}

export function getCategoryBySlug(slug) {
  return getDb().prepare("SELECT id, slug, name, sort_order AS sortOrder FROM categories WHERE slug = ?").get(slug);
}

export function getCategoryById(id) {
  if (!id) return null;
  return getDb().prepare("SELECT id, slug, name, sort_order AS sortOrder FROM categories WHERE id = ?").get(id);
}

export function slugifyCategory(name) {
  const trimmed = String(name || "").trim().slice(0, 20);
  const preset = { 技术: "jishu", 生活: "shenghuo" };
  if (preset[trimmed]) return preset[trimmed];
  const ascii = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (ascii) return ascii;
  return `topic-${crypto.randomBytes(3).toString("hex")}`;
}

export function ensureCategoryByName(name) {
  const trimmed = String(name || "").trim().slice(0, 20);
  if (!trimmed) return null;
  const existing = getDb().prepare("SELECT id, slug, name, sort_order AS sortOrder FROM categories WHERE name = ?").get(trimmed);
  if (existing) return existing;
  let slug = slugifyCategory(trimmed);
  const taken = getDb().prepare("SELECT 1 FROM categories WHERE slug = ?");
  if (taken.get(slug)) {
    slug = `${slug}-${crypto.randomBytes(2).toString("hex")}`;
  }
  const maxSort = getDb().prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM categories").get().n;
  const info = getDb()
    .prepare(
      "INSERT INTO categories (slug, name, sort_order, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(slug, trimmed, maxSort + 1, nowIso());
  return getCategoryById(info.lastInsertRowid);
}

export function publicCategory(row) {
  if (!row || (!row.category_slug && !row.category_id && !row.slug)) return null;
  if (row.category_slug || row.category_name) {
    return { slug: row.category_slug, name: row.category_name };
  }
  if (row.slug && row.name && row.sortOrder != null) {
    return { slug: row.slug, name: row.name };
  }
  return null;
}

function mapCategory(row, prefix = "") {
  const slug = row[`${prefix}category_slug`] ?? row.category_slug;
  const name = row[`${prefix}category_name`] ?? row.category_name;
  if (!slug || !name) return null;
  return { slug, name };
}

export function postStatus(row) {
  if (!row) return "draft";
  if (!row.published) return "draft";
  if (row.draft_revision_id && row.published_revision_id && Number(row.draft_revision_id) !== Number(row.published_revision_id)) {
    return "published_with_changes";
  }
  return "published";
}

export function publicPost(row, { includeDraft = false } = {}) {
  if (!row) return null;
  if (!includeDraft && !row.published) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary || "",
    tags: parseTags(row.tags),
    category: mapCategory(row),
    coverUrl: row.cover_file ? `/media/covers/${row.cover_file}` : null,
    published: Boolean(row.published),
    isGame: Boolean(Number(row.is_game || 0)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function revisionPayload(row, prefix, assets = []) {
  if (!row || !row[`${prefix}id`]) return null;
  const cover = row[`${prefix}cover_file`];
  return {
    id: row[`${prefix}id`],
    title: row[`${prefix}title`],
    summary: row[`${prefix}summary`] || "",
    tags: parseTags(row[`${prefix}tags`]),
    categoryId: row[`${prefix}category_id`] ?? null,
    category: row[`${prefix}category_slug`]
      ? { slug: row[`${prefix}category_slug`], name: row[`${prefix}category_name`] }
      : null,
    coverUrl: cover ? `/media/covers/${cover}` : null,
    coverFile: cover,
    isGame: Boolean(Number(row[`${prefix}is_game`] || 0)),
    assets,
    createdAt: row[`${prefix}created_at`],
  };
}

export function adminPost(row, { liveAssets = [], draftAssets = [] } = {}) {
  if (!row) return null;
  const status = postStatus(row);
  const live = row.published_revision_id
    ? {
        id: row.published_revision_id,
        title: row.title,
        summary: row.summary || "",
        tags: parseTags(row.tags),
        categoryId: row.category_id ?? null,
        category: mapCategory(row),
        coverUrl: row.cover_file ? `/media/covers/${row.cover_file}` : null,
        coverFile: row.cover_file,
        isGame: Boolean(Number(row.is_game || 0)),
        assets: liveAssets,
      }
    : null;
  const draft = revisionPayload(
    {
      d_id: row.d_id ?? row.draft_revision_id,
      d_title: row.d_title ?? row.draft_title,
      d_summary: row.d_summary ?? row.draft_summary,
      d_tags: row.d_tags ?? row.draft_tags,
      d_cover_file: row.d_cover_file ?? row.draft_cover_file,
      d_created_at: row.d_created_at ?? row.draft_created_at,
      d_category_id: row.d_category_id ?? row.draft_category_id ?? row.category_id,
      d_category_slug: row.d_category_slug,
      d_category_name: row.d_category_name,
      d_is_game: row.d_is_game ?? row.draft_is_game ?? row.is_game,
    },
    "d_",
    draftAssets
  );
  const shown = draft || live || publicPost(row, { includeDraft: true });
  return {
    id: row.id,
    slug: row.slug,
    published: Boolean(row.published),
    status,
    title: shown?.title || row.title,
    summary: shown?.summary || row.summary || "",
    tags: shown?.tags || parseTags(row.tags),
    category: shown?.category || mapCategory(row),
    categoryId: shown?.categoryId ?? row.category_id ?? null,
    coverUrl: shown?.coverUrl || (row.cover_file ? `/media/covers/${row.cover_file}` : null),
    isGame: Boolean(shown?.isGame ?? Number(row.is_game || 0)),
    previewToken: row.preview_token,
    previewUrl: row.preview_token ? `/media/articles/${row.slug}/p/${row.preview_token}/` : null,
    liveUrl: row.published ? `/media/articles/${row.slug}/live/` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    live,
    draft,
  };
}

export const POST_SELECT = `
  SELECT posts.*,
         c.slug AS category_slug,
         c.name AS category_name,
         d.id AS d_id,
         d.title AS d_title,
         d.summary AS d_summary,
         d.tags AS d_tags,
         d.cover_file AS d_cover_file,
         d.created_at AS d_created_at,
         d.category_id AS d_category_id,
         d.is_game AS d_is_game,
         dc.slug AS d_category_slug,
         dc.name AS d_category_name
    FROM posts
    LEFT JOIN categories c ON c.id = posts.category_id
    LEFT JOIN post_revisions d ON d.id = posts.draft_revision_id
    LEFT JOIN categories dc ON dc.id = d.category_id
`;

export function nowIso() {
  return new Date().toISOString();
}
