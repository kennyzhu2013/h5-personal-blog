import * as cheerio from "cheerio";

const ALLOWED_URI = /^(https?:|mailto:|\/|#|\.|data:image\/|data:video\/|data:audio\/)/i;
const DANGEROUS_URI = /^(javascript:|vbscript:|data:\s*text\/html|data:\s*application)/i;

const RESIZE_SCRIPT = `
(function () {
  if (!window.parent || window.parent === window) return;
  var sent = 0;
  var mode = "";
  function isViewportApp() {
    var body = document.body;
    var root = document.documentElement;
    if (!body) return false;
    var bs = window.getComputedStyle(body);
    var rs = window.getComputedStyle(root);
    var pinned = bs.position === "fixed" || rs.position === "fixed";
    var hiddenY = function (s) {
      return s.overflow === "hidden" || s.overflowY === "hidden";
    };
    var canvas = document.querySelector("canvas");
    var fills = false;
    if (canvas) {
      var cw = canvas.offsetWidth || 0;
      var ch = canvas.offsetHeight || 0;
      fills = cw >= (window.innerWidth || 0) - 8 && ch >= (window.innerHeight || 0) - 8 && ch > 120;
    }
    if (pinned && (hiddenY(bs) || hiddenY(rs) || fills)) return true;
    if (fills && (hiddenY(bs) || hiddenY(rs))) return true;
    var app = document.getElementById("app") || document.getElementById("game") || document.querySelector("[data-game]");
    if (app) {
      var as = window.getComputedStyle(app);
      if ((as.position === "fixed" || as.position === "absolute") &&
          app.offsetHeight >= (window.innerHeight || 0) - 8 &&
          app.offsetWidth >= (window.innerWidth || 0) - 8) {
        return true;
      }
    }
    return false;
  }
  function report(nextMode, height) {
    if (nextMode === mode && (nextMode === "viewport" || Math.abs(height - sent) < 2)) return;
    mode = nextMode;
    sent = height;
    window.parent.postMessage({ type: "article-height", height: height, mode: nextMode }, "*");
  }
  function measure() {
    if (isViewportApp()) {
      report("viewport", Math.max(1, window.innerHeight || 0));
      return;
    }
    var body = document.body;
    var el = document.documentElement;
    var height = Math.ceil(Math.max(
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      el ? el.scrollHeight : 0,
      el ? el.offsetHeight : 0,
      body ? body.getBoundingClientRect().height : 0
    ));
    if (height < 1) height = 240;
    report("document", height);
  }
  function bind() {
    measure();
    if (window.ResizeObserver && document.documentElement) {
      try { new ResizeObserver(function () { measure(); }).observe(document.documentElement); } catch (e) {}
    }
    window.addEventListener("load", measure);
    window.addEventListener("resize", measure);
    document.querySelectorAll("img, video").forEach(function (node) {
      node.addEventListener("load", measure);
      node.addEventListener("loadedmetadata", measure);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure).catch(function () {});
    }
    [60, 200, 500, 1200].forEach(function (ms) { setTimeout(measure, ms); });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
`.trim();

function tocScript(title) {
  const titleLiteral = JSON.stringify(String(title || ""));
  return `
(function () {
  if (!window.parent || window.parent === window) return;
  var pageTitle = ${titleLiteral};
  var lastOutline = "";

  function norm(s) {
    return String(s || "").replace(/\\s+/g, " ").trim();
  }

  function uniqueId(base, used, current) {
    var id = base;
    var n = 2;
    while (used[id] || (document.getElementById(id) && document.getElementById(id) !== current)) {
      id = base + "-" + n;
      n += 1;
    }
    used[id] = true;
    return id;
  }

  function slugId(text, index) {
    var slug = String(text || "")
      .toLowerCase()
      .replace(/[^\\w\\u4e00-\\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return slug ? "blog-h-" + slug : "blog-h-" + (index + 1);
  }

  function collect() {
    var nodes = document.querySelectorAll("h1, h2, h3");
    var used = {};
    var headings = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var level = Number(el.tagName.charAt(1));
      var text = norm(el.textContent);
      if (!text) continue;
      if (level === 1 && text === pageTitle) continue;
      var id = el.getAttribute("id");
      if (!id) {
        id = uniqueId(slugId(text, i), used, el);
        el.setAttribute("id", id);
      } else if (used[id]) {
        id = uniqueId(id, used, el);
        el.setAttribute("id", id);
      } else {
        used[id] = true;
      }
      headings.push({ id: id, text: text.slice(0, 80), level: level });
    }
    var payload = JSON.stringify(headings);
    if (payload === lastOutline) return;
    lastOutline = payload;
    window.parent.postMessage({ type: "article-outline", headings: headings }, "*");
  }

  function scrollToHeading(id, mode) {
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    if (mode === "viewport") {
      if (el.scrollIntoView) {
        try { el.scrollIntoView({ behavior: "smooth", block: "start" }); }
        catch (e) { el.scrollIntoView(true); }
      }
      return;
    }
    var top = el.getBoundingClientRect().top;
    window.parent.postMessage({ type: "article-heading-pos", id: id, top: top }, "*");
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.type !== "article-scroll-to") return;
    scrollToHeading(data.id, data.mode);
  });

  function bindToc() {
    collect();
    window.addEventListener("load", collect);
    [60, 200, 500, 1200].forEach(function (ms) { setTimeout(collect, ms); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindToc);
  } else {
    bindToc();
  }
})();
`.trim();
}


const THEME_SCRIPT = `
(function () {
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.type !== "article-theme") return;
    if (data.theme === "dark" || data.theme === "light") {
      document.documentElement.setAttribute("data-theme", data.theme);
    }
  });
})();
`.trim();

const BASE_STYLE = `
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    font-family: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Source Han Sans SC",
      "Microsoft YaHei", sans-serif;
    color: #1f1a14;
    font-size: 17px;
    line-height: 1.8;
    word-break: break-word;
    -webkit-font-smoothing: antialiased;
  }
  html[data-theme="dark"] { color-scheme: dark; }
  html[data-theme="dark"] body { color: #f3ece3; }
  html[data-theme="light"] body { color: #1f1a14; }
  img, video, audio, iframe { max-width: 100%; }
  img, video { height: auto; }
  a { color: #c2502a; }
  html[data-theme="dark"] a { color: #ffb199; }
  html[data-theme="light"] a { color: #c2502a; }
  figure { margin: 0; }
`.trim();

function isAllowedUrl(value) {
  if (value == null) return false;
  const url = String(value).trim();
  if (!url || url.toLowerCase() === "null") return false;
  if (DANGEROUS_URI.test(url)) return false;
  // Protocol-relative URLs can point anywhere; never allow them.
  if (url.startsWith("//")) return false;
  if (ALLOWED_URI.test(url)) return true;
  // Relative paths used by article attachments: style.css, img/foo.png, ./fonts/a.woff2
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return true;
  return false;
}

function sanitizeUrl(value, { allowHash = true } = {}) {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (allowHash && url.startsWith("#")) return url;
  if (isAllowedUrl(url)) return url;
  return "";
}

export function extractText(html) {
  if (!html) return "";
  try {
    const $ = cheerio.load(html, { decodeEntities: true });
    $("script, style, noscript, iframe, object, embed").remove();
    return $("body").length ? $("body").text() : $.root().text();
  } catch {
    return String(html).replace(/<[^>]+>/g, " ");
  }
}

export function compactText(html) {
  return extractText(html).replace(/\s+/g, " ").trim();
}

/**
 * Estimated reading time in whole minutes.
 * Chinese (and other CJK) characters use ~400 per minute;
 * Latin words use ~200 per minute. Returns 0 when there is no real body text,
 * otherwise at least 1.
 */
export function estimateReadingMinutes(text) {
  const raw = String(text || "").trim();
  if (!raw) return 0;
  const han = raw.match(/\p{Script=Han}/gu) || [];
  const rest = raw.replace(/\p{Script=Han}/gu, " ");
  const kanaHangul = rest.match(/\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/gu) || [];
  const words = rest.match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g) || [];
  const charCount = han.length + kanaHangul.length;
  const wordCount = words.length;
  if (charCount + wordCount === 0) return 0;
  return Math.max(1, Math.ceil(charCount / 400 + wordCount / 200));
}

function neutralize($) {
  $("meta[http-equiv]").each((_, el) => {
    const http = String($(el).attr("http-equiv") || "").toLowerCase();
    if (http === "refresh" || http === "set-cookie") $(el).remove();
  });
  $("base").remove();

  const urlAttrs = [
    "href",
    "src",
    "srcset",
    "poster",
    "action",
    "formaction",
    "xlink:href",
    "data-src",
  ];

  $("*").each((_, el) => {
    const node = $(el);
    const attribs = el.attribs || {};
    for (const name of Object.keys(attribs)) {
      if (name.toLowerCase().startsWith("on")) {
        node.removeAttr(name);
      }
    }
    for (const attr of urlAttrs) {
      if (node.attr(attr) == null) continue;
      if (attr === "srcset") {
        const pieces = String(node.attr("srcset"))
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const [u, size] = part.split(/\s+/, 2);
            const safe = sanitizeUrl(u, { allowHash: false });
            return safe ? (size ? `${safe} ${size}` : safe) : "";
          })
          .filter(Boolean);
        if (pieces.length) node.attr("srcset", pieces.join(", "));
        else node.removeAttr("srcset");
        continue;
      }
      const safe = sanitizeUrl(node.attr(attr), { allowHash: attr === "href" });
      if (safe) {
        node.attr(attr, safe);
        if (attr === "href" && /^https?:/i.test(safe)) {
          node.attr("target", "_blank");
          node.attr("rel", "noopener noreferrer nofollow");
        }
      } else {
        node.removeAttr(attr);
        if (attr === "href") node.attr("href", "#");
        if (attr === "action" || attr === "formaction") {
          node.removeAttr("action");
          node.removeAttr("formaction");
        }
      }
    }
  });

  $("iframe").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (!/^https?:\/\//i.test(src)) {
      $(el).remove();
      return;
    }
    $(el).attr("sandbox", "allow-scripts allow-popups allow-forms");
    $(el).attr("referrerpolicy", "no-referrer");
  });

  $("object, embed, applet").remove();
  $("link[href]").each((_, el) => {
    const rel = String($(el).attr("rel") || "").toLowerCase();
    const href = $(el).attr("href") || "";
    const tokens = rel.split(/\s+/);
    const isStyle = tokens.includes("stylesheet");
    const isIcon = tokens.includes("icon") || tokens.includes("apple-touch-icon");
    if ((!isStyle && !isIcon) || !isAllowedUrl(href)) {
      $(el).remove();
    }
  });
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (!isAllowedUrl(src)) $(el).remove();
  });
}

/**
 * Turn an uploaded HTML5 document or fragment into a self-contained
 * article document suitable for a sandboxed iframe.
 */
export function buildArticleDocument(raw, { title = "", theme = "" } = {}) {
  const source = String(raw ?? "");
  const $ = cheerio.load(source, { decodeEntities: false });

  const isFullDoc = /<html[\s>]|<body[\s>]/i.test(source);
  neutralize($);

  const styleChunks = [];
  $("style").each((_, el) => {
    styleChunks.push($(el).html() || "");
  });
  const linkTags = [];
  $('link[rel="stylesheet"][href]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      linkTags.push(
        `<link rel="stylesheet" href="${href.replaceAll('"', "&quot;")}" />`
      );
    }
  });

  let bodyHtml;
  if (isFullDoc && $("body").length) {
    const $body = $("body").clone();
    $body.find("script#blog-frame-resize, script#blog-frame-toc").remove();
    bodyHtml = $body.html() || "";
  } else {
    const $root = cheerio.load(source, { decodeEntities: false });
    neutralize($root);
    $root("style, script, link, meta, title").remove();
    bodyHtml = ($root("body").length ? $root("body").html() : $root.root().html()) || "";
  }

  const safeTitle = String(title || "").replace(/[<>]/g, "");
  const themeAttr = theme === "dark" || theme === "light" ? ` data-theme="${theme}"` : "";
  const documentHtml = `<!DOCTYPE html>
<html lang="zh-CN"${themeAttr}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>${BASE_STYLE}</style>
  ${linkTags.join("\n  ")}
  ${styleChunks.length ? `<style>${styleChunks.join("\n")}</style>` : ""}
</head>
<body>
${bodyHtml}
<script id="blog-frame-resize">${RESIZE_SCRIPT}</script>
<script id="blog-frame-toc">${tocScript(title)}</script>
<script id="blog-frame-theme">${THEME_SCRIPT}</script>
</body>
</html>`;

  return documentHtml;
}
