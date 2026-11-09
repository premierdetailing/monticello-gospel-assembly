/* Churches & live streams: search-first finder. Data: /data/churches.json, map: /data/us-map.json */
(() => {
"use strict";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], DSH = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LIVE_MS = 2 * 3600e3, HOME = "monticello-gospel-assembly";
const VTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
let C = [], tab = "all", pos = null, openId = null;

/* ---------- time ---------- */
const fmtCache = {};
function partsIn(tz, d) {
  const f = fmtCache[tz] ||= new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23", weekday: "short" });
  const o = {}; f.formatToParts(d).forEach(p => o[p.type] = p.value);
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, wd: DSH.indexOf(o.weekday) };
}
function nextStart(tz, day, hhmm, now) { // { last, next } in ms for a weekly service
  const p = partsIn(tz, now), off = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(now / 1000) * 1000;
  const [h, mi] = hhmm.split(":").map(Number);
  let next = Date.UTC(p.y, p.m - 1, p.d, h, mi) - off + ((day - p.wd + 7) % 7) * 864e5;
  if (next <= now) next += 7 * 864e5;
  return { last: next - 7 * 864e5, next };
}
const t12 = hhmm => { const [h, m] = hhmm.split(":").map(Number); return (h % 12 || 12) + (m ? ":" + String(m).padStart(2, "0") : "") + " " + (h < 12 ? "AM" : "PM"); };
const yourTime = ms => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayWord = ms => { const d = new Date(ms).toDateString(); return d === new Date().toDateString() ? "Today" : d === new Date(Date.now() + 864e5).toDateString() ? "Tomorrow" : new Date(ms).toLocaleDateString([], { weekday: "short" }); };
function status(c, now) { // live info + next service
  let live = null, next = null;
  if (!c.tz) return { live, next };
  for (const [d, t, irr, note] of c.sv) {
    if (irr) continue;
    const o = nextStart(c.tz, d, t, now);
    if (now - o.last < LIVE_MS && (!live || o.last > live.at)) live = { at: o.last, d, t, note };
    if (!next || o.next < next.at) next = { at: o.next, d, t, note };
  }
  return { live, next };
}

/* ---------- links ---------- */
const place = c => c.co === "US" ? c.c + ", " + c.s : c.c + ", " + c.co;
const watchUrl = c => c.ls || c.fb || "";
const dirUrl = c => c.lat ? "https://www.google.com/maps/dir/?api=1&destination=" + c.lat + "," + c.lon : c.st ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(c.st + " " + c.cl) : "";
const telFmt = d => d.length === 10 ? "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6) : d;
const I = {
  play: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>'
};
function acts(c) {
  const a = [];
  if (c.ls) a.push('<a class="sbtn watch" href="' + esc(c.ls) + '" target="_blank" rel="noopener">' + I.play + (/youtube|youtu\.be/.test(c.ls) ? "Watch on YouTube" : /facebook/.test(c.ls) ? "Watch on Facebook" : "Watch live") + "</a>");
  if (c.ph) a.push('<a class="sbtn" href="tel:+1' + esc(c.ph) + '">' + I.phone + telFmt(c.ph) + "</a>");
  if (dirUrl(c)) a.push('<a class="sbtn" href="' + esc(dirUrl(c)) + '" target="_blank" rel="noopener">' + I.pin + "Directions</a>");
  if (!c.ls && c.fb) a.push('<a class="sbtn" href="' + esc(c.fb) + '" target="_blank" rel="noopener">' + I.play + "Facebook</a>");
  if (c.w) a.push('<a class="sbtn" href="' + esc(c.w) + '" target="_blank" rel="noopener">' + I.web + "Website</a>");
  return '<div class="acts">' + a.join("") + "</div>";
}

/* ---------- rows ---------- */
function svcTable(c) {
  const by = {};
  c.sv.forEach(([d, t]) => (by[d] ||= []).push(t12(t)));
  const rows = [0, 1, 2, 3, 4, 5, 6].filter(d => by[d]).map(d => "<b>" + DAY[d] + "</b><span>" + by[d].join(" &amp; ") + "</span>").join("");
  const extra = c.svt.filter(l => /\d(st|nd|rd|th)|youth|bible study|school|creole|spanish|english|children/i.test(l)).map(l => "<i>" + esc(l) + "</i>").join("");
  return rows || extra ? '<div class="svc">' + rows + extra + "</div>" : '<p class="sm">Call for service times.</p>';
}
const miles = c => pos && c.lat ? Math.round(hav(pos[0], pos[1], c.lat, c.lon)) : null;
function row(c, now) {
  const st = status(c, now), home = c.id.includes(HOME);
  let nx = "";
  if (st.live) nx = '<span class="lv">● Live now</span><small>since ' + esc(t12(st.live.t)) + "</small>";
  else if (st.next) nx = esc(DSH[st.next.d]) + " " + esc(t12(st.next.t)) + (c.tz && c.tz !== VTZ ? "<small>" + esc(yourTime(st.next.at)) + " your time</small>" : /^(Today|Tomorrow)$/.test(dayWord(st.next.at)) ? "<small>" + dayWord(st.next.at) + "</small>" : "");
  else nx = "<small>Call for times</small>";
  const m = miles(c);
  const meta = [esc(place(c)), c.p[0] ? esc(c.p[0].replace(/,?\s*Pastor$/i, "")) : "", m != null ? m + " mi" : "", c.ls ? "Streams online" : ""].filter(Boolean).join(" · ");
  return '<li class="ch' + (home ? " home" : "") + (openId === c.id ? " open" : "") + '" id="c-' + esc(c.id) + '"><button type="button" aria-expanded="' + (openId === c.id) + '"><span class="nm">' + esc(c.n) + (home ? '<span class="tagh">Our church</span>' : "") + '</span><span class="nx">' + nx + '</span><span class="meta">' + meta + "</span></button>" +
    '<div class="det">' + svcTable(c) + (c.p.length ? '<div class="ln">' + c.p.map(esc).join("<br>") + "</div>" : "") + (c.st ? '<div class="sm">' + esc(c.st) + (c.cl ? ", " + esc(c.cl) : "") + "</div>" : "") + (c.nt ? '<div class="sm">' + esc(c.nt) + "</div>" : "") + acts(c) + "</div></li>";
}

/* ---------- filtering ---------- */
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
function hav(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 7917.6 * Math.asin(Math.sqrt(x)); }
function base() {
  const q = norm($("#q").value).trim().split(/\s+/).filter(Boolean), st = $("#state").value;
  return C.filter(c => (!st || (c.s || c.co) === st) && q.every(w => c._s.includes(w)));
}
const groupName = c => c.co === "US" ? c.sn : c.co;

function render() {
  const now = Date.now();
  const all = base();
  let html = "", line = "";
  $("#mapWrap").hidden = tab !== "map";
  $("#jump").hidden = tab !== "all" || !!$("#state").value || !!$("#q").value.trim();
  if (tab === "live") {
    const st = all.map(c => ({ c, s: status(c, now) }));
    const live = st.filter(x => x.s.live).sort((a, b) => (b.c.ls ? 1 : 0) - (a.c.ls ? 1 : 0) || b.s.live.at - a.s.live.at);
    const soon = st.filter(x => !x.s.live && x.s.next && x.s.next.at - now < 12 * 3600e3).sort((a, b) => a.s.next.at - b.s.next.at);
    line = live.length + " in service now";
    html = '<h2 class="live-h">In service now</h2>' + (live.length ? '<ul class="rows">' + live.map(x => row(x.c, now)).join("") + "</ul>" : '<div class="empty-res">No services happening right now.</div>') +
      '<h2 class="live-h">Starting in the next 12 hours</h2>' + (soon.length ? '<ul class="rows">' + soon.map(x => row(x.c, now)).join("") + "</ul>" : '<div class="empty-res">Nothing in the next 12 hours.</div>');
  } else if (tab === "near") {
    if (!pos) { html = '<div class="empty-res">Finding your location… If nothing happens, allow location for this site, or search a city instead.</div>'; askPos(); }
    else { const list = all.filter(c => c.lat).sort((a, b) => miles(a) - miles(b)).slice(0, 40); line = "The " + list.length + " closest churches"; html = '<ul class="rows">' + list.map(c => row(c, now)).join("") + "</ul>"; }
  } else {
    const list = tab === "watch" ? all.filter(c => c.ls) : all;
    line = list.length === C.length ? C.length + " churches" : list.length + (list.length === 1 ? " church" : " churches") + (tab === "watch" ? " stream online" : " match");
    if (!list.length) html = '<div class="empty-res">No church matches that. Try a city name, or choose All places.</div>';
    const groups = new Map();
    list.forEach(c => { const g = groupName(c); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); });
    for (const [g, cs] of groups) html += '<h2 class="grp-h" id="g-' + esc(norm(g).replace(/ /g, "-")) + '">' + esc(g) + " <small>" + cs.length + '</small></h2><ul class="rows">' + cs.map(c => row(c, now)).join("") + "</ul>";
    if (tab === "map") { drawMap(); dim(new Set(list.map(c => c.id))); }
  }
  $("#resultLine").textContent = line;
  $("#results").innerHTML = html;
  const n = C.filter(c => status(c, now).live).length;
  $("#liveCount").textContent = n; $("#liveCountTop").textContent = n;
  measure();
}

function buildJump() {
  const seen = []; C.forEach(c => { const g = groupName(c); if (!seen.includes(g)) seen.push(g); });
  const abbr = g => (C.find(c => groupName(c) === g && c.co === "US") || {}).s || g;
  $("#jump").innerHTML = seen.map(g => '<a href="#g-' + esc(norm(g).replace(/ /g, "-")) + '" title="' + esc(g) + '">' + esc(abbr(g)) + "</a>").join("");
}
function setTab(t) {
  tab = t;
  $$('.tabs [role="tab"]').forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  render();
}
function askPos() {
  if (!navigator.geolocation) { $("#results").innerHTML = '<div class="empty-res">Your browser does not share location. Search a city instead.</div>'; return; }
  navigator.geolocation.getCurrentPosition(p => { pos = [p.coords.latitude, p.coords.longitude]; if (tab === "near") render(); },
    () => { if (tab === "near") $("#results").innerHTML = '<div class="empty-res">Location is turned off for this site. Search a city or pick a state instead.</div>'; }, { timeout: 10000, maximumAge: 600000 });
}

/* ---------- sticky offsets ---------- */
function measure() {
  const h = document.querySelector(".hdr"), b = $("#bar");
  if (h) document.documentElement.style.setProperty("--hdr-h", h.getBoundingClientRect().height + "px");
  if (b) document.documentElement.style.setProperty("--bar-h", b.getBoundingClientRect().height + "px");
}
addEventListener("resize", measure, { passive: true });
let mq = 0; addEventListener("scroll", () => { if (!mq) mq = requestAnimationFrame(() => { mq = 0; measure(); }); }, { passive: true });

/* ---------- map ---------- */
let mapDone = false;
function drawMap() {
  if (mapDone) return; mapDone = true;
  fetch("/data/us-map.json").then(r => r.json()).then(m => {
    $("#land").setAttribute("d", m.land); $("#borders").setAttribute("d", m.borders);
    $("#dots").innerHTML = C.filter(c => c.xy).map(c => '<circle tabindex="0" r="5.5" cx="' + c.xy[0] + '" cy="' + c.xy[1] + '" data-id="' + esc(c.id) + '" class="' + (c.id.includes(HOME) ? "home" : c.ls ? "live" : "") + '"><title>' + esc(c.n + " · " + place(c)) + "</title></circle>").join("");
    dim(new Set(base().map(c => c.id)));
  }).catch(() => { $("#mapWrap").hidden = true; });
}
function dim(keep) { $$("#dots circle").forEach(el => el.classList.toggle("dim", !keep.has(el.dataset.id))); }
function openChurch(id) {
  openId = id;
  if (tab !== "all" && tab !== "map") { tab = "all"; $$('.tabs [role="tab"]').forEach(b => b.setAttribute("aria-selected", b.dataset.tab === "all")); }
  if (!document.getElementById("c-" + id)) { $("#q").value = ""; $("#state").value = ""; }
  render();
  const el = document.getElementById("c-" + id);
  if (el) { el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); el.classList.add("flash"); }
}

/* ---------- events ---------- */
let qt;
$("#q").addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { if (tab === "near" || tab === "live") setTab("all"); else render(); }, 120); });
$("#q").addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); });
$("#state").addEventListener("change", () => { if (tab === "near") setTab("all"); else render(); scrollTo({ top: $("#bar").offsetTop - 80 }); });
document.addEventListener("click", e => {
  const t = e.target.closest("[data-tab]");
  if (t) { e.preventDefault(); setTab(t.dataset.tab); if (t.classList.contains("live-link")) $("#bar").scrollIntoView({ block: "start" }); return; }
  const b = e.target.closest(".ch > button");
  if (b) { const li = b.parentElement, o = !li.classList.contains("open"); $$(".ch.open").forEach(x => { x.classList.remove("open"); x.firstElementChild.setAttribute("aria-expanded", "false"); }); if (o) { li.classList.add("open"); b.setAttribute("aria-expanded", "true"); } openId = o ? li.id.slice(2) : null; return; }
  const d = e.target.closest("#dots circle");
  if (d) { openChurch(d.dataset.id); return; }
  const j = e.target.closest(".jump a");
  if (j) { e.preventDefault(); const g = document.getElementById(j.getAttribute("href").slice(1)); if (g) g.scrollIntoView({ block: "start" }); }
});
document.addEventListener("keydown", e => { const d = e.target.closest && e.target.closest("#dots circle"); if (d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openChurch(d.dataset.id); } });

/* ---------- boot ---------- */
fetch("/data/churches.json").then(r => r.json()).then(data => {
  C = data;
  C.forEach(c => c._s = norm([c.n, c.c, c.s, c.sn, c.co, c.p.join(" "), c.cl, c.al || ""].join(" ")));
  const places = [...new Set(C.map(c => c.s || c.co))];
  const label = v => (C.find(c => (c.s || c.co) === v) || {}).sn || v;
  const us = places.filter(p => C.some(c => c.s === p)).sort((a, b) => label(a).localeCompare(label(b)));
  const intl = places.filter(p => !us.includes(p)).sort();
  $("#state").innerHTML = '<option value="">All places</option><optgroup label="United States">' + us.map(p => '<option value="' + esc(p) + '">' + esc(label(p)) + "</option>").join("") + '</optgroup><optgroup label="Other countries">' + intl.map(p => '<option value="' + esc(p) + '">' + esc(p) + "</option>").join("") + "</optgroup>";
  $("#totalCount").textContent = C.length;
  buildJump();
  if (location.hash.startsWith("#c-")) openChurch(location.hash.slice(3)); else render();
  setInterval(() => { if (!document.hidden && !document.querySelector(".ch.open")) render(); else { const n = C.filter(c => status(c, Date.now()).live).length; $("#liveCount").textContent = n; $("#liveCountTop").textContent = n; } }, 60000);
}).catch(() => { $("#results").innerHTML = '<div class="empty-res">The church list did not load. Refresh the page to try again.</div>'; });
})();
