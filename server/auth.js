import crypto from "node:crypto";

const COOKIE = "blog_admin";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 8) {
    throw new Error("SESSION_SECRET 未配置或过短，请在 .env 中设置");
  }
  return value;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || payload.v !== 1) return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function safePasswordEqual(input, expected) {
  const a = Buffer.from(String(input ?? ""), "utf8");
  const b = Buffer.from(String(expected ?? ""), "utf8");
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a.length ? a : Buffer.from("x"), a.length ? a : Buffer.from("x"));
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function setSession(res) {
  const token = sign({ v: 1, exp: Date.now() + MAX_AGE_MS });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_MS,
    secure: process.env.COOKIE_SECURE === "1",
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", path: "/" });
}

export function isUnlocked(req) {
  return Boolean(verify(req.cookies?.[COOKIE]));
}

export function requireAdmin(req, res, next) {
  if (!isUnlocked(req)) {
    return res.status(401).json({ error: "请先输入后台口令" });
  }
  return next();
}
