/* Churches & live streams: Watch live (default), Find a church, Plan a trip.
   Written for older visitors: every detail on the card, big labeled buttons, plain sentences, Back button works.
   Data: /data/churches.json, /data/us-map.json (map), /data/places.json (town names for the trip and town search). */
(() => {
"use strict";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], DSH = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LIVE_MS = 2 * 3600e3, HOME = "monticello-gospel-assembly";
const COUNTRY = { Elsalvador: "El Salvador", "Fr Guiana": "French Guiana" };
let C = [], mode = "watch", pos = null, nearOn = false, mapOn = false, streamOnly = false, upDays = 3, lastWatch = "";
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

/* ---------- text size ---------- */
function setZoom(z) {
  document.documentElement.style.fontSize = z === 1 ? "" : z * 100 + "%";
  $$(".tsz button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.z === z)));
  store.set("tsz", z); measure();
}

/* ---------- time (works across daylight-saving changes) ---------- */
const fmtCache = {};
function partsIn(tz, ms) {
  const f = fmtCache[tz] ||= new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23", weekday: "short" });
  const o = {}; f.formatToParts(ms).forEach(p => o[p.type] = p.value);
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: DSH.indexOf(o.weekday) };
}
const offsetAt = (tz, ms) => { const p = partsIn(tz, ms); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };
function wallToUtc(tz, y, m, d, h, mi) { const g = Date.UTC(y, m - 1, d, h, mi); return g - offsetAt(tz, g - offsetAt(tz, g)); }
function nextStart(tz, day, hhmm, now) {
  const p = partsIn(tz, now), [h, mi] = hhmm.split(":").map(Number), add = (day - p.wd + 7) % 7;
  const at = k => wallToUtc(tz, p.y, p.m, p.d + k, h, mi);
  let k = add, next = at(k);
  if (next <= now) next = at(k += 7);
  return { last: at(k - 7), next };
}
const T = (h, m) => (h % 12 || 12) + ":" + String(m).padStart(2, "0") + " " + (h < 12 ? "AM" : "PM");
const t12 = hhmm => { const [h, m] = hhmm.split(":").map(Number); return T(h, m); };
const yourTime = ms => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, " ");
const dayKey = ms => new Date(ms).toDateString();
const longDate = ms => { const d = new Date(ms); return DAY[d.getDay()] + ", " + MON[d.getMonth()] + " " + d.getDate(); };
function dayName(ms) { const k = dayKey(ms); return k === dayKey(Date.now()) ? "Today" : k === dayKey(Date.now() + 864e5) ? "Tomorrow" : DAY[new Date(ms).getDay()]; }
let tzLabel = "";
try { tzLabel = new Intl.DateTimeFormat("en-US", { timeZoneName: "longGeneric" }).formatToParts(new Date()).find(p => p.type === "timeZoneName").value; } catch (e) {}
function status(c, now) {
  let live = null, next = null;
  if (!c.tz) return { live, next };
  for (const [d, t, irr] of c.sv) {
    if (irr) continue;
    const o = nextStart(c.tz, d, t, now);
    if (now - o.last < LIVE_MS && (!live || o.last > live.at)) live = { at: o.last, d, t };
    if (!next || o.next < next.at) next = { at: o.next, d, t };
  }
  return { live, next };
}
const sameClock = (ms, hhmm) => yourTime(ms) === t12(hhmm);

/* ---------- shared bits ---------- */
const country = c => COUNTRY[c.co] || c.co;
const place = c => c.co === "US" ? c.c + ", " + (c.sn || c.s) : c.co === "Canada" ? c.c + ", Canada" : c.c === country(c) ? c.c : c.c + ", " + country(c);
const pastorName = p => p.replace(/,?\s*Pastors?$/i, "");
const pastor = c => c.p[0] ? pastorName(c.p[0]) : "";
const watchLabel = u => /youtube|youtu\.be/.test(u) ? "Watch on YouTube" : /facebook/.test(u) ? "Watch on Facebook" : /boxcast/.test(u) ? "Watch on BoxCast" : "Watch on their website";
const telHref = c => "tel:" + (c.pt || "+1" + c.ph);
const telText = c => c.pd || (c.ph.length === 10 ? "(" + c.ph.slice(0, 3) + ") " + c.ph.slice(3, 6) + "-" + c.ph.slice(6) : c.ph);
function dirUrl(c) {
  if (c.ap) return c.st ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(c.st + ", " + (c.cl || place(c))) : "";
  return c.lat ? "https://www.google.com/maps/dir/?api=1&destination=" + c.lat + "," + c.lon : "";
}
const I = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  web: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
  fb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/></svg>',
  map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>'
};
const ext = (cls, href, icon, label) => '<a class="act' + (cls ? " " + cls : "") + '" href="' + esc(href) + '" target="_blank" rel="noopener">' + icon + label + "</a>";
function acts(c, o = {}) {
  const a = [];
  if (o.first) a.push(o.first);
  if (c.ls) a.push(ext("watch", c.ls, I.play, o.watchText || watchLabel(c.ls)));
  if (c.ph) a.push('<a class="act" href="' + esc(telHref(c)) + '">' + I.phone + "Call " + esc(telText(c)) + "</a>");
  if (!o.noDir && dirUrl(c)) a.push(ext("", dirUrl(c), I.pin, "Get directions"));
  if (c.fb && c.fb !== c.ls) a.push(ext("", c.fb, I.fb, "Facebook page"));
  if (c.w && c.w !== c.ls) a.push(ext("", c.w, I.web, "Church website"));
  return a.length ? '<div class="cacts">' + a.join("") + "</div>" : "";
}
function weekly(c) {
  const by = {}; c.sv.forEach(([d, t, irr]) => { if (!irr) (by[d] ||= []).push(t12(t)); });
  return [0, 1, 2, 3, 4, 5, 6].filter(d => by[d]).map(d => "<b>" + DSH[d] + "</b> " + by[d].join(" &amp; "));
}
function svcList(c) {
  if (!c.sv.length) return "Call the church for service times.";
  const by = {}; c.sv.forEach(([d, t, irr, note]) => (by[d] ||= []).push(esc(t12(t)) + (note ? " <i>" + esc(note) + "</i>" : "") + (irr ? " <i>(not every week)</i>" : "")));
  return '<ul class="svc">' + [0, 1, 2, 3, 4, 5, 6].filter(d => by[d]).map(d => "<li><b>" + DAY[d] + "</b> " + by[d].join(", ") + "</li>").join("") + "</ul>";
}

/* ---------- WATCH ---------- */
function sCard(x, on, now) {
  const c = x.c, mine = yourTime(x.at), mins = Math.round((x.at - now) / 6e4);
  let tb;
  if (on) tb = '<span class="badge-live">ON NOW</span><small>Started at ' + esc(mine) + "</small>";
  else tb = esc(mine) + "<small>" + (mins <= 60 ? "Starts in " + Math.max(1, mins) + (mins === 1 ? " minute" : " minutes") : sameClock(x.at, x.t) ? "your time" : esc(t12(x.t)) + " in " + esc(c.c)) + "</small>";
  const wk = weekly(c);
  return '<article class="card scard' + (on ? " on" : "") + '"><div class="tbig">' + tb + "</div><div><h4>" + esc(c.n) + '</h4><p class="where">' + esc(place(c)) + (pastor(c) ? " · " + esc(pastor(c)) : "") + "</p>" +
    (wk.length ? '<p class="sched"><b>Every week' + (c.tz && !sameClock(x.at, x.t) ? " (their time)" : "") + ":</b> " + wk.join(" · ").replace(/<\/?b>/g, "") + "</p>" : "") +
    acts({ ls: c.ls, sv: [] }, { watchText: on ? watchLabel(c.ls).replace("Watch", "Watch now") : watchLabel(c.ls) }) + (c.lsn ? '<p class="lsn">' + esc(c.lsn) + "</p>" : "") + "</div></article>";
}
function renderWatch(force) {
  const now = Date.now(), live = [], up = [];
  for (const c of C) {
    if (!c.ls || !c.tz) continue;
    for (const [d, t, irr] of c.sv) {
      if (irr) continue;
      const o = nextStart(c.tz, d, t, now);
      if (now - o.last < LIVE_MS) live.push({ c, at: o.last, t });
      up.push({ c, at: o.next, t });
    }
  }
  live.sort((a, b) => b.at - a.at);
  up.sort((a, b) => a.at - b.at);
  const soon = up[0] && up[0].at - now < 61 * 6e4;
  const sig = live.map(x => x.c.id + x.at).join() + "|" + up.slice(0, 3).map(x => x.c.id + x.at).join() + "|" + upDays + "|" + (soon ? Math.floor(now / 6e4) : "");
  if (!force && sig === lastWatch) return;
  lastWatch = sig;
  $("#liveN").textContent = live.length;
  $("#liveList").innerHTML = live.length ? live.map(x => sCard(x, true, now)).join("")
    : '<div class="empty-res"><b>Nothing is on right now.</b>' + (up[0] ? " The next service is <b>" + esc({ Today: "today", Tomorrow: "tomorrow" }[dayName(up[0].at)] || "on " + dayName(up[0].at)) + " at " + esc(yourTime(up[0].at)) + "</b>: " + esc(up[0].c.n) + " in " + esc(place(up[0].c)) + "." : "") + "</div>";
  const days = [];
  up.forEach(x => { const k = dayKey(x.at); let g = days.find(d => d.k === k); if (!g) days.push(g = { k, at: x.at, items: [] }); g.items.push(x); });
  $("#upList").innerHTML = days.slice(0, upDays).map(g => {
    const n = dayName(g.at), full = longDate(g.at);
    return '<h4 class="day-h">' + esc(n === "Today" || n === "Tomorrow" ? n : full) + (n === "Today" || n === "Tomorrow" ? "<small>" + esc(full) + "</small>" : "") + "</h4>" + g.items.map(x => sCard(x, false, now)).join("");
  }).join("");
  $("#upMore").hidden = upDays >= days.length;
}

/* ---------- FIND ---------- */
const norm = s => " " + String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
  .replace(/\bsaint\b/g, "st").replace(/\bfort\b/g, "ft").replace(/\bmount\b/g, "mt") + " ";
const R = 3958.8, rad = Math.PI / 180;
function hav(a, b, c, d) { const x = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }
const groupKey = c => c.s || c.co, groupName = c => c.co === "US" ? c.sn : country(c);
function statusLine(c, now) {
  const st = status(c, now);
  if (st.live) return '<p class="status on">Service going on now <small>(started at ' + esc(yourTime(st.live.at)) + " your time)</small></p>";
  if (!st.next) return "";
  const dn = dayName(st.next.at), when = dn === "Today" ? "today" : dn === "Tomorrow" ? "tomorrow" : dn;
  return '<p class="status">Next service: ' + esc(when) + " at " + esc(yourTime(st.next.at)) + " <small>your time" + (sameClock(st.next.at, st.next.t) ? "" : " (" + esc(t12(st.next.t)) + " in " + esc(c.c) + ")") + "</small></p>";
}
function card(c, now, o = {}) {
  const home = c.id.includes(HOME);
  const addr = c.st ? esc(c.st) + "<br>" + esc(c.cl || place(c)) : "";
  const away = o.from && c.lat ? " · about " + Math.round(hav(o.from[0], o.from[1], c.lat, c.lon)).toLocaleString() + " miles from " + esc(o.fromName) : "";
  return '<article class="card' + (home ? " home" : "") + '" id="c-' + esc(c.id) + '"><h4>' + esc(c.n) + (home ? '<span class="tagh">Our church</span>' : "") + "</h4>" +
    '<p class="where"><b>' + esc(place(c)) + "</b>" + away + "</p>" + statusLine(c, now) +
    '<dl class="info"><dt>Services</dt><dd>' + svcList(c) + "</dd>" +
    (c.p.length ? "<dt>" + (c.p.length > 1 ? "Pastors" : "Pastor") + "</dt><dd>" + c.p.map(p => esc(/senior|lead|elder/i.test(p) ? p : pastorName(p))).join("<br>") + "</dd>" : "") +
    (addr ? "<dt>Address</dt><dd>" + addr + "</dd>" : "") + "</dl>" +
    (c.nt ? '<p class="nt">' + esc(c.nt) + "</p>" : "") + (c.ap && !c.st && !/location|place/i.test(c.nt) ? '<p class="nt">The directory has no street address for this church. Call for the location.</p>' : "") +
    acts(c, o) + "</article>";
}
function filtered() {
  const words = norm($("#q").value).trim().split(" ").filter(Boolean), st = $("#state").value;
  let L = C.filter(c => (!st || groupKey(c) === st) && (!streamOnly || c.ls) && words.every(w => c._s.includes(w)));
  if (words.length > 1) { const ph = " " + words.join(" ") + " ", P2 = L.filter(c => c._s.includes(ph)); if (P2.length) L = P2; }
  return L;
}
function townMatch(text) {
  if (!P) return null;
  const parts = text.split(","), name = norm(parts[0]).trim(), st = (parts[1] || "").trim().toUpperCase();
  if (name.length < 3) return null;
  const has = new Set(C.map(c => c.s));
  return P.filter(p => p.k === name && (!st || p.s === st || stateName(p.s).toUpperCase() === st)).sort((a, b) => (has.has(b.s) ? 1 : 0) - (has.has(a.s) ? 1 : 0))[0] || null;
}
const stateName = s => (C.find(c => c.s === s) || {}).sn || s;
const grouped = (list, now) => {
  const groups = new Map();
  list.forEach(c => { const g = groupName(c); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); });
  let h = "";
  for (const [g, cs] of groups) h += '<h3 class="grp-h">' + esc(g) + " <small>" + cs.length + (cs.length === 1 ? " church" : " churches") + "</small></h3>" + cs.map(c => card(c, now)).join("");
  return h;
};
function stateGrid() {
  const counts = new Map(); C.forEach(c => { const k = groupKey(c); counts.set(k, (counts.get(k) || 0) + 1); });
  const us = [...counts.keys()].filter(k => C.some(c => c.s === k)), other = [...counts.keys()].filter(k => !us.includes(k));
  const btn = k => '<button type="button" class="act" data-state="' + esc(k) + '">' + esc(us.includes(k) ? stateName(k) : COUNTRY[k] || k) + " (" + counts.get(k) + ")</button>";
  return '<h3 class="grp-h">United States</h3><div class="cacts">' + us.sort((a, b) => stateName(a).localeCompare(stateName(b))).map(btn).join("") + '</div><h3 class="grp-h">Other countries</h3><div class="cacts">' + other.sort().map(btn).join("") + "</div>";
}
function renderFind() {
  const now = Date.now(), qv = $("#q").value.trim(), st = $("#state").value;
  $("#qClear").hidden = !qv;
  $("#mapWrap").hidden = !mapOn;
  let html = "", line = "", shown = C;
  const placeLabel = k => C.some(c => c.s === k) ? stateName(k) : COUNTRY[k] || k;
  if (nearOn && pos) {
    shown = C.filter(c => c.lat && (!streamOnly || c.ls) && (!st || groupKey(c) === st)).sort((a, b) => hav(pos[0], pos[1], a.lat, a.lon) - hav(pos[0], pos[1], b.lat, b.lon)).slice(0, 25);
    line = "The " + shown.length + " churches closest to you" + (streamOnly ? " that stream online" : "") + ", nearest first.";
    html = shown.map(c => card(c, now, { from: pos, fromName: "you" })).join("");
  } else if (!qv && !st && !streamOnly) {
    line = "Choose a state to see its churches, or search above.";
    html = stateGrid();
  } else {
    shown = filtered();
    if (shown.length) {
      line = (shown.length === 1 ? "1 church" : shown.length + " churches") + (st ? " in " + esc(placeLabel(st)) : "") + (qv ? " matching &ldquo;" + esc(qv) + "&rdquo;" : "") + (streamOnly ? " that stream online" : "") + ".";
      html = grouped(shown, now);
    } else if (qv && !P) { loadPlaces().then(renderFind); line = "Searching…"; }
    else {
      const town = qv ? townMatch(qv) : null;
      if (town) {
        shown = C.filter(c => c.lat && (!streamOnly || c.ls)).sort((a, b) => hav(town.lat, town.lon, a.lat, a.lon) - hav(town.lat, town.lon, b.lat, b.lon)).slice(0, 10);
        line = "There is no church in " + esc(town.n) + " itself. These are the 10 closest to " + esc(town.n) + ", " + esc(stateName(town.s)) + ", nearest first.";
        html = shown.map(c => card(c, now, { from: [town.lat, town.lon], fromName: town.n })).join("");
      } else html = '<div class="empty-res"><b>Nothing matched' + (qv ? " &ldquo;" + esc(qv) + "&rdquo;" : "") + ".</b> Check the spelling, or try the name of a nearby town.</div>";
    }
  }
  if (qv || st || nearOn || streamOnly) line += ' <button type="button" class="act" data-reset>Start over</button>';
  $("#resultLine").innerHTML = line;
  $("#results").innerHTML = html;
  if (mapOn) { drawMap(); dim(new Set(shown.map(c => c.id))); }
}
function getPos(cb, fail) {
  if (pos) return cb(pos);
  if (!navigator.geolocation) return fail && fail();
  navigator.geolocation.getCurrentPosition(p => { pos = [p.coords.latitude, p.coords.longitude]; cb(pos); }, () => fail && fail(), { timeout: 12000, maximumAge: 600000 });
}
let mapDone = false;
function drawMap() {
  if (mapDone) return; mapDone = true;
  fetch("/data/us-map.json").then(r => r.json()).then(m => {
    $("#land").setAttribute("d", m.land); $("#borders").setAttribute("d", m.borders);
    $("#dots").innerHTML = C.filter(c => c.xy).sort((a, b) => (a.id.includes(HOME) ? 1 : 0) - (b.id.includes(HOME) ? 1 : 0)).map(c => '<circle tabindex="0" role="button" r="' + (c.id.includes(HOME) ? 9 : 7) + '" cx="' + c.xy[0] + '" cy="' + c.xy[1] + '" data-id="' + esc(c.id) + '" class="' + (c.id.includes(HOME) ? "home" : c.ls ? "live" : "") + '"><title>' + esc(c.n + ", " + place(c)) + "</title></circle>").join("");
    renderFind();
  }).catch(() => { $("#mapWrap").hidden = true; mapOn = false; $("#mapBtn").setAttribute("aria-pressed", "false"); });
}
function dim(keep) { $$("#dots circle").forEach(el => el.classList.toggle("dim", !keep.has(el.dataset.id))); }
function resetFind() { $("#q").value = ""; $("#state").value = ""; nearOn = false; streamOnly = false; $("#nearBtn").setAttribute("aria-pressed", "false"); $("#streamBtn").setAttribute("aria-pressed", "false"); }
function openChurch(id) {
  const c = C.find(x => x.id === id); if (!c) return setMode("find");
  setMode("find", false, true);
  resetFind(); $("#state").value = groupKey(c);
  renderFind();
  const el = document.getElementById("c-" + id);
  if (el) { el.scrollIntoView({ block: "start" }); el.classList.add("flash"); }
}

/* ---------- TRIP ---------- */
let P = null, pPromise = null;
const loadPlaces = () => pPromise ||= fetch("/data/places.json").then(r => r.json()).then(d => (P = d.map(x => ({ n: x[0], s: x[1], lat: x[2], lon: x[3], k: norm(x[0]).trim() }))));
function matches(text, max = 8) {
  if (!P) return [];
  const parts = text.split(","), name = norm(parts[0]).trim(), st = (parts[1] || "").trim().toUpperCase();
  if (!name) return [];
  const has = new Set(C.map(c => c.s));
  const list = P.filter(p => p.k.startsWith(name) && (!st || p.s.startsWith(st.slice(0, 2)) || stateName(p.s).toUpperCase().startsWith(st)));
  list.sort((a, b) => (a.k === name ? 0 : 1) - (b.k === name ? 0 : 1) || (has.has(b.s) ? 1 : 0) - (has.has(a.s) ? 1 : 0) || a.k.length - b.k.length);
  return list.slice(0, max);
}
const placeText = p => p.n + ", " + stateName(p.s);
function resolvePlace(inp) {
  if (inp.dataset.lat) return { n: inp.dataset.name, lat: +inp.dataset.lat, lon: +inp.dataset.lon };
  const m = matches(inp.value, 1)[0];
  return m ? { n: placeText(m), lat: m.lat, lon: m.lon, guessed: true } : null;
}
function setupAC(inp, list) {
  let items = [], idx = -1;
  const close = () => { list.hidden = true; idx = -1; inp.setAttribute("aria-expanded", "false"); };
  const pick = p => { inp.value = placeText(p); inp.dataset.lat = p.lat; inp.dataset.lon = p.lon; inp.dataset.name = placeText(p); close(); };
  inp.setAttribute("role", "combobox"); inp.setAttribute("aria-controls", list.id); inp.setAttribute("aria-autocomplete", "list"); inp.setAttribute("aria-expanded", "false");
  inp.addEventListener("focus", loadPlaces);
  inp.addEventListener("input", () => {
    delete inp.dataset.lat;
    loadPlaces().then(() => {
      items = matches(inp.value);
      list.innerHTML = items.map((p, i) => '<li role="option" data-i="' + i + '">' + esc(p.n) + "<small>" + esc(stateName(p.s)) + "</small></li>").join("");
      list.hidden = !items.length || !inp.value.trim(); idx = -1;
      inp.setAttribute("aria-expanded", String(!list.hidden));
    });
  });
  inp.addEventListener("keydown", e => {
    if (list.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; $$("#" + list.id + " li").forEach((li, i) => li.setAttribute("aria-selected", String(i === idx))); }
    else if (e.key === "Enter") { e.preventDefault(); pick(items[Math.max(0, idx)]); }
    else if (e.key === "Escape") close();
  });
  list.addEventListener("mousedown", e => { const li = e.target.closest("li"); if (li) { e.preventDefault(); pick(items[+li.dataset.i]); } });
  list.addEventListener("click", e => { const li = e.target.closest("li"); if (li && !list.hidden) pick(items[+li.dataset.i]); });
  inp.addEventListener("blur", () => setTimeout(close, 200));
}
function bearing(a, b, c, d) { const y = Math.sin((d - b) * rad) * Math.cos(c * rad), x = Math.cos(a * rad) * Math.sin(c * rad) - Math.sin(a * rad) * Math.cos(c * rad) * Math.cos((d - b) * rad); return Math.atan2(y, x); }
function along(A, B, Q) { // miles along the line A→B, and miles off it
  const d13 = hav(A.lat, A.lon, Q.lat, Q.lon) / R, t13 = bearing(A.lat, A.lon, Q.lat, Q.lon), t12b = bearing(A.lat, A.lon, B.lat, B.lon);
  const xt = Math.asin(Math.sin(d13) * Math.sin(t13 - t12b));
  let at = Math.acos(Math.max(-1, Math.min(1, Math.cos(d13) / Math.cos(xt)))) * R;
  if (Math.cos(t13 - t12b) < 0) at = -at;
  return { at, off: Math.abs(xt * R) };
}
const ROAD = 1.2, PER_DAY = 600;
const ymd = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const dLabel = ms => { const d = new Date(ms); return DAY[d.getUTCDay()] + ", " + MON[d.getUTCMonth()].slice(0, 3) + " " + d.getUTCDate(); };
function servicesBetween(c, from, to) {
  const out = [];
  for (let t = from; t <= to && out.length < 10; t += 864e5) {
    const wd = new Date(t).getUTCDay();
    c.sv.filter(s => s[0] === wd).forEach(s => out.push("<li>" + esc(dLabel(t)) + " at " + esc(t12(s[1])) + (s[3] ? " <i>" + esc(s[3]) + "</i>" : "") + (s[2] ? " <i>(not every week)</i>" : "") + "</li>"));
  }
  return out;
}
function passLines(c, day, label) {
  const wd = new Date(day).getUTCDay(), on = c.sv.filter(s => s[0] === wd && !s[2]);
  return on.length ? on.map(s => '<li class="hit">' + esc(label) + " " + esc(dLabel(day)) + ": service at " + esc(t12(s[1])) + ". You could make this one.</li>").join("")
    : '<li class="miss">' + esc(label) + " " + esc(dLabel(day)) + ": no service that day.</li>";
}
function tripErr(html) { $("#tripMsg").innerHTML = '<div class="warn">' + html + "</div>"; $("#tripOut").innerHTML = ""; $("#tripMsg").scrollIntoView({ block: "center", behavior: "smooth" }); }
function runTrip(e) {
  if (e) e.preventDefault();
  loadPlaces().then(() => {
    const A = resolvePlace($("#tFrom")), B = resolvePlace($("#tTo"));
    if (!$("#tFrom").value.trim()) return tripErr("Step 1 is empty. Type the town you are starting from, or press <b>Use where I am now</b>.");
    if (!$("#tTo").value.trim()) return tripErr("Step 2 is empty. Type the town you are going to.");
    if (!A) return tripErr("We couldn't find the town in step 1. Start typing it again and pick it from the list that pops up.");
    if (!B) return tripErr("We couldn't find the town in step 2. Start typing it again and pick it from the list that pops up.");
    const leave = $("#tLeave").value ? ymd($("#tLeave").value) : null, back = $("#tBack").value ? ymd($("#tBack").value) : null;
    if (leave != null && back != null && back < leave) return tripErr("The starting home date is before the leaving date. Please check step 3.");
    const radius = +$("#tMiles").value, total = hav(A.lat, A.lon, B.lat, B.lon);
    if (total < 15) return tripErr("Those two places are right next to each other. To find churches in one town, use <a href=\"#find\" data-mode=\"find\">Find a church</a>.");
    const road = total * ROAD, driveDays = Math.max(1, Math.ceil(road / PER_DAY));
    const arrive = leave != null ? leave + (driveDays - 1) * 864e5 : null;
    const stayEnd = back != null ? back : arrive != null ? arrive + 6 * 864e5 : null;
    const near = Math.max(radius, 40), way = [], there = [];
    for (const c of C) {
      if (!c.lat) continue;
      const dB = hav(c.lat, c.lon, B.lat, B.lon);
      if (dB <= near) { there.push({ c, dB }); continue; }
      if (hav(c.lat, c.lon, A.lat, A.lon) < 20) continue; // churches in the town you are leaving
      const g = along(A, B, c);
      if (g.at >= -radius * 0.5 && g.at <= total && g.off <= radius) way.push({ c, g });
    }
    way.sort((a, b) => a.g.at - b.g.at); there.sort((a, b) => a.dB - b.dB);
    const tripUrl = "https://www.google.com/maps/dir/?api=1&origin=" + A.lat + "," + A.lon + "&destination=" + B.lat + "," + B.lon + "&travelmode=driving";
    const destName = B.n.split(",")[0];
    $("#tripMsg").innerHTML = '<div class="tsum"><h3>' + esc(A.n === "your location" ? "Your location" : A.n) + " to " + esc(B.n) + "</h3><p>About " + (Math.round(road / 10) * 10).toLocaleString() + " miles of driving" + (driveDays > 1 ? ", or about " + driveDays + " days at " + PER_DAY + " miles a day" : "") + ". (This is an estimate. Your map app will be more exact.)</p>" +
      (leave != null ? "<p>Leaving " + esc(dLabel(leave)) + (back != null ? ". Starting home " + esc(dLabel(back)) : "") + ".</p>" : "") +
      (A.guessed || B.guessed ? "<p><b>Please check:</b> we picked " + esc(A.guessed ? A.n : B.n) + ". If that's the wrong town, retype it and choose from the list.</p>" : "") +
      '<div class="cacts">' + ext("", tripUrl, I.map, "Open my trip in Google Maps") + '<button type="button" class="act ghost" id="printTrip">' + I.print + "Print this list</button></div></div>";
    const stop = c => ext("stop", tripUrl + "&waypoints=" + c.lat + "," + c.lon, I.stop, "Add to my route");
    let h = '<h3 class="sec-h">Churches near ' + esc(destName) + ' <span class="cnt">' + there.length + "</span></h3>";
    h += there.length ? there.map(x => {
      const lines = arrive != null ? servicesBetween(x.c, arrive, stayEnd) : [];
      return '<article class="card tcard"><span class="mile">About ' + Math.max(1, Math.round(x.dB)) + " miles from " + esc(destName) + "</span><h4>" + esc(x.c.n) + '</h4><p class="where"><b>' + esc(place(x.c)) + "</b>" + (pastor(x.c) ? " · " + esc(pastor(x.c)) : "") + "</p>" +
        (arrive != null ? (lines.length ? '<p class="status">Services while you are there (local time):</p><ul class="when">' + lines.join("") + "</ul>" : '<p class="status">No services on the days you are there.</p>') : "") +
        '<dl class="info"><dt>Every week</dt><dd>' + svcList(x.c) + "</dd>" + (x.c.st ? "<dt>Address</dt><dd>" + esc(x.c.st) + "<br>" + esc(x.c.cl || place(x.c)) + "</dd>" : "") + "</dl>" + (x.c.nt ? '<p class="nt">' + esc(x.c.nt) + "</p>" : "") + acts(x.c) + "</article>";
    }).join("") : '<div class="empty-res">No churches in the directory within ' + near + " miles of " + esc(destName) + ". Look at the churches along the way below.</div>";
    h += '<h3 class="sec-h">Churches along the way <span class="cnt">' + way.length + "</span></h3>";
    h += way.length ? '<p class="hint">In the order you would reach them. "Off the route" is measured from a straight line between your two towns, so check the map before you turn off.</p>' + way.map(x => {
      const mile = Math.max(0, Math.round(x.g.at * ROAD));
      let lines = "";
      if (leave != null) {
        lines += passLines(x.c, leave + Math.min(driveDays - 1, Math.floor(mile / PER_DAY)) * 864e5, "Going, around");
        if (back != null) lines += passLines(x.c, back + Math.min(driveDays - 1, Math.floor(Math.max(0, road - mile) / PER_DAY)) * 864e5, "On the way home, around");
      }
      return '<article class="card tcard"><span class="mile">About mile ' + mile.toLocaleString() + " · " + Math.round(x.g.off) + " miles off the route</span><h4>" + esc(x.c.n) + '</h4><p class="where"><b>' + esc(place(x.c)) + "</b>" + (pastor(x.c) ? " · " + esc(pastor(x.c)) : "") + "</p>" +
        (lines ? '<ul class="when">' + lines + "</ul>" : "") + '<dl class="info"><dt>Every week</dt><dd>' + svcList(x.c) + "</dd>" + (x.c.st ? "<dt>Address</dt><dd>" + esc(x.c.st) + "<br>" + esc(x.c.cl || place(x.c)) + "</dd>" : "") + "</dl>" +
        (x.c.nt ? '<p class="nt">' + esc(x.c.nt) + "</p>" : "") + acts(x.c, { first: stop(x.c), noDir: true }) + "</article>";
    }).join("") : '<div class="empty-res">No churches within ' + radius + " miles of your route. Try a bigger distance in step 4.</div>";
    h += '<p class="fine">Call ahead to make sure of the service time before you go.</p>';
    $("#tripOut").innerHTML = h;
    store.set("trip", { f: [$("#tFrom").value, $("#tFrom").dataset.lat, $("#tFrom").dataset.lon], t: [$("#tTo").value, $("#tTo").dataset.lat, $("#tTo").dataset.lon], l: $("#tLeave").value, b: $("#tBack").value, m: $("#tMiles").value });
    if (e) $("#tripMsg").scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

/* ---------- modes (the phone's Back button moves between them) ---------- */
function setMode(m, push, quiet) {
  if (!["watch", "find", "trip"].includes(m)) m = "watch";
  mode = m;
  $$(".mode-row [data-mode]").forEach(a => a.dataset.mode === m ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  ["watch", "find", "trip"].forEach(k => $("#p-" + k).hidden = k !== m);
  if (push && location.hash !== "#" + m) history.pushState(null, "", "#" + m);
  else if (!push && location.hash !== "#" + m && !location.hash.startsWith("#c-")) history.replaceState(null, "", "#" + m);
  if (m === "watch") renderWatch(true);
  if (m === "find" && !quiet) renderFind();
  if (m === "trip") loadPlaces();
  measure();
}
function toPanelTop() {
  const p = $("#p-" + mode), top = p.getBoundingClientRect().top + scrollY - $("#modes").offsetHeight - 4;
  if (scrollY > top) scrollTo({ top });
}
function measure() {
  const mo = $("#modes"), r = mo.getBoundingClientRect();
  document.documentElement.style.setProperty("--modes-h", r.height + "px");
  mo.classList.toggle("stuck", r.top <= 0.5 && scrollY > 10);
  $("#toTop").hidden = scrollY < 1400;
}
let raf = 0; addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; measure(); }); }, { passive: true });
addEventListener("resize", measure, { passive: true });
addEventListener("popstate", () => { const h = location.hash.slice(1); if (h.startsWith("c-")) openChurch(h.slice(2)); else setMode(h || "watch"); });

/* ---------- events ---------- */
let qt;
$("#q").addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { nearOn = false; $("#nearBtn").setAttribute("aria-pressed", "false"); renderFind(); }, 200); });
$("#findForm").addEventListener("submit", e => { e.preventDefault(); clearTimeout(qt); nearOn = false; $("#nearBtn").setAttribute("aria-pressed", "false"); renderFind(); $("#q").blur(); $("#resultLine").scrollIntoView({ block: "start", behavior: "smooth" }); });
$("#qClear").addEventListener("click", () => { $("#q").value = ""; renderFind(); $("#q").focus(); });
$("#state").addEventListener("change", () => { nearOn = false; $("#nearBtn").setAttribute("aria-pressed", "false"); renderFind(); });
$("#nearBtn").addEventListener("click", () => {
  const b = $("#nearBtn"), lab = b.querySelector("span");
  if (nearOn) { nearOn = false; b.setAttribute("aria-pressed", "false"); renderFind(); return; }
  lab.textContent = "Finding where you are…";
  getPos(() => { nearOn = true; lab.textContent = "Churches near me"; b.setAttribute("aria-pressed", "true"); $("#q").value = ""; $("#state").value = ""; renderFind(); $("#resultLine").scrollIntoView({ block: "start", behavior: "smooth" }); },
    () => { lab.textContent = "Churches near me"; $("#resultLine").innerHTML = "<b>Your device didn't share where you are.</b> Type your town in the search box instead, and we'll show the closest churches."; $("#q").focus(); });
});
$("#mapBtn").addEventListener("click", () => { mapOn = !mapOn; $("#mapBtn").setAttribute("aria-pressed", String(mapOn)); $("#mapBtn span").textContent = mapOn ? "Hide map" : "Show map"; renderFind(); });
$("#streamBtn").addEventListener("click", () => { streamOnly = !streamOnly; $("#streamBtn").setAttribute("aria-pressed", String(streamOnly)); renderFind(); });
$("#upMore").addEventListener("click", () => { upDays = 8; renderWatch(true); });
$("#toTop").addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));
setupAC($("#tFrom"), $("#acFrom"));
setupAC($("#tTo"), $("#acTo"));
$("#tHere").addEventListener("click", () => {
  const b = $("#tHere"), was = b.innerHTML;
  b.lastChild.textContent = "Finding where you are…";
  getPos(p => { const f = $("#tFrom"); f.value = "My location"; f.dataset.lat = p[0]; f.dataset.lon = p[1]; f.dataset.name = "your location"; b.innerHTML = was; },
    () => { b.innerHTML = was; tripErr("Your device didn't share where you are. Type your town in step 1 instead."); });
});
$("#tripForm").addEventListener("submit", runTrip);
document.addEventListener("click", e => {
  const z = e.target.closest(".tsz button"); if (z) { setZoom(+z.dataset.z); return; }
  const mb = e.target.closest("[data-mode]");
  if (mb) { e.preventDefault(); setMode(mb.dataset.mode, true); toPanelTop(); return; }
  const sb = e.target.closest("[data-state]"); if (sb) { $("#state").value = sb.dataset.state; renderFind(); $("#resultLine").scrollIntoView({ block: "start" }); return; }
  if (e.target.closest("[data-reset]")) { resetFind(); renderFind(); $("#q").focus({ preventScroll: true }); toPanelTop(); return; }
  if (e.target.closest("#printTrip")) { print(); return; }
  const d = e.target.closest("#dots circle"); if (d) { openChurch(d.dataset.id); return; }
});
document.addEventListener("keydown", e => { const d = e.target.closest && e.target.closest("#dots circle"); if (d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openChurch(d.dataset.id); } });

/* ---------- start ---------- */
const z0 = store.get("tsz"); if (z0 && z0 !== 1) setZoom(z0);
if (tzLabel) $("#tzName").textContent = " (" + tzLabel + ")";
fetch("/data/churches.json").then(r => r.json()).then(data => {
  C = data;
  C.forEach(c => c._s = norm([c.n, c.c, c.s, c.sn, country(c), c.p.join(" "), c.cl, c.st, c.al || ""].join(" ")));
  $("#lsCount").textContent = C.filter(c => c.ls).length;
  const keys = [...new Set(C.map(groupKey))], us = keys.filter(k => C.some(c => c.s === k)).sort((a, b) => stateName(a).localeCompare(stateName(b))), intl = keys.filter(k => !us.includes(k)).sort();
  $("#state").innerHTML = '<option value="">All states and countries</option><optgroup label="United States">' + us.map(k => '<option value="' + esc(k) + '">' + esc(stateName(k)) + "</option>").join("") + '</optgroup><optgroup label="Other countries">' + intl.map(k => '<option value="' + esc(k) + '">' + esc(COUNTRY[k] || k) + "</option>").join("") + "</optgroup>";
  const saved = store.get("trip");
  if (saved) {
    [["#tFrom", saved.f], ["#tTo", saved.t]].forEach(([s, v]) => { if (v && v[0]) { $(s).value = v[0]; if (v[1]) { $(s).dataset.lat = v[1]; $(s).dataset.lon = v[2]; $(s).dataset.name = v[0] === "My location" ? "your location" : v[0]; } } });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const iso = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    $("#tLeave").value = saved.l && saved.l >= iso ? saved.l : ""; $("#tBack").value = saved.b && saved.b >= iso ? saved.b : ""; $("#tMiles").value = saved.m || "50";
  }
  const h = location.hash.slice(1);
  if (h.startsWith("c-")) openChurch(h.slice(2));
  else setMode(h || "watch");
  if (mode === "trip" && saved && saved.t && saved.t[0]) runTrip();
  setInterval(() => { if (!document.hidden && mode === "watch") renderWatch(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && mode === "watch") renderWatch(); });
}).catch(() => { $("#liveList").innerHTML = '<div class="empty-res">The church list did not load. Please refresh the page.</div>'; });
})();
