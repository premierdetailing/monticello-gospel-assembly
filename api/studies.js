// GET /studies           -> list of Pastor Clark's studies (rendered into the site's own Studies page)
// GET /studies/<slug>    -> one study
// Rewrites in vercel.json send both here. The page shell is the built studies page (api/_tpl/studies.html).
const fs = require("fs");
const path = require("path");
const { ORIGIN, esc, fmtDate, excerpt, paras, allStudies } = require("./_lib");

const TPL = fs.readFileSync(path.join(__dirname, "_tpl", "studies.html"), "utf8");
const A = "<!--STUDIES-->", B = "<!--/STUDIES-->";

const swapRegion = (html, inner) => html.slice(0, html.indexOf(A)) + inner + html.slice(html.indexOf(B) + B.length);

function listPage(studies) {
  if (!studies.length) return TPL;  // keeps the "No studies yet" shelf
  const items = studies.map((s) => `<li><a href="/studies/${esc(s.slug)}">
      <span class="sdate">${esc(fmtDate(s.date))}${s.ref ? " · " + esc(s.ref) : ""}</span>
      <strong>${esc(s.title)}</strong>
      <span class="sx">${esc(excerpt(s.body))}</span></a></li>`).join("\n    ");
  return swapRegion(TPL, `<section><div class="wrap"><ul class="slist">\n    ${items}\n  </ul></div></section>`);
}

function studyPage(s) {
  const url = `${ORIGIN}/studies/${s.slug}`;
  const t = esc(s.title), d = esc(excerpt(s.body, 155));
  const h = TPL
    .replace(/<title>[^<]*<\/title>/, `<title>${t} | Pastor Tony Clark</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${d}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${d}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${t} | Pastor Tony Clark`)
    .split(`${ORIGIN}/studies"`).join(`${url}"`)
    .split(`${ORIGIN}/studies#`).join(`${url}#`)
    .replace("<h1>Studies</h1>", `<h1>${t}</h1>`)
    .replace(/<p class="lede">[^<]*<\/p>/, `<p class="lede">${esc(fmtDate(s.date))} · Pastor Tony Clark</p>`);
  const scrip = s.verse
    ? `<blockquote class="scrip"><p>“${esc(s.verse.replace(/^[“"]|[”"]$/g, ""))}”</p>${s.ref ? `<cite>${esc(s.ref)}</cite>` : ""}</blockquote>`
    : (s.ref ? `<p class="tag">${esc(s.ref)}</p>` : "");
  return swapRegion(h, `<section><div class="wrap prose study">
  ${scrip}
  ${paras(s.body)}
  <p class="back"><a class="btn btn-ghost" href="/studies">All studies</a></p>
</div></section>`);
}

module.exports = async (req, res) => {
  try {
    const slug = (req.query && req.query.slug) || "";
    const studies = await allStudies();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
    if (!slug) return res.status(200).send(listPage(studies));
    const s = studies.find((x) => x.slug === slug);
    if (!s) { res.setHeader("Cache-Control", "no-store"); return res.redirect(302, "/studies"); }
    return res.status(200).send(studyPage(s));
  } catch (e) {
    console.error(e);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(TPL);  // never show an error page to a visitor; fall back to the plain Studies page
  }
};
