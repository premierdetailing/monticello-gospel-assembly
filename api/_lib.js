// Shared helpers for Pastor Clark's studies (Vercel Blob storage). 9 Oct 2026.
const { list } = require("@vercel/blob");

const ORIGIN = "https://mgalenexa.org";

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const slugify = (t) => String(t).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "study";

const fmtDate = (iso) => new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric" }).format(new Date(iso));

const excerpt = (body, n = 160) => {
  const t = String(body || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t;
};

// body text -> paragraphs; a blank line starts a new paragraph, a single line break stays a line break
const paras = (body) => String(body || "").replace(/\r/g, "").split(/\n\s*\n/)
  .map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n  ");

// Every save is a brand-new blob URL (random suffix), so the blob CDN can never serve a stale copy.
// If an edit leaves an old copy behind for a moment, the newest "updated" wins and the rest are listed in _urls.
async function allStudies() {
  const bySlug = new Map();
  let cursor;
  do {
    const r = await list({ prefix: "studies/", cursor, limit: 1000 });
    const docs = await Promise.all(r.blobs.filter((b) => b.pathname.endsWith(".json")).map(async (b) => {
      const res = await fetch(b.url, { cache: "no-store" });
      if (!res.ok) return null;
      const s = await res.json(); s._url = b.url; return s;
    }));
    for (const s of docs) {
      if (!s || !s.slug) continue;
      const cur = bySlug.get(s.slug);
      if (!cur) { s._urls = [s._url]; bySlug.set(s.slug, s); continue; }
      const urls = cur._urls.concat(s._url);
      const win = (s.updated || s.date) > (cur.updated || cur.date) ? s : cur;
      win._urls = urls; bySlug.set(s.slug, win);
    }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return [...bySlug.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

module.exports = { ORIGIN, esc, slugify, fmtDate, excerpt, paras, allStudies };
