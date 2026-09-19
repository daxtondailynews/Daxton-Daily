# Daily Newspaper — Phase 1 + 2 (Customization, Rendering, Accounts, Daily Email)

A personalized daily-newspaper product. Phase 1 covers the reader-facing
customization flow and the personalized rendering of a shared day's content,
plus a lightweight archive of past editions. Phase 2 adds optional accounts
(so a reader's paper syncs across devices), a magic-link daily email with
today's top story, and one-click unsubscribe. **Still no payments, and no
real content-generation pipeline** — everything here runs against a static
mock content file (see "What's deliberately out of scope" below).

## How it works

- Every day, one shared **edition** is produced: one canonical **top story**
  (shown to every reader regardless of their topics), a **topic section** for
  each of the 10 fixed topics (2-3 short stories per section, matching how a
  real newspaper section usually has several short items rather than one long
  one), and a separate set of **local-news blurbs**, one per supported city.
  There is never a different version of a story per reader — only the
  *selection* of which sections and which day appear is personalized.
- Login is still optional. A reader's preferences (name, topics, local city)
  are captured by a simple onboarding form and persisted, in order of
  precedence:
  1. A **magic-link token** in the URL (`?magic=...`, see below) — only
     present when arriving from the daily email.
  2. **URL query string**, e.g. `read.html?name=Uri&topics=politics,tech-ai,global-affairs&city=dallas`
  3. **`localStorage`**, so returning without the URL still shows the same paper.

  If neither a magic link nor the query string is present, `localStorage`
  is used; if none of the three are present, the reader is sent back to the
  customize page. Creating an account (see below) layers account sync on
  top of this — it doesn't replace it, so the site works exactly the same
  with no account at all.
- `read.html` has two views, switched by a **`date`** query parameter:
  - **No `date` param** — the **archive view**: today's edition is featured
    full-width at the top with a "Read today's edition" link, followed by a
    grid of tiles for every past edition. Each tile links to
    `read.html?...&date=YYYY-MM-DD` for that day, carrying the reader's saved
    name/topics/city along with it.
  - **`date=YYYY-MM-DD` present** — the **single-edition view** for that
    specific day: the top story, then each of the reader's selected topics'
    2-3 stories, then their local block if applicable, filtered exactly the
    way the old single-day view worked. Includes a "← All editions" link back
    to the archive and a **Print this edition** button.
  - `customize.js` always redirects to `read.html` with no `date` param after
    submit, so a reader lands on the archive view first and picks a day from
    there (including "today").

## Running it locally

No build step, no server required — everything is plain HTML/CSS/JS and each
day's content is loaded as a `<script>` tag (not `fetch()`), specifically so
the site works by just double-clicking `index.html`, with no CORS issues from
the `file://` protocol.

1. Open `index.html` in a browser (double-click it, or drag it in).
2. Fill out the form and click **Build My Paper**.
3. You land on `read.html?...` showing the archive view — click **Read
   today's edition** or any past-edition tile.

If you'd rather serve it over http (e.g. to test sharing links across
devices), a zero-dependency PowerShell static server is included:

```powershell
powershell -ExecutionPolicy Bypass -File dev-server.ps1
```

Then visit `http://localhost:5500/index.html`. (If you have Node or Python
installed, `npx serve .` or `python -m http.server` work too — the
PowerShell script is just there so this runs with nothing extra installed.)

## Project structure

```
index.html                        Onboarding / customize page + account panel (login, sign up, settings)
read.html                          Rendering page: archive view + single-edition view + magic-link entry
unsubscribe.html                   One-click unsubscribe page (no login required)
css/styles.css                     Shared newspaper styling, incl. print stylesheet
js/topics.js                       Fixed list of the 10 topics (source of truth)
js/cities.js                       Fixed list of the 45 supported cities + which have demo content
js/prefs.js                        Reads/writes name/topics/city (URL query string <-> localStorage)
js/masthead.js                      First-initial -> word map and getMastheadTitle()
js/customize.js                    Onboarding page logic (form rendering, validation, submit, account sync hook)
js/render.js                        Rendering page logic: archive view, single-edition view, date routing, magic-link resolution
js/supabase-config.js              Supabase project URL + anon key (fill in after setup — see below)
js/auth.js                         window.NewsAuth: Supabase client, sessions/remember-me, sign up/in/out, magic-link + unsubscribe RPCs
js/account.js                      index.html-only: wires the login/signup forms and account settings panel
js/unsubscribe.js                  unsubscribe.html-only: calls the unsubscribe RPC on button click
content/editions.js                window.EDITIONS = [ {date, topStory, topics, local}, ... ], newest first
                                    so it can be loaded via <script> with no server/CORS needed.
                                    In production, this is the file the daily generation
                                    pipeline appends to each morning — or, once this is
                                    served over http instead of file://, render.js can be
                                    switched to fetch() a dated JSON file per edition instead.
supabase/schema.sql                 Run once in the Supabase SQL editor: subscribers table, RLS
                                    policies, and the magic-link / unsubscribe RPC functions.
netlify/functions/send-daily-emails.js  Scheduled function: emails everyone with reminders on.
netlify.toml                        Netlify build/publish config + the function's daily cron schedule.
```

## The masthead: name -> title

The masthead title is built from the reader's **first initial**, not their
full name, using a fixed letter → word map in `js/masthead.js`:

```
A: News      B: Update    C: Chronicle  D: Daily     E: Edition
F: Post      G: Edition   H: Daily      I: Insider   J: Journal
K: News      L: Update    M: Memo       N: Notebook  O: Observer
P: Post      Q: Post      R: Review     S: Scoop     T: Times
U: Update    V: Voice     W: Wire       X: Edition   Y: Daily    Z: News
```

`getMastheadTitle(name)` trims the name, takes its first character,
uppercases it, and looks it up — e.g. `"Uri"` → **"The Uri Update"**. If the
name is empty or its first character isn't a letter A–Z, it falls back to the
neutral title **"The Daily Edition"** (no name inserted).

## The 10 topics (fixed list)

Politics · Technology & AI · Business & Markets · Science & Discovery ·
Health & Medicine · Global Affairs · Economy & Personal Finance ·
Education & Research · Sports · Also Worth Knowing

Topics and local news are deliberately **separate steps** in the UI — local
news is never mixed into the topic checkbox list, since it's not a "topic" a
reader picks per-story, it's a single city selection that unlocks one
additional local block.

## The 45 supported cities (fixed list)

**Canada (12):** Toronto, Vancouver, Montreal, Calgary, Ottawa, Edmonton,
Winnipeg, Quebec City, Hamilton, Kitchener-Waterloo, London, Halifax

**USA (33):** New York City, Los Angeles, Chicago, Houston, Dallas, Phoenix,
Philadelphia, San Antonio, San Diego, Austin, Seattle, Denver, Boston, Miami,
Atlanta, Washington D.C., San Francisco, Las Vegas, Nashville, New Orleans,
Portland, Charlotte, Minneapolis, San Jose, Detroit, Baltimore, Milwaukee,
Tampa, Orlando, Sacramento, Kansas City, Cleveland, Pittsburgh

Only **Toronto, Vancouver, Dallas, New York City, and Chicago** have
fully-written demo content in `content/editions.js` (see `hasContent: true`
in `js/cities.js`), across all three sample days. Every other city is a valid
selection in the city picker, but the rendering page shows a graceful
fallback — *"A local edition for &lt;city&gt; isn't available yet — check
back soon."* — instead of erroring or showing nothing. This mirrors how city
coverage will actually roll out gradually in production: adding a city later
is just adding it to `local` in each day's edition object and flipping
`hasContent` to `true`.

## Content file schema

`content/editions.js` defines `window.EDITIONS`, an array of edition objects,
**newest first**:

```js
window.EDITIONS = [
  {
    "date": "2026-09-16",
    "topStory": {
      "headline": "...",
      "byline": "...",
      "paragraphs": ["...", "...", "..."],
      "sources": [["Source title", "https://..."], ["Source title", "https://..."]]
    },
    "topics": {
      "politics": [
        {
          "headline": "...",
          "byline": "...",
          "paragraphs": ["...", "..."],
          "sources": [["Source title", "https://..."]]
        }
        /* ...2-3 stories per topic, each with exactly 2 paragraphs... */
      ]
      /* ...one array per topic slug, all 10 always present... */
    },
    "local": {
      "Toronto": {
        "headline": "...",
        "paragraphs": ["...", "..."],
        "sources": [["Source title", "https://..."]]
      }
      /* ...one entry per city NAME (not slug) that has content... */
    }
  }
  /* ...older editions follow, same shape... */
];
```

- **`topStory`** is not tied to any topic and is always rendered at the top
  of every reader's single-edition page, regardless of which topics they
  selected.
- **`topics`** keys must match the `slug` values in `js/topics.js` exactly
  (`politics`, `tech-ai`, `business-markets`, `science-discovery`,
  `health-medicine`, `global-affairs`, `economy-personal-finance`,
  `education-research`, `sports`, `also-worth-knowing`). Each value is an
  **array of 2-3 story objects**, each with exactly 2 paragraphs — several
  short stories per section rather than one long one.
- **`local`** keys must match the `name` values in `js/cities.js` exactly
  (e.g. `"New York City"`, `"Washington D.C."`) and stay a single story object
  per city (no array), with no `byline` — a lighter blurb format than topic
  and top stories.

## Content rules

These apply to every story in this product — sample/mock content included —
and should carry over unchanged when this is wired to a real daily
generation pipeline:

1. **Every story is original writing based on facts, never large verbatim
   passages copied from a source.** Summarize and synthesize; don't
   reproduce a source's prose.
2. **Every story includes a list of cited sources** (title + URL) it's based
   on, the same way a real news article would, in the `sources` field.
3. **Any direct quotation is short, clearly attributed, and something
   that's actually fine to quote** — an on-record statement from a named,
   quotable person — never a lifted passage of someone else's copyrighted
   prose.
4. **No financial-advice or stock-picking content anywhere in this
   product.** Business/markets and economy stories may report on companies,
   deals, and economic data as news, but must not recommend buying,
   selling, or holding any investment.

### About the sample content specifically

The story text in `content/editions.js` is **entirely fictional demo
content** written to exercise the schema and the UI end-to-end across three
sample days — it does not describe real events, and the named people,
companies, sports teams, and publications in it are invented. Its `sources`
entries use `example.com` placeholder URLs and invented outlet names for the
same reason: to avoid implying any real outlet published these specific
(fake) stories. When this is wired to the real daily generation pipeline,
`sources` should point to real, citable articles.

## Print support

The single-edition view includes a **Print this edition** button
(`window.print()`). The stylesheet's `@media print` block hides non-essential
chrome — the page-nav links, the print button itself, and the archive
tiles/featured block if somehow visible — switches to black-on-white, and
sets `page-break-inside: avoid` on stories and the local block so a story
doesn't get cut across a page boundary.

## Accounts, magic links, and the daily email (Phase 2)

### Why Supabase for both auth and storage

The spec's first choice was Netlify Identity, with Supabase Auth as the
fallback "if Netlify Identity doesn't fit well once you're in the code."
Netlify Identity has been deprecated since late 2022 — Netlify itself
recommends third-party auth for any new project — so this build goes
straight to **Supabase for both authentication and storage**: one project,
one set of credentials, and no hand-rolled password hashing anywhere
(Supabase Auth owns that entirely). See `supabase/schema.sql`.

### Accounts

Creating an account is optional — the anonymous, `localStorage`-only flow
from Phase 1 still works exactly as before. Signing up or logging in (the
account panel at the bottom of `index.html`) adds:

- A `subscribers` row (email, name, topics, city, an `allow_daily_reminders`
  flag, and a magic token) keyed 1:1 to the Supabase Auth user, auto-created
  by a database trigger the moment someone signs up.
- Submitting **Build My Paper** while signed in also saves name/topics/city
  to that row (`js/customize.js` calls `NewsAccount.syncPrefs()`), so the
  same paper follows the reader to another device once they log in there.
- An **Allow Daily Reminders to Your Email** toggle in the account panel,
  saved immediately on change — this is what controls whether the daily
  email function sends that subscriber anything at all.
- **Remember me**: unchecked, the login session is stored in
  `sessionStorage` only and disappears when the tab closes. Checked, it's
  mirrored into `localStorage` and survives closing and reopening the
  browser. Both are handled by one custom storage adapter passed to the
  Supabase client (`hybridStorage` in `js/auth.js`) — no separate
  "logged in for this tab" vs. "logged in for this device" code paths.

### Magic links (no login needed to read the email)

Every subscriber gets a random, effectively unguessable token
(`magic_token`, a `uuid`) generated at signup. The daily email's "Continue
Reading" button and its Read link are `read.html?magic=<token>&date=...`.
When `render.js` sees a `magic` param, it resolves it through a
`SECURITY DEFINER` Postgres function
(`get_subscriber_by_magic_token`) that returns only name/topics/city — never
the token, id, or email — and renders that reader's paper with no login
prompt, regardless of whether they're logged in on that device at all. If
the token doesn't resolve (missing, wrong, already rotated), it falls back
to the normal URL/`localStorage` flow silently.

### Daily email

`netlify/functions/send-daily-emails.js` is a **Netlify Scheduled Function**
(cron in `netlify.toml`, defaults to 12:00 UTC daily) that, for every
subscriber with reminders on: builds their masthead title, a 1-2 sentence
teaser of today's top story (never the full story), a "Continue Reading"
button (their magic link), and a working unsubscribe link — then sends it
through the **Resend** API. It deliberately fetches `content/editions.js`
and `js/masthead.js` from the *deployed site itself* at run time instead of
duplicating their logic, so the email always matches the site and neither
file has to change for this to work. If any required environment variable
is missing, it logs a clear message and exits without sending anything or
failing the build — it never needs a real API key to deploy or run.

### Unsubscribe

`unsubscribe.html?token=<magic token>` flips `allow_daily_reminders` off via
a second `SECURITY DEFINER` RPC, also with no login required. It requires an
explicit button click rather than firing on page load, so an email client's
link-preview/scanning bot can't silently unsubscribe someone by just
fetching the URL.

### Manual setup required (not done by this build)

This code reads its configuration from environment variables and a config
file — it will not send real email or create real accounts until you:

1. **Create a Supabase project** (supabase.com, free tier is enough).
2. Run `supabase/schema.sql` once in its SQL Editor.
3. Copy the project's URL and `anon public` key into `js/supabase-config.js`.
4. **Create a Resend account** (resend.com) and verify a sending domain.
5. Deploy this site to **Netlify** (scheduled functions only run on
   Netlify, not locally) and set these environment variables in Site
   configuration -> Environment variables:
   - `SUPABASE_URL` — same project URL as step 3
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings -> API -> `service_role`
     key. **Secret** — this bypasses Row Level Security, so it must only
     ever live in Netlify's environment variables, never in frontend code
     or `js/supabase-config.js`.
   - `RESEND_API_KEY` — from the Resend account in step 4.
   - `RESEND_FROM_EMAIL` — e.g. `The Daily Newspaper <news@yourdomain.com>`,
     using the domain verified in step 4.
6. Optionally adjust the send time in `netlify.toml`'s `schedule` (cron, UTC).

Until steps 1-3 are done, every account feature (signup, login, magic
links, unsubscribe) fails gracefully with a console message and the rest of
the site keeps working exactly as in Phase 1. Until steps 4-6 are done, the
scheduled function logs which environment variables are missing and skips
sending, rather than erroring.

## What's deliberately out of scope

Payments/subscriptions and the actual daily content-generation pipeline
(planned to run automatically each morning, the same way an existing
separate newsletter already does — the daily email in Phase 2 still just
reads whatever `content/editions.js` currently has, not a real news
pipeline). Also deliberately excluded: images/photos/icons or any
decorative visual design (this stays purely typography-driven), and a
"share this edition" feature — this product isn't meant to be self-service
or viral; distribution happens separately, outside this app.

This build only consumes a static content file — swapping in real daily
content later should mean appending to `content/editions.js` (or switching
`render.js` to `fetch()` a dated JSON file once served over http), with no
changes needed to the customize or render pages themselves.
