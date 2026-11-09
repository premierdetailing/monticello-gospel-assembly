/* Churches & live streams: Watch live (default), Find a church, Plan a trip.
   Data: /data/churches.json, /data/us-map.json (map tab), /data/places.json (trip tab, US + Canada towns). */
(() => {
"use strict";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], DSH = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LIVE_MS = 2 * 3600e3, HOME = "monticello-gospel-assembly";
const VTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
let C = [], mode = "watch", pos = null, openId = null, nearOn = false, mapOn = false, streamOnly = false, upDays = 3;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

/* ---------- time ---------- */
const fmtCache = {};
function partsIn(tz, d) {
  const f = fmtCache[tz] ||= new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23", weekday: "short" });
  const o = {}; f.formatToParts(d).forEach(p => o[p.type] = p.value);
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, wd: DSH.indexOf(o.weekday) };
}
function nextStart(tz, day, hhmm, now) {
  const p = partsIn(tz, now), off = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(now / 1000) * 1000;
  const [h, mi] = hhmm.split(":").map(Number);
  let next = Date.UTC(p.y, p.m - 1, p.d, h, mi) - off + ((day - p.wd + 7) % 7) * 864e5;
  if (next <= now) next += 7 * 864e5;
  return { last: next - 7 * 864e5, next };
}
const t12 = hhmm => { const [h, m] = hhmm.split(":").map(Number); return (h % 12 || 12) + (m ? ":" + String(m).padStart(2, "0") : "") + " " + (h < 12 ? "AM" : "PM"); };
const yourTime = ms => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayKey = ms => new Date(ms).toDateString();
function dayLabel(ms) {
  const k = dayKey(ms);
  if (k === dayKey(Date.now())) return "Today";
  if (k === dayKey(Date.now() + 864e5)) return "Tomorrow";
  return new Date(ms).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}
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

/* ---------- shared bits ---------- */
const place = c => c.co === "US" ? c.c + ", " + c.s : c.c + ", " + c.co;
const pastor = c => c.p[0] ? c.p[0].replace(/,?\s*(Senior\s+)?Pastor$/i, "") : "";
const watchName = u => /youtube|youtu\.be/.test(u) ? "YouTube" : /facebook/.test(u) ? "Facebook" : /boxcast/.test(u) ? "BoxCast" : "Watch";
const dirUrl = c => c.lat ? "https://www.google.com/maps/dir/?api=1&destination=" + c.lat + "," + c.lon : c.st ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(c.st + " " + c.cl) : "";
const telFmt = d => d.length === 10 ? "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6) : d;
const I = {
  play: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'
};
function acts(c, extra) {
  const a = [];
  if (extra) a.push(extra);
  if (c.ls) a.push('<a class="sbtn watch" href="' + esc(c.ls) + '" target="_blank" rel="noopener">' + I.play + "Watch on " + watchName(c.ls) + "</a>");
  if (c.ph) a.push('<a class="sbtn" href="tel:+1' + esc(c.ph) + '">' + I.phone + telFmt(c.ph) + "</a>");
  if (!extra && dirUrl(c)) a.push('<a class="sbtn" href="' + esc(dirUrl(c)) + '" target="_blank" rel="noopener">' + I.pin + "Directions</a>");
  if (!c.ls && c.fb) a.push('<a class="sbtn" href="' + esc(c.fb) + '" target="_blank" rel="noopener">' + I.play + "Facebook</a>");
  if (c.w) a.push('<a class="sbtn" href="' + esc(c.w) + '" target="_blank" rel="noopener">' + I.web + "Website</a>");
  return '<div class="cacts">' + a.join("") + "</div>";
}
const weekly = c => { const by = {}; c.sv.forEach(([d, t]) => (by[d] ||= []).push(t12(t))); return [0, 1, 2, 3, 4, 5, 6].filter(d => by[d]).map(d => DSH[d] + " " + by[d].join(" & ")); };

/* ---------- WATCH ---------- */
function renderWatch() {
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
  const sRow = (x, on) => '<a class="srow' + (on ? " on" : "") + '" href="' + esc(x.c.ls) + '" target="_blank" rel="noopener"><span class="tm">' + (on ? "LIVE<small>since " + esc(yourTime(x.at)) + "</small>" : esc(yourTime(x.at)) + (x.c.tz !== VTZ ? "<small>" + esc(t12(x.t)) + " there</small>" : "")) +
    '</span><span class="who"><b>' + esc(x.c.n) + "</b><span>" + esc(place(x.c)) + (pastor(x.c) ? " · " + esc(pastor(x.c)) : "") + '</span></span><span class="go">' + I.play + (on ? "Watch now" : watchName(x.c.ls)) + "</span></a>";
  $("#liveN").textContent = live.length;
  $("#liveSub").textContent = live.length ? live.length + " streaming now" : "Streams now and coming up";
  $("#liveList").innerHTML = live.length ? '<div class="srows">' + live.map(x => sRow(x, true)).join("") + "</div>"
    : '<div class="empty-res">No streams are on right now. ' + (up[0] ? "The next one starts " + esc(/^(Today|Tomorrow)$/.test(dayLabel(up[0].at)) ? dayLabel(up[0].at).toLowerCase() : "on " + dayLabel(up[0].at)) + " at " + esc(yourTime(up[0].at)) + "." : "") + "</div>";
  const days = [];
  up.forEach(x => { const k = dayKey(x.at); let g = days.find(d => d.k === k); if (!g) days.push(g = { k, at: x.at, items: [] }); g.items.push(x); });
  $("#upList").innerHTML = days.slice(0, upDays).map(g => '<h3 class="day-h">' + esc(dayLabel(g.at)) + '</h3><div class="srows">' + g.items.map(x => sRow(x, false)).join("") + "</div>").join("");
  $("#upMore").hidden = upDays >= days.length;
}
$("#upMore").addEventListener("click", () => { upDays = 8; renderWatch(); });

/* ---------- FIND ---------- */
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
const R = 3958.8, rad = Math.PI / 180;
function hav(a, b, c, d) { const x = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }
const miles = c => pos && c.lat ? Math.round(hav(pos[0], pos[1], c.lat, c.lon)) : null;
const groupName = c => c.co === "US" ? c.sn : c.co;
function svcTable(c) {
  const by = {}; c.sv.forEach(([d, t]) => (by[d] ||= []).push(t12(t)));
  const rows = [0, 1, 2, 3, 4, 5, 6].filter(d => by[d]).map(d => "<b>" + DAY[d] + "</b><span>" + by[d].join(" &amp; ") + "</span>").join("");
  const extra = c.svt.filter(l => /\d(st|nd|rd|th)|youth|bible study|school|creole|spanish|english|children/i.test(l)).map(l => "<i>" + esc(l) + "</i>").join("");
  return rows || extra ? '<div class="svc">' + rows + extra + "</div>" : '<p class="sm">Call for service times.</p>';
}
function row(c, now) {
  const st = status(c, now), home = c.id.includes(HOME);
  let nx;
  if (st.live) nx = '<span class="lv">● In service</span><small>since ' + esc(t12(st.live.t)) + "</small>";
  else if (st.next) nx = esc(DSH[st.next.d]) + " " + esc(t12(st.next.t)) + (c.tz && c.tz !== VTZ ? "<small>" + esc(yourTime(st.next.at)) + " your time</small>" : "");
  else nx = "<small>Call for times</small>";
  const m = miles(c);
  const meta = [esc(place(c)), esc(pastor(c)), m != null ? m + " mi away" : "", c.ls ? "Streams online" : ""].filter(Boolean).join(" · ");
  return '<li class="ch' + (home ? " home" : "") + (openId === c.id ? " open" : "") + '" id="c-' + esc(c.id) + '"><button type="button" aria-expanded="' + (openId === c.id) + '"><span class="nm">' + esc(c.n) + (home ? '<span class="tagh">Our church</span>' : "") + '</span><span class="nx">' + nx + '</span><span class="meta">' + meta + "</span></button>" +
    '<div class="det">' + svcTable(c) + (c.p.length ? '<div class="ln">' + c.p.map(esc).join("<br>") + "</div>" : "") + (c.st ? '<div class="sm">' + esc(c.st) + (c.cl ? ", " + esc(c.cl) : "") + "</div>" : "") + (c.nt ? '<div class="sm">' + esc(c.nt) + "</div>" : "") + acts(c) + "</div></li>";
}
function base() {
  const q = norm($("#q").value).trim().split(/\s+/).filter(Boolean), st = $("#state").value;
  return C.filter(c => (!st || (c.s || c.co) === st) && (!streamOnly || c.ls) && q.every(w => c._s.includes(w)));
}
function renderFind() {
  const now = Date.now(), list = base();
  let html = "";
  $("#mapWrap").hidden = !mapOn;
  $("#jump").hidden = nearOn || !!$("#state").value || !!$("#q").value.trim();
  if (nearOn && pos) {
    const near = list.filter(c => c.lat).sort((a, b) => miles(a) - miles(b)).slice(0, 40);
    $("#resultLine").textContent = "The " + near.length + " closest churches to you";
    html = '<ul class="rows">' + near.map(c => row(c, now)).join("") + "</ul>";
  } else {
    $("#resultLine").textContent = list.length === C.length ? C.length + " churches" : list.length + (list.length === 1 ? " church" : " churches");
    if (!list.length) html = '<div class="empty-res">No church matches that. Try a city name, or choose All places.</div>';
    const groups = new Map();
    list.forEach(c => { const g = groupName(c); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); });
    for (const [g, cs] of groups) html += '<h2 class="grp-h" id="g-' + esc(norm(g).replace(/ /g, "-")) + '">' + esc(g) + " <small>" + cs.length + '</small></h2><ul class="rows">' + cs.map(c => row(c, now)).join("") + "</ul>";
  }
  $("#results").innerHTML = html;
  if (mapOn) { drawMap(); dim(new Set(list.map(c => c.id))); }
  measure();
}
function buildJump() {
  const seen = []; C.forEach(c => { const g = groupName(c); if (!seen.includes(g)) seen.push(g); });
  const abbr = g => (C.find(c => groupName(c) === g && c.co === "US") || {}).s || g;
  $("#jump").innerHTML = seen.map(g => '<a href="#g-' + esc(norm(g).replace(/ /g, "-")) + '" title="' + esc(g) + '">' + esc(abbr(g)) + "</a>").join("");
}
function getPos(cb, fail) {
  if (pos) return cb(pos);
  if (!navigator.geolocation) return fail && fail();
  navigator.geolocation.getCurrentPosition(p => { pos = [p.coords.latitude, p.coords.longitude]; cb(pos); }, () => fail && fail(), { timeout: 10000, maximumAge: 600000 });
}
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
  setMode("find", true); openId = id;
  if (!document.getElementById("c-" + id) || nearOn) { $("#q").value = ""; $("#state").value = ""; nearOn = false; streamOnly = false; $("#nearBtn").setAttribute("aria-pressed", "false"); $("#streamBtn").setAttribute("aria-pressed", "false"); }
  renderFind();
  const el = document.getElementById("c-" + id);
  if (el) { el.scrollIntoView({ block: "start" }); el.classList.add("flash"); }
}

/* ---------- TRIP ---------- */
let P = null, pPromise = null;
const loadPlaces = () => pPromise ||= fetch("/data/places.json").then(r => r.json()).then(d => (P = d.map(x => ({ n: x[0], s: x[1], lat: x[2], lon: x[3], k: norm(x[0]) }))));
function matches(text, max = 8) {
  if (!P) return [];
  const m = norm(text).trim().replace(/\s+/g, " "); if (!m) return [];
  const parts = text.split(",");
  const name = norm(parts[0]).trim(), st = (parts[1] || "").trim().toUpperCase().slice(0, 2);
  let list = P.filter(p => p.k.startsWith(name) && (!st || p.s.startsWith(st)));
  const churchState = new Set(C.map(c => c.s));
  list.sort((a, b) => (a.k === name ? 0 : 1) - (b.k === name ? 0 : 1) || (churchState.has(b.s) ? 1 : 0) - (churchState.has(a.s) ? 1 : 0) || a.k.length - b.k.length);
  return list.slice(0, max);
}
function resolvePlace(inp) {
  if (inp.dataset.lat) return { n: inp.dataset.name, lat: +inp.dataset.lat, lon: +inp.dataset.lon };
  const m = matches(inp.value, 1)[0];
  return m ? { n: m.n + ", " + m.s, lat: m.lat, lon: m.lon, guessed: true } : null;
}
function setupAC(inp, list) {
  let items = [], idx = -1;
  const close = () => { list.hidden = true; idx = -1; };
  const pick = p => { inp.value = p.n + ", " + p.s; inp.dataset.lat = p.lat; inp.dataset.lon = p.lon; inp.dataset.name = p.n + ", " + p.s; close(); };
  inp.addEventListener("focus", loadPlaces);
  inp.addEventListener("input", () => {
    delete inp.dataset.lat;
    loadPlaces().then(() => {
      items = matches(inp.value);
      list.innerHTML = items.map((p, i) => '<li role="option" data-i="' + i + '">' + esc(p.n) + "<small>" + esc(p.s) + "</small></li>").join("");
      list.hidden = !items.length || !inp.value.trim(); idx = -1;
    });
  });
  inp.addEventListener("keydown", e => {
    if (list.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; $$("#" + list.id + " li").forEach((li, i) => li.setAttribute("aria-selected", i === idx)); }
    else if (e.key === "Enter" && idx > -1) { e.preventDefault(); pick(items[idx]); }
    else if (e.key === "Escape") close();
  });
  list.addEventListener("mousedown", e => { const li = e.target.closest("li"); if (li) { e.preventDefault(); pick(items[+li.dataset.i]); } });
  inp.addEventListener("blur", () => setTimeout(close, 150));
}
setupAC($("#tFrom"), $("#acFrom"));
setupAC($("#tTo"), $("#acTo"));
$("#tHere").addEventListener("click", () => {
  const b = $("#tHere"); b.textContent = "Finding you…";
  getPos(p => { const f = $("#tFrom"); f.value = "My location"; f.dataset.lat = p[0]; f.dataset.lon = p[1]; f.dataset.name = "your location"; b.textContent = "Use my location"; },
    () => { b.textContent = "Location is off. Type a town instead."; });
});
function bearing(a, b, c, d) { const y = Math.sin((d - b) * rad) * Math.cos(c * rad), x = Math.cos(a * rad) * Math.sin(c * rad) - Math.sin(a * rad) * Math.cos(c * rad) * Math.cos((d - b) * rad); return Math.atan2(y, x); }
function along(A, B, P2) { // miles along A→B, miles off the line
  const d13 = hav(A.lat, A.lon, P2.lat, P2.lon) / R, t13 = bearing(A.lat, A.lon, P2.lat, P2.lon), t12 = bearing(A.lat, A.lon, B.lat, B.lon);
  const xt = Math.asin(Math.sin(d13) * Math.sin(t13 - t12));
  let at = Math.acos(Math.max(-1, Math.min(1, Math.cos(d13) / Math.cos(xt)))) * R;
  if (Math.cos(t13 - t12) < 0) at = -at;
  return { at, off: Math.abs(xt * R) };
}
const ymd = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const dLabel = ms => { const d = new Date(ms); return DSH[d.getUTCDay()] + " " + MON[d.getUTCMonth()] + " " + d.getUTCDate(); };
function serviceChips(c, from, to, hitDay) {
  if (!from) return weekly(c).map(w => "<span>" + esc(w) + "</span>").join("") || "<span>Call for times</span>";
  const out = [];
  for (let t = from; t <= to && out.length < 8; t += 864e5) {
    const wd = new Date(t).getUTCDay();
    c.sv.filter(s => s[0] === wd && !s[2]).forEach(s => out.push('<span' + (hitDay != null && t === hitDay ? ' class="hit"' : "") + ">" + esc(dLabel(t)) + " · " + esc(t12(s[1])) + "</span>"));
  }
  return out.join("") || "<span>No services on your travel days</span>";
}
function runTrip(e) {
  if (e) e.preventDefault();
  loadPlaces().then(() => {
    const A = resolvePlace($("#tFrom")), B = resolvePlace($("#tTo")), msg = $("#tripMsg");
    if (!A || !B) { msg.innerHTML = "I couldn't find " + (!A ? "your starting town" : "where you're going") + ". Start typing and pick it from the list."; $("#tripOut").innerHTML = ""; return; }
    const radius = +$("#tMiles").value, total = hav(A.lat, A.lon, B.lat, B.lon);
    const leave = $("#tLeave").value ? ymd($("#tLeave").value) : null;
    const back = $("#tBack").value ? ymd($("#tBack").value) : null;
    const driveDays = Math.max(1, Math.ceil(total * 1.2 / 600)); // about 600 road miles a day
    const arrive = leave != null ? leave + (driveDays - 1) * 864e5 : null;
    const stayEnd = back != null ? back : arrive != null ? arrive + 6 * 864e5 : null;
    const way = [], there = [];
    for (const c of C) {
      if (!c.lat) continue;
      const dB = hav(c.lat, c.lon, B.lat, B.lon);
      if (dB <= Math.max(radius, 40)) { there.push({ c, dB }); continue; }
      const g = along(A, B, c);
      if (g.at >= -radius * 0.5 && g.at <= total && g.off <= radius) way.push({ c, g });
    }
    way.sort((a, b) => a.g.at - b.g.at); there.sort((a, b) => a.dB - b.dB);
    const tripUrl = "https://www.google.com/maps/dir/?api=1&origin=" + A.lat + "," + A.lon + "&destination=" + B.lat + "," + B.lon;
    msg.innerHTML = "<b>" + esc(A.n) + " → " + esc(B.n) + "</b> · about " + Math.round(total * 1.2).toLocaleString() + " road miles" + (A.guessed || B.guessed ? " (check the towns are right)" : "") + ' · <a href="' + tripUrl + '" target="_blank" rel="noopener">Open in Google Maps</a>';
    const stop = c => '<a class="sbtn stop" href="' + tripUrl + "&waypoints=" + c.lat + "," + c.lon + '" target="_blank" rel="noopener">' + I.stop + "Add as a stop</a>";
    const tRow = (c, left, sub, chips) => '<article class="trow2"><span class="mile">' + left + "<small>" + sub + '</small></span><div><h3>' + esc(c.n) + '</h3><div class="meta">' + esc(place(c)) + (pastor(c) ? " · " + esc(pastor(c)) : "") + '</div><div class="when">' + chips + "</div>" + acts(c, stop(c)) + "</div></article>";
    let h = '<h2 class="pnl-h">At ' + esc(B.n.split(",")[0]) + ' <span class="cnt">' + there.length + "</span></h2>";
    h += there.length ? there.map(x => tRow(x.c, Math.round(x.dB) + " mi", "from there", serviceChips(x.c, arrive, stayEnd, null))).join("") : '<div class="empty-res">No churches in the directory within ' + Math.max(radius, 40) + " miles of " + esc(B.n) + ". Look along the way below.</div>";
    h += '<h2 class="pnl-h">Along the way <span class="cnt">' + way.length + "</span></h2>";
    h += way.length ? way.map(x => { const day = leave != null ? leave + Math.min(driveDays - 1, Math.floor(Math.max(0, x.g.at) * 1.2 / 600)) * 864e5 : null; return tRow(x.c, "Mile " + Math.max(0, Math.round(x.g.at * 1.2)), Math.round(x.g.off) + " mi off", serviceChips(x.c, leave, arrive, day)); }).join("")
      : '<div class="empty-res">No churches within ' + radius + " miles of your route. Try a wider distance.</div>";
    $("#tripOut").innerHTML = h;
    store.set("trip", { f: [$("#tFrom").value, $("#tFrom").dataset.lat, $("#tFrom").dataset.lon], t: [$("#tTo").value, $("#tTo").dataset.lat, $("#tTo").dataset.lon], l: $("#tLeave").value, b: $("#tBack").value, m: $("#tMiles").value });
    if (e) $("#tripMsg").scrollIntoView({ block: "start", behavior: "smooth" });
  });
}
$("#tripForm").addEventListener("submit", runTrip);

/* ---------- modes & layout ---------- */
function setMode(m, quiet) {
  mode = m;
  $$(".mode-row [data-mode]").forEach(b => b.setAttribute("aria-selected", b.dataset.mode === m));
  ["watch", "find", "trip"].forEach(k => $("#p-" + k).hidden = k !== m);
  if (location.hash !== "#" + m && !location.hash.startsWith("#c-")) history.replaceState(null, "", "#" + m);
  if (m === "watch") renderWatch();
  if (m === "find" && !quiet) renderFind();
  if (m === "trip") loadPlaces();
  measure();
}
function measure() {
  const mo = $("#modes"), b = $("#bar");
  document.documentElement.style.setProperty("--modes-h", mo.getBoundingClientRect().height + "px");
  if (b && !b.closest("[hidden]")) document.documentElement.style.setProperty("--bar-h", b.getBoundingClientRect().height + "px");
  mo.classList.toggle("stuck", mo.getBoundingClientRect().top <= 0.5 && scrollY > 10);
}
let raf = 0; addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; measure(); }); }, { passive: true });
addEventListener("resize", measure, { passive: true });

/* ---------- events ---------- */
let qt;
$("#q").addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { nearOn = false; $("#nearBtn").setAttribute("aria-pressed", "false"); renderFind(); }, 120); });
$("#q").addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); });
$("#state").addEventListener("change", () => { nearOn = false; $("#nearBtn").setAttribute("aria-pressed", "false"); renderFind(); });
$("#nearBtn").addEventListener("click", () => {
  const b = $("#nearBtn");
  if (nearOn) { nearOn = false; b.setAttribute("aria-pressed", "false"); renderFind(); return; }
  b.textContent = "Finding you…";
  getPos(() => { nearOn = true; b.textContent = "Near me"; b.setAttribute("aria-pressed", "true"); $("#q").value = ""; $("#state").value = ""; renderFind(); },
    () => { b.textContent = "Location is off"; setTimeout(() => b.textContent = "Near me", 2500); });
});
$("#mapBtn").addEventListener("click", () => { mapOn = !mapOn; $("#mapBtn").setAttribute("aria-pressed", mapOn); renderFind(); });
$("#streamBtn").addEventListener("click", () => { streamOnly = !streamOnly; $("#streamBtn").setAttribute("aria-pressed", streamOnly); renderFind(); });
document.addEventListener("click", e => {
  const mb = e.target.closest(".mode-row [data-mode]");
  if (mb) { setMode(mb.dataset.mode); const top = $("#modes").offsetTop; if (scrollY > top) scrollTo({ top }); return; }
  const b = e.target.closest(".ch > button");
  if (b) { const li = b.parentElement, o = !li.classList.contains("open"); $$(".ch.open").forEach(x => { x.classList.remove("open"); x.firstElementChild.setAttribute("aria-expanded", "false"); }); if (o) { li.classList.add("open"); b.setAttribute("aria-expanded", "true"); } openId = o ? li.id.slice(2) : null; return; }
  const d = e.target.closest("#dots circle"); if (d) { openChurch(d.dataset.id); return; }
  const j = e.target.closest(".jump a"); if (j) { e.preventDefault(); const g = document.getElementById(j.getAttribute("href").slice(1)); if (g) g.scrollIntoView({ block: "start" }); }
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
  buildJump();
  const saved = store.get("trip");
  if (saved) { [["#tFrom", saved.f], ["#tTo", saved.t]].forEach(([s, v]) => { if (v && v[0]) { $(s).value = v[0]; if (v[1]) { $(s).dataset.lat = v[1]; $(s).dataset.lon = v[2]; $(s).dataset.name = v[0]; } } }); $("#tLeave").value = saved.l || ""; $("#tBack").value = saved.b || ""; $("#tMiles").value = saved.m || "50"; }
  const h = location.hash.slice(1);
  if (h.startsWith("c-")) openChurch(h.slice(2));
  else setMode(["watch", "find", "trip"].includes(h) ? h : "watch");
  if (mode === "trip" && saved && saved.t && saved.t[0]) runTrip();
  setInterval(() => { if (document.hidden) return; if (mode === "watch") renderWatch(); }, 60000);
}).catch(() => { $("#liveList").innerHTML = '<div class="empty-res">The church list did not load. Refresh the page to try again.</div>'; });
})();
