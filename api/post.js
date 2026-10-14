// POST /api/post   { key, action: "list" | "save" | "delete", slug?, title?, ref?, verse?, body? }
// Pastor Clark's posting tool talks to this. The key is the STUDY_KEY environment variable.
const crypto = require("crypto");
const { put, del } = require("@vercel/blob");
const { slugify, allStudies } = require("./_lib");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function keyOk(k) {
  const want = Buffer.from(String(process.env.STUDY_KEY || "").trim().toLowerCase());
  const got = Buffer.from(String(k || "").trim().toLowerCase());
  return want.length > 0 && want.length === got.length && crypto.timingSafeEqual(want, got);
}
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b || "{}"); } catch { b = {}; } }
  if (!keyOk(b.key)) { await sleep(800); return res.status(401).json({ ok: false, error: "That password isn't right." }); }

  try {
    const studies = await allStudies();
    const pub = (s) => ({ slug: s.slug, title: s.title, ref: s.ref, verse: s.verse, body: s.body, date: s.date });

    if (b.action === "list") return res.json({ ok: true, studies: studies.map(pub) });

    if (b.action === "delete") {
      const s = studies.find((x) => x.slug === b.slug);
      if (!s) return res.status(404).json({ ok: false, error: "Couldn't find that study." });
      await del(s._urls);
      return res.json({ ok: true });
    }

    if (b.action === "save") {
      const title = clip(b.title, 140).trim(), body = clip(b.body, 60000).trim();
      if (!title || !body) return res.status(400).json({ ok: false, error: "A study needs a title and some writing." });
      const existing = b.slug ? studies.find((x) => x.slug === b.slug) : null;
      let slug = existing ? existing.slug : slugify(title);
      if (!existing) { let n = 2; const base = slug; while (studies.some((x) => x.slug === slug)) slug = `${base}-${n++}`; }
      const study = { slug, title, ref: clip(b.ref, 80).trim(), verse: clip(b.verse, 2000).trim(), body,
                      date: existing ? existing.date : new Date().toISOString(), updated: new Date().toISOString() };
      await put(`studies/${slug}.json`, JSON.stringify(study), {
        access: "public", contentType: "application/json", addRandomSuffix: true });
      if (existing) await del(existing._urls);   // old copies go only after the new one is safely saved
      return res.json({ ok: true, slug });
    }
    return res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Something went wrong saving. Try again in a minute." });
  }
};
