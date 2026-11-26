import { compactText, estimateReadingMinutes } from "./html.js";

const CJK = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u;
const LATIN = /^[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/;

export function ensureFts(database) {
  database.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
      title,
      summary,
      tags,
      category,
      body,
      tokenize = 'unicode61'
    );
  `);
}

export function tokenizeToList(text) {
  const src = String(text || "");
  const tokens = [];
  const chars = Array.from(src);
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (CJK.test(ch)) {
      tokens.push(ch);
      i += 1;
      continue;
    }
    const rest = chars.slice(i).join("");
    const match = rest.match(LATIN);
    if (match) {
      tokens.push(match[0].toLowerCase());
      i += Array.from(match[0]).length;
      continue;
    }
    i += 1;
  }
  return tokens;
}

export function tokenize(text) {
  return tokenizeToList(text).join(" ");
}

function quoteToken(token) {
  return `"${String(token).replaceAll('"', '""')}"`;
}

export function buildMatchQuery(raw) {
  const keywords = String(raw || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  const parts = [];
  for (const word of keywords) {
    const tokens = tokenizeToList(word);
    if (!tokens.length) continue;
    const latin = tokens.length === 1 && /^[a-z0-9][a-z0-9'’]*$/i.test(tokens[0]);
    if (latin && tokens[0].length >= 2) {
      parts.push(`${tokens[0].toLowerCase()}*`);
    } else if (tokens.length === 1) {
      parts.push(quoteToken(tokens[0]));
    } else {
      parts.push(quoteToken(tokens.join(" ")));
    }
  }
  return parts.join(" AND ");
}

export function removePostSearch(database, id) {
  if (!id) return;
  database.prepare("DELETE FROM posts_fts WHERE rowid = ?").run(id);
}

export function upsertPostSearch(database, { id, title, summary, tags, category, body }) {
  if (!id) return;
  removePostSearch(database, id);
  database.prepare(`
    INSERT INTO posts_fts (rowid, title, summary, tags, category, body)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tokenize(title),
    tokenize(summary),
    tokenize(tags),
    tokenize(category),
    tokenize(body)
  );
}

export function readingMinutesFromHtml(html, isGame) {
  if (isGame) return null;
  return estimateReadingMinutes(compactText(html || ""));
}

function escapeReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildSnippet(searchText, query) {
  const text = String(searchText || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const terms = String(query || "")
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .slice(0, 8);
  if (!terms.length) return [];
  const lower = text.toLowerCase();
  let best = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx >= 0 && (best < 0 || idx < best)) best = idx;
  }
  if (best < 0) {
    const preview = text.slice(0, 80);
    return [{ text: preview + (text.length > 80 ? "…" : ""), hit: false }];
  }
  const start = Math.max(0, best - 28);
  const end = Math.min(text.length, best + 64);
  const slice = text.slice(start, end);
  const re = new RegExp(terms.map(escapeReg).join("|"), "gi");
  const segments = [];
  if (start > 0) segments.push({ text: "…", hit: false });
  let last = 0;
  for (const match of slice.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: slice.slice(last, index), hit: false });
    if (match[0]) segments.push({ text: match[0], hit: true });
    last = index + match[0].length;
  }
  if (last < slice.length) segments.push({ text: slice.slice(last), hit: false });
  if (end < text.length) segments.push({ text: "…", hit: false });
  return segments.filter((segment) => segment.text);
}
