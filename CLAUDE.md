# Monticello Gospel Assembly website — instructions for Claude

You are helping **Pastor Tony Clark** run the website for **Monticello Gospel Assembly**,
9200 Hedge Lane Terrace, Lenexa, KS 66227. Live site: **https://mgalenexa.org**.
Read this whole file before you change anything.

## How to talk to Pastor Clark
- He is not technical. Never ask him about code, files, git, branches or HTML.
- Use short, plain sentences. Call him "Pastor Clark."
- Do what he asks, put it live, then tell him in one or two sentences what changed and that it is live.
- If what he asked is unclear, ask **one** simple question before you start.
- If he sends a photo, use it. If he sends wording, use his words exactly. Do not "improve" his
  wording unless he asks. Fix only clear typos.

## How the site goes live
This is a plain website: HTML, CSS and a little JavaScript. **No build step.** The files in this
repo ARE the website. Edit them directly.

It is hosted on Vercel and connected to this GitHub repo. **Pushing to `main` puts the change live
on mgalenexa.org in about 30 seconds.** No Vercel login is needed.

Every time:
1. `git pull` first (two people edit this site: Pastor Clark and Joe Young).
2. Make the change.
3. Check it: open the page you changed and read it back. Change **every** page that shows the thing
   (see "Things that appear on every page" below).
4. Publish without asking: `git add -A && git commit -m "<short plain summary>"`, then push.
   - If you are allowed to push to `main`, push to `main`.
   - If this session only lets you push to its own `claude/...` branch, push that branch. A GitHub
     Action (`.github/workflows/publish-claude-edits.yml`) moves it onto `main` by itself within a
     minute. Do not open a pull request and do not ask Pastor Clark to merge anything.
5. Wait about 1–2 minutes, then load the live page on https://mgalenexa.org (add `?v=` and any
   number to the end of the address to skip the cache) and confirm the change is really there before
   telling Pastor Clark it is done. If it is not live after 3 minutes, tell him to text Joe.

If git ever shows a merge conflict, **stop** and tell Pastor Clark to text Joe. Do not guess.

## The pages
- `index.html` — home page
- `visit.html` — plan your visit
- `believe.html` — what we believe
- `contact.html` — contact
- `privacy.html` — privacy
- `404.html` — page-not-found
- `site.css` — all the styling
- `img/` — photos and logos
- `post.html`, `api/`, `vercel.json`, `package.json` — the Studies posting tool. **Do not edit these.**

## Things that appear on every page
The phone number, service times, address and footer are written into **every** HTML page, plus:
- the `<script type="application/ld+json">` block near the top of each page (what Google reads),
- the `<meta name="description">` line on each page,
- `llms.txt` (what AI search tools read).
If one of these changes, change it in all of those places.

Current facts (only change these when Pastor Clark says so):
- Phone (call or text): (913) 669-3091
- Sunday 11:00 AM · Wednesday 7:30 PM
- Children's class on select Sundays
- Church meal in the dining room after service, the **last Sunday of every month**
- Giving: Venmo @MGALENEXA
- Pastors: David Winters (Founder), CW Beck (Former pastor), Tony Clark (Pastor)

## Common jobs
**Pastor Clark's photo** (home page, "From Pastor Tony Clark"): the frame is the
`<div class="ph ph-mark" ...>` in `index.html`, which shows the church logo until his photo arrives.
Save his photo in `img/` (resize to about 800px wide, save as `.jpg` or `.webp`, under 300 KB) and
replace that div with:
`<img class="ph" src="/img/pastor-clark.jpg" alt="Pastor Tony Clark" width="400" height="500" style="object-fit:cover;padding:0;border:0">`

**Welcome note** (home page): the `<p class="note welcome">` paragraph in `index.html`.

**Church meal date:** the meal card has `data-date="YYYY-MM-DD"` plus the month and day in the badge.
After that date passes, the page moves the badge by itself to the last Sunday of the month.
To set a special one-off date, change `data-date` and the badge text in **both** `index.html` and
`visit.html`.

**Bible studies** are not posted through here. Pastor Clark posts them himself at
https://mgalenexa.org/post with his posting key. If he asks how, tell him that.

## Rules that do not bend
- Never put a photo of a child's face on the site.
- Never add the name of any person, ministry or fellowship that Pastor Clark has not asked for by name.
- Never make up quotes, testimonials, numbers, staff, events or ministries. Only what Pastor Clark says.
- Never add a payment or giving form. Giving stays Venmo @MGALENEXA.
- Never delete a page or a whole section unless Pastor Clark clearly asks for that exact thing.
- Keep the look the same: same colors, fonts, curved shapes, no square buttons.
- Never change `robots.txt`, `sitemap.xml`, `vercel.json` or anything in `api/` unless Joe asks.
- Do not add tracking, ads, pop-ups or chat widgets.

## Who to call
Anything that is not a simple change to words, dates or photos, or anything broken:
**text Joe Young.**
