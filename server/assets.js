import fs from "node:fs";
import path from "node:path";
import yauzl from "yauzl";
import { REVISIONS_DIR } from "./db.js";

export const MAX_FILE_SIZE = 8 * 1024 * 1024;
export const MAX_ZIP_SIZE = 12 * 1024 * 1024;
export const MAX_TOTAL_SIZE = 30 * 1024 * 1024;
export const MAX_ASSET_FILES = 100;

const ALLOWED_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".avif",
  ".bmp",
  ".css",
  ".js",
  ".mjs",
  ".map",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".mp3",
  ".mp4",
  ".webm",
  ".ogg",
  ".wav",
  ".m4a",
  ".pdf",
  ".txt",
  ".vtt",
  ".srt",
  ".html",
  ".htm",
  ".json",
  ".xml",
]);

const SKIP_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".pdf": "application/pdf",
  ".vtt": "text/vtt",
  ".srt": "application/x-subrip",
};

export function revisionDir(revisionId) {
  return path.join(REVISIONS_DIR, String(revisionId));
}

export function mimeFor(filename) {
  const ext = path.extname(filename || "").toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

export function isHtmlPath(relPath) {
  return [".html", ".htm"].includes(path.extname(relPath || "").toLowerCase());
}

export function safeRelPath(input) {
  if (input == null) return null;
  let value = String(input).replaceAll("\0", "").trim();
  if (!value) return null;
  value = value.replace(/\\/g, "/");
  if (/^[a-zA-Z]:/.test(value) || value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  const parts = [];
  for (const raw of value.split("/")) {
    const seg = raw.trim();
    if (!seg || seg === ".") continue;
    if (seg === ".." || seg === "..." ) return null;
    if (seg === "__MACOSX") return null;
    if (SKIP_NAMES.has(seg.toLowerCase())) return null;
    if (/^[.]{2,}$/.test(seg)) return null;
    parts.push(seg);
  }
  if (!parts.length) return null;
  if (parts.length > 12) return null;
  const joined = parts.join("/");
  if (joined.length > 240) return null;
  return joined;
}

export function isAllowedAsset(relPath) {
  const safe = safeRelPath(relPath);
  if (!safe) return false;
  const base = path.posix.basename(safe).toLowerCase();
  if (SKIP_NAMES.has(base) || base.startsWith("._")) return false;
  const ext = path.posix.extname(safe).toLowerCase();
  return ALLOWED_EXT.has(ext);
}

export function ensureRevisionDir(revisionId) {
  const dir = revisionDir(revisionId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function htmlPath(revisionId) {
  return path.join(revisionDir(revisionId), "index.html");
}

export function readRevisionHtml(revisionId) {
  const full = htmlPath(revisionId);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

export function writeRevisionHtml(revisionId, raw) {
  const dir = ensureRevisionDir(revisionId);
  fs.writeFileSync(path.join(dir, "index.html"), raw, "utf8");
}

export function dirSizeAndCount(root) {
  let size = 0;
  let count = 0;
  if (!fs.existsSync(root)) return { size, count };
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.isSymbolicLink()) continue;
        walk(full);
      } else if (entry.isFile() && !entry.isSymbolicLink()) {
        count += 1;
        size += fs.statSync(full).size;
      }
    }
  };
  walk(root);
  return { size, count };
}

export function listAssets(revisionId) {
  const root = revisionDir(revisionId);
  const items = [];
  if (!fs.existsSync(root)) return items;
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full, nextRel);
      } else if (entry.isFile()) {
        if (nextRel === "index.html") continue;
        const stat = fs.statSync(full);
        items.push({ path: nextRel, size: stat.size });
      }
    }
  };
  walk(root, "");
  items.sort((a, b) => a.path.localeCompare(b.path, "en"));
  return items;
}

export function copyRevisionFiles(fromId, toId) {
  const src = revisionDir(fromId);
  const dest = revisionDir(toId);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true, dereference: true });
  } else {
    fs.mkdirSync(dest, { recursive: true });
  }
}

export function removeRevisionDir(revisionId) {
  if (!revisionId) return;
  const dir = revisionDir(revisionId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

export function clearAssets(revisionId, { keepHtml = true } = {}) {
  const dir = revisionDir(revisionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  const html = keepHtml && fs.existsSync(htmlPath(revisionId))
    ? fs.readFileSync(htmlPath(revisionId))
    : null;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  if (html) fs.writeFileSync(htmlPath(revisionId), html);
}

export function resolveAsset(revisionId, relPath) {
  const safe = safeRelPath(relPath);
  if (!safe) return null;
  const root = revisionDir(revisionId);
  if (!fs.existsSync(root)) return null;
  const rootReal = fs.realpathSync(root);
  const resolved = path.resolve(rootReal, safe);
  if (resolved !== rootReal && !resolved.startsWith(rootReal + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  const real = fs.realpathSync(resolved);
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) return null;
  const stat = fs.statSync(real);
  if (!stat.isFile()) return null;
  return real;
}

export function writeAssetFile(revisionId, relPath, sourcePath) {
  const safe = safeRelPath(relPath);
  if (!safe || !isAllowedAsset(safe)) {
    throw new Error(`不支持的附件路径或类型：${relPath || ""}`);
  }
  const dir = ensureRevisionDir(revisionId);
  const dest = path.resolve(dir, safe);
  const rootReal = fs.realpathSync(dir);
  if (dest !== rootReal && !dest.startsWith(rootReal + path.sep)) {
    throw new Error("附件路径不合法");
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(sourcePath, dest);
  return safe;
}

function collectZipEntries(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err) return reject(new Error("无法读取压缩包，请确认是 zip 文件"));
      const entries = [];
      zip.readEntry();
      zip.on("entry", (entry) => {
        entries.push(entry);
        zip.readEntry();
      });
      zip.on("end", () => resolve(entries));
      zip.on("error", reject);
    });
  });
}

function isUnsafeZipEntry(entry) {
  const name = String(entry.fileName || "");
  if (!name) return true;
  if (entry.fileName.endsWith("/") || /\/$/.test(name)) return false;
  // Unix symlink / Windows symlink-ish
  const madeBy = entry.versionMadeBy >> 8;
  const attr = entry.externalFileAttributes >>> 0;
  if (madeBy === 3) {
    const mode = (attr >> 16) & 0xffff;
    if ((mode & 0o170000) === 0o120000) return true;
  }
  return false;
}

function maybeStripRoot(paths) {
  const files = paths.filter(Boolean);
  if (!files.length) return (p) => p;
  const first = files[0].split("/")[0];
  if (!first || first === "." || first === "..") return (p) => p;
  const all = files.every((p) => p === first || p.startsWith(`${first}/`));
  if (!all) return (p) => p;
  return (p) => {
    if (p === first) return "";
    return p.slice(first.length + 1);
  };
}

function openReadStream(zipPath, entry) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err) return reject(err);
      zip.readEntry();
      zip.on("entry", (current) => {
        if (current.fileName !== entry.fileName) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(current, (streamErr, stream) => {
          if (streamErr) reject(streamErr);
          else resolve(stream);
        });
      });
      zip.on("end", () => reject(new Error("压缩包条目缺失")));
      zip.on("error", reject);
    });
  });
}

function writeStreamToFile(stream, dest, maxSize) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const out = fs.createWriteStream(dest);
    let written = 0;
    stream.on("data", (chunk) => {
      written += chunk.length;
      if (written > maxSize) {
        stream.destroy();
        out.destroy();
        try { fs.unlinkSync(dest); } catch { /* ignore */ }
        reject(new Error("压缩包中有文件超过大小限制"));
      }
    });
    stream.on("error", reject);
    out.on("error", reject);
    out.on("finish", () => resolve(written));
    stream.pipe(out);
  });
}

export async function extractZipToRevision(revisionId, zipPath, { skipHtml = false } = {}) {
  const dir = ensureRevisionDir(revisionId);
  const rawEntries = await collectZipEntries(zipPath);
  const fileEntries = rawEntries.filter((entry) => {
    if (isUnsafeZipEntry(entry)) return false;
    if (entry.fileName.endsWith("/")) return false;
    return true;
  });

  const relNames = [];
  for (const entry of fileEntries) {
    relNames.push(String(entry.fileName || "").replace(/\\/g, "/"));
  }
  const strip = maybeStripRoot(relNames);

  const planned = [];
  for (const entry of fileEntries) {
    const stripped = strip(String(entry.fileName || "").replace(/\\/g, "/"));
    const safe = safeRelPath(stripped);
    if (!safe) continue;
    if (!isAllowedAsset(safe)) continue;
    if (skipHtml && isHtmlPath(safe) && (safe === "index.html" || safe === "index.htm")) continue;
    if (entry.uncompressedSize > MAX_FILE_SIZE) {
      throw new Error(`压缩包中的「${safe}」超过 8 MB`);
    }
    planned.push({ entry, safe, size: entry.uncompressedSize || 0 });
  }

  const current = dirSizeAndCount(dir);
  const incoming = planned.reduce((n, item) => n + item.size, 0);
  if (current.size + incoming > MAX_TOTAL_SIZE) {
    throw new Error("附件总大小请控制在 30 MB 以内");
  }
  if (current.count + planned.length > MAX_ASSET_FILES) {
    throw new Error("单篇文章附件数量请控制在 100 个以内");
  }

  const written = [];
  let usedAsIndex = null;
  for (const item of planned) {
    const dest = path.resolve(dir, item.safe);
    const rootReal = fs.realpathSync(dir);
    if (dest !== rootReal && !dest.startsWith(rootReal + path.sep)) continue;
    const stream = await openReadStream(zipPath, item.entry);
    await writeStreamToFile(stream, dest, MAX_FILE_SIZE);
    written.push(item.safe);
    if (!skipHtml && (item.safe === "index.html" || item.safe === "index.htm") && !usedAsIndex) {
      usedAsIndex = item.safe;
    }
  }

  if (usedAsIndex && usedAsIndex !== "index.html") {
    const src = path.join(dir, usedAsIndex);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, htmlPath(revisionId));
    }
  } else if (!skipHtml && !fs.existsSync(htmlPath(revisionId))) {
    const htmls = written.filter((name) => isHtmlPath(name) && !name.includes("/"));
    if (htmls.length === 1) {
      fs.copyFileSync(path.join(dir, htmls[0]), htmlPath(revisionId));
    }
  }

  return { written, usedAsIndex };
}

export function assertBudget(revisionId, extraBytes = 0, extraFiles = 0) {
  const current = dirSizeAndCount(revisionDir(revisionId));
  if (current.size + extraBytes > MAX_TOTAL_SIZE) {
    throw new Error("附件总大小请控制在 30 MB 以内");
  }
  if (current.count + extraFiles > MAX_ASSET_FILES) {
    throw new Error("单篇文章附件数量请控制在 100 个以内");
  }
}

export function copyTreeIntoRevision(revisionId, sourceDir, { skipHtml = false } = {}) {
  if (!fs.existsSync(sourceDir)) return [];
  const written = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, nextRel);
      } else if (entry.isFile()) {
        const safe = safeRelPath(nextRel);
        if (!safe || !isAllowedAsset(safe)) continue;
        if (skipHtml && isHtmlPath(safe) && (safe === "index.html" || safe === "index.htm")) continue;
        writeAssetFile(revisionId, safe, full);
        written.push(safe);
      }
    }
  };
  walk(sourceDir, "");
  return written;
}
