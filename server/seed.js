import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { compactText } from "./html.js";
import { readingMinutesFromHtml, upsertPostSearch } from "./fts.js";
import {
  ROOT,
  POSTS_DIR,
  COVERS_DIR,
  ensureDirs,
  getDb,
  nowIso,
  newPreviewToken,
  listCategories,
  SEED_CATEGORY_BY_SLUG,
} from "./db.js";
import {
  copyTreeIntoRevision,
  removeRevisionDir,
  writeRevisionHtml,
} from "./assets.js";

dotenv.config({ path: path.join(ROOT, ".env") });

const SEED_DIR = path.join(ROOT, "seed");

const SEED_POSTS = [
  {
    slug: "bendi-biji",
    title: "把笔记从云端搬回本地之后",
    summary:
      "不是为了更极客，只是想让自己的句子重新长在一个我能摸到的文件夹里。",
    tags: ["技术", "笔记"],
    html: "bendi-biji.html",
    cover: "bendi-biji.svg",
    attachments: path.join(SEED_DIR, "attachments", "bendi-biji"),
    createdAt: "2026-10-18T09:30:00.000Z",
  },
  {
    slug: "bangwan-sanbu",
    title: "傍晚散步时，城市会把声音还给你",
    summary: "下班后不急着回家，沿河走二十分钟，很多白天听不见的东西就回来了。",
    tags: ["生活", "散步"],
    html: "bangwan-sanbu.html",
    cover: "bangwan-sanbu.svg",
    createdAt: "2026-10-29T12:00:00.000Z",
  },
  {
    slug: "zuowan-yijian-xiaoshi",
    title: "少买工具，多把一件小事做完",
    summary: "收藏夹越来越满的时候，往往不是缺方法，是缺一次真正的收尾。",
    tags: ["生活", "工作"],
    html: "zuowan-yijian-xiaoshi.html",
    cover: "zuowan-yijian-xiaoshi.svg",
    createdAt: "2026-11-06T08:10:00.000Z",
  },
];

function categoryIdFor(slug) {
  const catSlug = SEED_CATEGORY_BY_SLUG[slug];
  if (!catSlug) return null;
  const cat = listCategories().find((item) => item.slug === catSlug);
  return cat?.id ?? null;
}

function searchTextOf(post, raw) {
  const categoryName = listCategories().find((item) => item.slug === SEED_CATEGORY_BY_SLUG[post.slug])?.name || "";
  return [post.title, post.summary, post.tags.join(" "), categoryName, compactText(raw)]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function seedIfNeeded({ force = false } = {}) {
  ensureDirs();
  const db = getDb();
  const flagPath = path.join(path.dirname(POSTS_DIR), ".initialized");
  const count = db.prepare("SELECT COUNT(*) AS n FROM posts").get().n;

  if (!force && (count > 0 || fs.existsSync(flagPath))) {
    return { seeded: false, reason: count > 0 ? "already-has-posts" : "already-initialized" };
  }

  const findPost = db.prepare("SELECT * FROM posts WHERE slug = ?");
  const listRevs = db.prepare("SELECT id FROM post_revisions WHERE post_id = ?");
  const insertPost = db.prepare(`
    INSERT INTO posts
      (slug, title, summary, tags, cover_file, html_file, search_text, published,
       created_at, updated_at, category_id, published_revision_id, draft_revision_id, preview_token,
       reading_minutes)
    VALUES
      (@slug, @title, @summary, @tags, @cover_file, @html_file, @search_text, 1,
       @created_at, @updated_at, @category_id, NULL, NULL, @preview_token,
       @reading_minutes)
  `);
  const updatePost = db.prepare(`
    UPDATE posts SET
      title = @title,
      summary = @summary,
      tags = @tags,
      cover_file = @cover_file,
      html_file = @html_file,
      search_text = @search_text,
      published = 1,
      created_at = @created_at,
      updated_at = @updated_at,
      category_id = @category_id,
      published_revision_id = @published_revision_id,
      draft_revision_id = @draft_revision_id,
      preview_token = COALESCE(preview_token, @preview_token),
      reading_minutes = @reading_minutes,
      is_game = 0
    WHERE id = @id
  `);
  const insertRev = db.prepare(`
    INSERT INTO post_revisions
      (post_id, title, summary, tags, category_id, cover_file, search_text, created_at)
    VALUES
      (@post_id, @title, @summary, @tags, @category_id, @cover_file, @search_text, @created_at)
  `);

  const tx = db.transaction(() => {
    for (const post of SEED_POSTS) {
      const htmlSrc = path.join(SEED_DIR, "posts", post.html);
      const coverSrc = path.join(SEED_DIR, "covers", post.cover);
      const htmlDest = path.join(POSTS_DIR, post.html);
      const coverDest = path.join(COVERS_DIR, post.cover);
      if (!fs.existsSync(htmlSrc) || !fs.existsSync(coverSrc)) {
        throw new Error(`缺少种子文件：${post.html} 或 ${post.cover}`);
      }
      fs.copyFileSync(htmlSrc, htmlDest);
      fs.copyFileSync(coverSrc, coverDest);
      const raw = fs.readFileSync(htmlSrc, "utf8");
      const search = searchTextOf(post, raw);
      const categoryId = categoryIdFor(post.slug);
      const categoryName = listCategories().find((item) => item.slug === SEED_CATEGORY_BY_SLUG[post.slug])?.name || "";
      const existing = findPost.get(post.slug);
      const payload = {
        slug: post.slug,
        title: post.title,
        summary: post.summary,
        tags: JSON.stringify(post.tags),
        cover_file: post.cover,
        html_file: post.html,
        search_text: search,
        created_at: post.createdAt,
        updated_at: nowIso(),
        category_id: categoryId,
        preview_token: existing?.preview_token || newPreviewToken(),
        reading_minutes: readingMinutesFromHtml(raw, false),
      };

      let postId = existing?.id;
      if (!postId) {
        const info = insertPost.run(payload);
        postId = info.lastInsertRowid;
      }

      for (const rev of listRevs.all(postId)) {
        removeRevisionDir(rev.id);
      }
      db.prepare("DELETE FROM post_revisions WHERE post_id = ?").run(postId);

      const revInfo = insertRev.run({
        post_id: postId,
        title: post.title,
        summary: post.summary,
        tags: JSON.stringify(post.tags),
        category_id: categoryId,
        cover_file: post.cover,
        search_text: search,
        created_at: post.createdAt,
      });
      const revId = revInfo.lastInsertRowid;
      writeRevisionHtml(revId, raw);
      if (post.attachments && fs.existsSync(post.attachments)) {
        copyTreeIntoRevision(revId, post.attachments);
      }

      updatePost.run({
        ...payload,
        id: postId,
        published_revision_id: revId,
        draft_revision_id: revId,
      });
      upsertPostSearch(db, {
        id: postId,
        title: post.title,
        summary: post.summary,
        tags: post.tags.join(" "),
        category: categoryName,
        body: compactText(raw),
      });
    }
  });

  tx();
  fs.writeFileSync(flagPath, nowIso(), "utf8");
  return { seeded: true, count: SEED_POSTS.length };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const force = process.argv.includes("--force");
  const result = seedIfNeeded({ force });
  console.log(result.seeded ? `已写入 ${result.count} 篇示例文章。` : `跳过种子数据（${result.reason}）。`);
}
