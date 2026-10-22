// POST /api/contact  (the Contact page form)
// 22 Oct 2026 (Joe: every website message must reach the church AND Joe). Replaces FormSubmit,
// which never delivered a single message (its activation email was never clicked).
// Every real message is texted within seconds to Pastor Clark's call/text line (913) 669-3091
// and to Joe, from Young SEO's Quo line (913) 335-0835. Spam (links, SEO/marketing pitches,
// the honeypot) is dropped without texting anyone.
// Env (Vercel, Production): QUO_API_KEY
const TO = ["+19136693091", "+19133911868"]; // Pastor Clark, Joe
const QUO_FROM = "PNLN0h82e8";
const hits = new Map();
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);

function parse(req) {
  const b = req.body;
  if (b && typeof b === "object" && !Buffer.isBuffer(b)) return b;
  const s = Buffer.isBuffer(b) ? b.toString("utf8") : String(b || "");
  try { return JSON.parse(s); } catch (e) { return Object.fromEntries(new URLSearchParams(s)); }
}
function isSpam(f) {
  const all = f.name + " " + f.reply + " " + f.message;
  if (f.honey) return "honeypot";
  if (f.name.length < 2 || f.message.length < 2) return "empty";
  if (/https?:\/\/|www\.|\[url|<a\s/i.test(all)) return "link";
  if (/\bseo\b|search engine|backlink|guest post|web ?design|redesign|marketing|first page of google|google ranking|more (leads|traffic|customers)|your website/i.test(all)) return "pitch";
  return "";
}
async function quoText(to, content) {
  const k = process.env.QUO_API_KEY;
  if (!k) { console.error("CONTACT text skipped: QUO_API_KEY not set"); return false; }
  try {
    const r = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST", headers: { Authorization: k, "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 1500), from: QUO_FROM, to: [to] }),
      signal: AbortSignal.timeout(8000) });
    if (!r.ok) console.error("CONTACT text to", to, "failed", r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) { console.error("CONTACT text to", to, "failed", (e && e.message) || e); return false; }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Allow", "POST"); return res.end(); }
  const b = parse(req);
  const test = b.test === true || b.test === "true";
  const f = { name: clip(b.name, 80), reply: clip(b.reply, 120), message: clip(b.message, 1000), honey: clip(b._honey, 50) };
  const back = () => { res.statusCode = 303; res.setHeader("Location", "/contact?sent=1"); res.setHeader("Cache-Control", "no-store"); res.end(); };

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "x", t = Date.now();
  const h = (hits.get(ip) || []).filter((x) => t - x < 3600e3); h.push(t); hits.set(ip, h);
  const spam = isSpam(f);
  if (spam || h.length > 5) { console.log("CONTACT blocked:", spam || "rate"); return back(); }

  const msg = [
    (test ? "🧪 TEST (only Joe gets this)\n" : "") + "⛪ New message from the church website",
    "From: " + f.name,
    "Reply to: " + f.reply,
    '"' + f.message + '"',
    "- sent by the mgalenexa.org contact form",
  ].join("\n");
  const sent = [];
  for (const to of test ? [TO[1]] : TO) sent.push(await quoText(to, msg));
  console.log("CONTACT", test ? "test" : "message", "texts", sent.join(","));
  if (!sent.some(Boolean)) {
    res.statusCode = 502; res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end('<p>Sorry, that didn\'t send. Please call or text the church at <a href="tel:+19136693091">(913) 669-3091</a>.</p>');
  }
  return back();
};
