/* Daily email sender — run once a day by GitHub Actions (see the schedule
 * in .github/workflows/send-daily-emails.yml) and emails the daily digest
 * to every current member (see supabase/membership.sql) who has "Allow
 * Daily Reminders" turned on.
 *
 * Reads today's edition from the Supabase "editions" table (the same
 * place the site reads it from), and the masthead name map straight from
 * the repo's own js/masthead.js instead of reimplementing it — so the
 * email always matches the site. If the newest edition isn't today's
 * (e.g. the morning content run was missed), it skips sending rather than
 * emailing yesterday's paper again.
 *
 * Requires four environment variables, set as repository secrets on
 * GitHub (Settings -> Secrets and variables -> Actions), never committed
 * to the repo:
 *   SUPABASE_URL               same project URL as js/supabase-config.js
 *   SUPABASE_SERVICE_ROLE_KEY  Project Settings -> API -> service_role key
 *                               (secret — bypasses Row Level Security, so
 *                               it must never go in frontend code)
 *   RESEND_API_KEY             from resend.com, after verifying a sending domain
 *   RESEND_FROM_EMAIL          e.g. "Daxton Daily <news@daxtondaily.com>"
 * Optional:
 *   SITE_URL                   base URL for links in the email
 *                               (defaults to https://daxtondaily.com)
 *   TEST_EMAIL                 if set, only this one subscriber is emailed —
 *                               for trying the email out before going live
 * If any required one is missing, this logs a clear message and exits
 * without sending anything.
 *
 * Run locally with: node scripts/send-daily-emails.js
 */

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");

main().catch(function (err) {
  console.error("send-daily-emails: unexpected error: " + err.message);
  process.exit(1);
});

async function main() {
  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  var RESEND_API_KEY = process.env.RESEND_API_KEY;
  var RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
  var SITE_URL = (process.env.SITE_URL || "https://daxtondaily.com").replace(/\/+$/, "");
  var TEST_EMAIL = (process.env.TEST_EMAIL || "").trim().toLowerCase();

  var missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!RESEND_FROM_EMAIL) missing.push("RESEND_FROM_EMAIL");
  if (missing.length) {
    console.error("send-daily-emails: missing required env var(s): " + missing.join(", ") + " — skipping today's send.");
    return;
  }

  var getMastheadTitle = loadFromRepo("js/masthead.js", "getMastheadTitle");
  if (typeof getMastheadTitle !== "function") {
    throw new Error("couldn't load the masthead map from js/masthead.js");
  }

  var today = await fetchLatestEdition(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  if (!today) throw new Error("no editions found in Supabase");
  var todayDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if (today.date !== todayDate) {
    console.error("send-daily-emails: newest edition is " + today.date + ", not today (" + todayDate + ") — skipping so nobody gets a stale paper.");
    process.exit(1);
  }

  var subscribers = await fetchSubscribers(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  if (TEST_EMAIL) {
    subscribers = subscribers.filter(function (s) { return (s.email || "").toLowerCase() === TEST_EMAIL; });
    console.log("send-daily-emails: TEST_EMAIL set — sending only to " + TEST_EMAIL + " (" + subscribers.length + " match).");
  }
  console.log("send-daily-emails: " + subscribers.length + " subscriber(s) opted in for " + today.date + ".");

  var sent = 0, failed = 0;
  for (var i = 0; i < subscribers.length; i++) {
    var sub = subscribers[i];
    try {
      await sendOne(sub, today, getMastheadTitle, SITE_URL, RESEND_API_KEY, RESEND_FROM_EMAIL);
      sent++;
    } catch (err) {
      failed++;
      console.error("send-daily-emails: failed to send to " + sub.email + ": " + err.message);
    }
    // Resend's default rate limit is 2 requests/second.
    await sleep(600);
  }

  console.log("send-daily-emails: done — sent " + sent + ", failed " + failed + ".");
  if (failed && !sent) process.exit(1);
}

// Runs a browser-oriented script that assigns `window.<exportName>`
// against a throwaway `window` object and returns that value — so we
// reuse the real file instead of forking its content.
function loadFromRepo(relPath, exportName) {
  var src = fs.readFileSync(path.join(ROOT, relPath), "utf8");
  var sandbox = {};
  var runInSandbox = new Function("window", src + "\nreturn window." + exportName + ";");
  return runInSandbox(sandbox);
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// New-style Supabase keys (sb_secret_...) go in the apikey header only;
// legacy JWT keys also need to be sent as a bearer token.
function supabaseHeaders(key) {
  var headers = { apikey: key };
  if (key.indexOf("sb_") !== 0) headers.Authorization = "Bearer " + key;
  return headers;
}

async function supabaseGet(supabaseUrl, key, pathAndQuery) {
  var res = await fetch(supabaseUrl + "/rest/v1/" + pathAndQuery, { headers: supabaseHeaders(key) });
  if (!res.ok) throw new Error("Supabase query failed: " + res.status + " " + (await res.text()));
  return res.json();
}

async function fetchLatestEdition(supabaseUrl, serviceKey) {
  var rows = await supabaseGet(supabaseUrl, serviceKey, "editions?select=edition&order=date.desc&limit=1");
  return rows.length ? rows[0].edition : null;
}

// Opted-in subscribers who are also current members.
async function fetchSubscribers(supabaseUrl, serviceKey) {
  var members = await supabaseGet(supabaseUrl, serviceKey, "memberships?status=in.(active,trialing,comped)&select=user_id");
  var memberIds = {};
  members.forEach(function (m) { memberIds[m.user_id] = true; });
  var subs = await supabaseGet(supabaseUrl, serviceKey, "subscribers?allow_daily_reminders=eq.true&select=id,email,name,topics,city,magic_token");
  return subs.filter(function (s) { return memberIds[s.id]; });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A short 1-2 sentence teaser from the top story's first paragraph — never
// the full story, per spec.
function teaser(paragraphs) {
  var first = (paragraphs && paragraphs[0]) || "";
  var sentences = first.match(/[^.!?]+[.!?]+/g) || [first];
  return sentences.slice(0, 2).join(" ").trim();
}

async function sendOne(sub, edition, getMastheadTitle, siteUrl, apiKey, fromEmail) {
  var mastheadTitle = getMastheadTitle(sub.name);
  var readUrl = siteUrl + "/read.html?magic=" + encodeURIComponent(sub.magic_token) + "&date=" + encodeURIComponent(edition.date);
  var unsubscribeUrl = siteUrl + "/unsubscribe.html?token=" + encodeURIComponent(sub.magic_token);
  var headline = edition.topStory.headline;
  var teaserText = teaser(edition.topStory.paragraphs);

  var html =
    '<div style="font-family: Georgia, \'Times New Roman\', serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">' +
      '<p style="font-family: Arial, sans-serif; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #3a3a3a; margin: 0 0 6px;">Daxton Daily Presents</p>' +
      '<h1 style="font-size: 28px; margin: 0 0 18px; border-bottom: 4px double #1a1a1a; padding-bottom: 14px;">' + escapeHtml(mastheadTitle) + '</h1>' +
      '<p style="font-family: Arial, sans-serif; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #8a2a2a; margin: 0 0 8px;">Top Story</p>' +
      '<h2 style="font-size: 21px; line-height: 1.3; margin: 0 0 12px;">' + escapeHtml(headline) + '</h2>' +
      '<p style="font-size: 16px; line-height: 1.55; margin: 0 0 26px;">' + escapeHtml(teaserText) + '</p>' +
      '<p style="text-align: center; margin: 0 0 30px;">' +
        '<a href="' + readUrl + '" style="display: inline-block; background: #1a1a1a; color: #faf6ee; text-decoration: none; font-family: Arial, sans-serif; font-weight: bold; font-size: 14px; letter-spacing: 0.04em; text-transform: uppercase; padding: 14px 30px;">Continue Reading ' + escapeHtml(mastheadTitle) + '</a>' +
      '</p>' +
      '<p style="font-family: Arial, sans-serif; font-size: 12px; color: #3a3a3a; text-align: center; border-top: 1px solid #c9c1af; padding-top: 16px;">' +
        'Don&#39;t want these emails? <a href="' + unsubscribeUrl + '" style="color: #3a3a3a;">Unsubscribe</a>.' +
      '</p>' +
    '</div>';

  var res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: sub.email,
      subject: mastheadTitle + ": " + headline,
      html: html
    })
  });

  if (!res.ok) {
    throw new Error("Resend API error " + res.status + ": " + (await res.text()));
  }
}
