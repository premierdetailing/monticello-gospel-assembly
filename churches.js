/* Churches & live streams. Data: /data/churches.json (built from the Gospel Assembly directory), map: /data/us-map.json */
(() => {
"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LIVE_MS = 2 * 60 * 60 * 1000;
const HOME_ID_HINT = "monticello-gospel-assembly";
let C = [], viewerPos = null, onlyLive = false;

/* ---- time ---- */
const partsIn = (tz, d) => {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23", weekday: "short" });
  const o = {}; f.formatToParts(d).forEach(p => o[p.type] = p.value);
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday) };
};
const offsetMs = (tz, d) => { const p = partsIn(tz, d); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(d.getTime() / 1000) * 1000; };
// the most recent start (may be in the past) and the next start of a weekly service, as Date
function occurrences(tz, day, hhmm, now) {
  const p = partsIn(tz, now), off = offsetMs(tz, now);
  const [h, mi] = hhmm.split(":").map(Number);
  const base = Date.UTC(p.y, p.m - 1, p.d, h, mi) - off; // today at that local time
  let delta = (day - p.wd + 7) % 7;
  let next = base + delta * 864e5;
  if (next <= now.getTime() - 0) { if (delta === 0) next += 7 * 864e5; }
  const last = next - 7 * 864e5;
  return { last, next };
}
const fmtTime = (ms, opts = {}) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...opts });
const fmtDay = ms => {
  const d = new Date(ms), t = new Date(), tm = new Date(Date.now() + 864e5);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === tm.toDateString()) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "long" });
};
const t12 = hhmm => { const [h, m] = hhmm.split(":").map(Number); return (h % 12 || 12) + ":" + String(m).padStart(2, "0") + " " + (h < 12 ? "AM" : "PM"); };
const tzShort = tz => { try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()).find(p => p.type === "timeZoneName").value; } catch (e) { return ""; } };
const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

/* ---- links ---- */
const place = c => c.co === "US" ? c.c + ", " + c.s : c.c + ", " + c.co;
const watchUrl = c => c.ls || c.fb || "";
const watchLabel = c => c.ls ? (/youtube|youtu\.be/.test(c.ls) ? "Watch on YouTube" : /facebook/.test(c.ls) ? "Watch on Facebook" : "Watch live") : c.fb ? "Facebook page" : "";
const dirUrl = c => c.lat ? "https://www.google.com/maps/dir/?api=1&destination=" + c.lat + "," + c.lon : (c.st ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(c.st + " " + c.cl) : "");
const telFmt = d => d.length === 10 ? "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6) : d;
const ICON = {
  play: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>'
};
const actions = (c, big) => {
  const a = [];
  if (watchUrl(c)) a.push('<a class="sbtn' + (c.ls ? " watch" : "") + '" href="' + esc(watchUrl(c)) + '" target="_blank" rel="noopener">' + ICON.play + esc(watchLabel(c)) + "</a>");
  if (c.ph) a.push('<a class="sbtn" href="tel:+1' + esc(c.ph) + '">' + ICON.phone + (big ? "Call" : telFmt(c.ph)) + "</a>");
  if (dirUrl(c)) a.push('<a class="sbtn" href="' + esc(dirUrl(c)) + '" target="_blank" rel="noopener">' + ICON.pin + "Directions</a>");
  if (c.w && !big) a.push('<a class="sbtn" href="' + esc(c.w) + '" target="_blank" rel="noopener">' + ICON.web + "Website</a>");
  return '<div class="acts">' + a.join("") + "</div>";
};

/* ---- live now / up next ---- */
function schedule(now) {
  const live = [], up = [];
  for (const c of C) {
    if (!c.tz) continue;
    for (const [d, t, irregular, note] of c.sv) {
      if (irregular) continue;
      const { last, next } = occurrences(c.tz, d, t, now);
      if (now - last < LIVE_MS && now >= last) live.push({ c, start: last, t, note });
      else if (now - next > -LIVE_MS && now >= next) live.push({ c, start: next, t, note });
      up.push({ c, start: next > now ? next : next + 7 * 864e5, t, note });
    }
  }
  live.sort((a, b) => (b.c.ls ? 1 : 0) - (a.c.ls ? 1 : 0) || a.start - b.start);
  up.sort((a, b) => a.start - b.start);
  return { live, up };
}
function renderLive() {
  const now = new Date();
  $("#nowClock").textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const { live, up } = schedule(now);
  const seen = new Set();
  const uniq = live.filter(x => !seen.has(x.c.id) && seen.add(x.c.id));
  $("#liveCount").textContent = uniq.length;
  const streaming = uniq.filter(x => watchUrl(x.c));
  $("#liveTitle").textContent = uniq.length ? "Live right now" : "No services right now";
  if (!uniq.length) {
    const n = up.find(x => watchUrl(x.c)) || up[0];
    $("#liveGrid").innerHTML = '<div class="live-empty"><strong>Next service: ' + esc(n.c.n) + "</strong>" + esc(place(n.c)) + " · " + esc(fmtDay(n.start)) + " at " + esc(fmtTime(n.start)) + " your time" + (watchUrl(n.c) ? ' · <a href="' + esc(watchUrl(n.c)) + '" target="_blank" rel="noopener">' + esc(watchLabel(n.c)) + "</a>" : "") + "</div>";
  } else {
    const show = (streaming.length ? streaming : uniq).slice(0, 9);
    $("#liveGrid").innerHTML = show.map(x => '<article class="live-card"><span class="badge">Live · started ' + esc(fmtTime(x.start)) + "</span><h3>" + esc(x.c.n) + '</h3><span class="where">' + esc(place(x.c)) + (x.c.p[0] ? " · " + esc(x.c.p[0]) : "") + "</span>" + actions(x.c, true) + "</article>").join("") +
      (uniq.length > show.length ? '<div class="live-empty"><strong>' + (uniq.length - show.length) + " more in service now</strong>Without a stream link. Search below to find them.</div>" : "");
  }
  // up next: within 7 days, prefer churches that stream, one line per church
  const ups = [], u = new Set();
  for (const x of up) { if (u.has(x.c.id)) continue; u.add(x.c.id); ups.push(x); if (ups.length >= 8) break; }
  $("#upNext").innerHTML = ups.map(x => '<li><span class="when">' + esc(fmtTime(x.start)) + "<small>" + esc(fmtDay(x.start)) + '</small></span><span class="who"><strong>' + esc(x.c.n) + "</strong><span>" + esc(place(x.c)) + " · " + esc(t12(x.t)) + " " + esc(tzShort(x.c.tz)) + (x.note ? " · " + esc(x.note) : "") + "</span></span>" +
    (watchUrl(x.c) ? '<a class="go" href="' + esc(watchUrl(x.c)) + '" target="_blank" rel="noopener">' + esc(watchLabel(x.c)) + " →</a>" : '<a class="go" href="#c-' + esc(x.c.id) + '">Details →</a>') + "</li>").join("");
}

/* ---- list ---- */
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
function haversine(a, b, c, d) { const R = 3958.8, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function svcList(c) {
  const by = {};
  c.sv.forEach(([d, t, irr, note]) => (by[d] ||= []).push(t12(t) + (irr || note ? "" : "") ));
  const order = [0, 1, 2, 3, 4, 5, 6];
  const rows = order.filter(d => by[d]).map(d => "<li><b>" + DAY[d] + "</b><span>" + by[d].join(" &amp; ") + "</span></li>");
  const extra = c.svt.filter(l => /\d(st|nd|rd|th)|youth|bible study|school|creole|spanish|english/i.test(l)).map(l => "<li><i>" + esc(l) + "</i></li>");
  if (!rows.length && !extra.length) return '<p class="cnote">Call for service times.</p>';
  return '<ul class="svc">' + rows.join("") + extra.join("") + "</ul>";
}
function card(c, liveIds) {
  const home = c.id.includes(HOME_ID_HINT);
  const dist = viewerPos && c.lat ? '<span class="dist">' + Math.round(haversine(viewerPos[0], viewerPos[1], c.lat, c.lon)) + " miles away</span>" : "";
  return '<article class="church' + (home ? " home" : "") + '" id="c-' + esc(c.id) + '"><span class="city">' + esc(place(c)) + (liveIds.has(c.id) ? ' <span class="livepill">Live now</span>' : "") + "</span>" +
    "<h4>" + esc(c.n) + (home ? '<span class="ours">Our church</span>' : "") + "</h4>" +
    (c.p.length ? '<span class="pastor">' + c.p.map(esc).join("<br>") + "</span>" : "") + dist + svcList(c) +
    (c.st ? '<address class="caddr">' + esc(c.st) + (c.cl ? ", " + esc(c.cl) : "") + "</address>" : "") +
    (c.nt ? '<span class="cnote">' + esc(c.nt) + "</span>" : "") + actions(c, false) + "</article>";
}
function filtered() {
  const q = norm($("#q").value).trim().split(/\s+/).filter(Boolean);
  const st = $("#state").value;
  let list = C.filter(c => (!st || (c.s || c.co) === st) && (!onlyLive || c.ls) && q.every(w => c._s.includes(w)));
  if (viewerPos) list = list.filter(c => c.lat).sort((a, b) => haversine(viewerPos[0], viewerPos[1], a.lat, a.lon) - haversine(viewerPos[0], viewerPos[1], b.lat, b.lon));
  return list;
}
function renderList() {
  const list = filtered();
  const liveIds = new Set(schedule(new Date()).live.map(x => x.c.id));
  $("#resultLine").textContent = list.length === C.length ? "Showing all " + C.length + " churches." : list.length + (list.length === 1 ? " church" : " churches") + " match.";
  if (!list.length) { $("#results").innerHTML = '<div class="empty-res">No church matches that. Try a city name or clear the filters.</div>'; dimDots(new Set()); return; }
  let h = "";
  if (viewerPos) h = '<div class="place"><h3>Closest to you</h3><div class="cards">' + list.slice(0, 24).map(c => card(c, liveIds)).join("") + "</div></div>";
  else {
    const groups = new Map();
    list.forEach(c => { const g = c.co === "US" ? c.sn : c.co; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); });
    for (const [g, cs] of groups) h += '<div class="place"><h3>' + esc(g) + " <small>" + cs.length + "</small></h3><div class=\"cards\">" + cs.map(c => card(c, liveIds)).join("") + "</div></div>";
  }
  $("#results").innerHTML = h;
  dimDots(new Set(list.map(c => c.id)));
}

/* ---- map ---- */
let mapReady = false;
function drawMap() {
  if (mapReady) return; mapReady = true;
  fetch("/data/us-map.json").then(r => r.json()).then(m => {
    $("#land").setAttribute("d", m.land); $("#borders").setAttribute("d", m.borders);
    $("#dots").innerHTML = C.filter(c => c.xy).map(c => '<circle tabindex="0" r="5" cx="' + c.xy[0] + '" cy="' + c.xy[1] + '" data-id="' + esc(c.id) + '" class="' + (c.id.includes(HOME_ID_HINT) ? "home" : c.ls ? "live" : "") + '"><title>' + esc(c.n + " · " + place(c)) + "</title></circle>").join("");
    renderList();
  }).catch(() => { $("#mapWrap").hidden = true; });
}
function dimDots(keep) { document.querySelectorAll("#dots circle").forEach(el => el.classList.toggle("dim", !keep.has(el.dataset.id))); }
function goTo(id) {
  let el = document.getElementById("c-" + id);
  if (!el) { $("#q").value = ""; $("#state").value = ""; onlyLive = false; $("#onlyLive").setAttribute("aria-pressed", "false"); renderList(); el = document.getElementById("c-" + id); }
  if (el) { el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
}

/* ---- boot ---- */
fetch("/data/churches.json").then(r => r.json()).then(data => {
  C = data;
  C.forEach(c => c._s = norm([c.n, c.c, c.s, c.sn, c.co, c.p.join(" "), c.cl, c.al || ""].join(" ")));
  const places = [...new Set(C.map(c => c.s || c.co))];
  const label = v => (C.find(c => (c.s || c.co) === v) || {}).sn || v;
  const usP = places.filter(p => C.some(c => c.s === p)).sort((a, b) => label(a).localeCompare(label(b)));
  const intl = places.filter(p => !usP.includes(p)).sort();
  $("#state").innerHTML = '<option value="">All places</option><optgroup label="United States">' + usP.map(p => '<option value="' + esc(p) + '">' + esc(label(p)) + "</option>").join("") + '</optgroup><optgroup label="Other countries">' + intl.map(p => '<option value="' + esc(p) + '">' + esc(p) + "</option>").join("") + "</optgroup>";
  $("#totalCount").textContent = C.length; $("#stateCount").textContent = usP.length; $("#countryCount").textContent = intl.length;
  renderLive(); setInterval(renderLive, 30000);
  renderList();
  if ("IntersectionObserver" in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { drawMap(); io.disconnect(); } }, { rootMargin: "400px" }); io.observe($("#mapWrap")); } else drawMap();
  if (location.hash.startsWith("#c-")) setTimeout(() => goTo(location.hash.slice(3)), 50);
}).catch(() => { $("#results").innerHTML = '<div class="empty-res">The church list did not load. Refresh the page to try again.</div>'; });

let qt;
$("#q").addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(renderList, 120); });
$("#state").addEventListener("change", renderList);
$("#onlyLive").addEventListener("click", e => { onlyLive = !onlyLive; e.currentTarget.setAttribute("aria-pressed", onlyLive); renderList(); });
$("#nearMe").addEventListener("click", e => {
  const b = e.currentTarget;
  if (viewerPos) { viewerPos = null; b.setAttribute("aria-pressed", "false"); b.textContent = "Near me"; renderList(); return; }
  if (!navigator.geolocation) { b.textContent = "Location not available"; return; }
  b.textContent = "Finding you…";
  navigator.geolocation.getCurrentPosition(p => { viewerPos = [p.coords.latitude, p.coords.longitude]; b.setAttribute("aria-pressed", "true"); b.textContent = "Near me ✓"; renderList(); },
    () => { b.textContent = "Location blocked"; setTimeout(() => b.textContent = "Near me", 2500); }, { timeout: 10000, maximumAge: 600000 });
});
document.addEventListener("click", e => { const d = e.target.closest("#dots circle"); if (d) goTo(d.dataset.id); const a = e.target.closest('a[href^="#c-"]'); if (a) { e.preventDefault(); goTo(a.getAttribute("href").slice(3)); } });
document.addEventListener("keydown", e => { const d = e.target.closest && e.target.closest("#dots circle"); if (d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); goTo(d.dataset.id); } });
})();
