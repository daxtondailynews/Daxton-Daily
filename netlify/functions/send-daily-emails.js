/* Netlify Scheduled Function — runs once a day (see the schedule in
 * netlify.toml) and emails the daily digest to every subscriber who has
 * "Allow Daily Reminders" turned on.
 *
 * Deliberately reads today's content and the masthead name map straight
 * from the deployed site's own content/editions.js and js/masthead.js
 * (over http, at run time) instead of duplicating or reimplementing them
 * here — so the email always matches the site exactly, and those files
 * never need to change for this feature to work. When the real
 * content-generation pipeline replaces the mock content file, this
 * function keeps working unmodified.
 *
 * Requires four environment variables, set in the Netlify UI (Site
 * configuration -> Environment variables), never committed to the repo:
 *   SUPABASE_URL               same project URL as js/supabase-config.js
 *   SUPABASE_SERVICE_ROLE_KEY  Project Settings -> API -> service_role key
 *                               (secret — bypasses Row Level Security, so
 *                               it must never go in frontend code)
 *   RESEND_API_KEY             from resend.com, after verifying a sending domain
 *   RESEND_FROM_EMAIL          e.g. "The Daily Newspaper <news@yourdomain.com>"
 * If any are missing, this logs a clear message and exits without
 * sending anything or failing the deploy/build.
 */

exports.handler = async function () {
  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  var RESEND_API_KEY = process.env.RESEND_API_KEY;
  var RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
  var SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL;

  var missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!RESEND_FROM_EMAIL) missing.push("RESEND_FROM_EMAIL");
  if (!SITE_URL) missing.push("URL (Netlify's own site-URL env var)");
  if (missing.length) {
    console.error("send-daily-emails: missing required env var(s): " + missing.join(", ") + " — skipping today's send.");
    return { statusCode: 200, body: "Skipped: missing env var(s) " + missing.join(", ") };
  }

  try {
    var editions = await loadFromSite(SITE_URL, "/content/editions.js", "EDITIONS");
    var getMastheadTitle = await loadFromSite(SITE_URL, "/js/masthead.js", "getMastheadTitle");

    if (!Array.isArray(editions) || !editions.length || typeof getMastheadTitle !== "function") {
      console.error("send-daily-emails: couldn't load today's content or the masthead map from the deployed site — skipping today's send.");
      return { statusCode: 200, body: "Skipped: content unavailable" };
    }
    var today = editions[0];

    var subscribers = await fetchSubscribers(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
    }

    console.log("send-daily-emails: done — sent " + sent + ", failed " + failed + ".");
    return { statusCode: 200, body: "Sent " + sent + ", failed " + failed };
  } catch (err) {
    console.error("send-daily-emails: unexpected error: " + err.message);
    return { statusCode: 500, body: "Error: " + err.message };
  }
};

// Fetches a browser-oriented script that assigns `window.<exportName>`,
// runs it against a throwaway `window` object, and returns that value —
// so we reuse the real file instead of forking its content.
async function loadFromSite(siteUrl, path, exportName) {
  var res = await fetch(siteUrl + path);
  if (!res.ok) throw new Error("Failed to fetch " + path + ": " + res.status);
  var src = await res.text();
  var sandbox = {};
  var runInSandbox = new Function("window", src + "\nreturn window." + exportName + ";");
  return runInSandbox(sandbox);
}

async function fetchSubscribers(supabaseUrl, serviceKey) {
  var url = supabaseUrl + "/rest/v1/subscribers?allow_daily_reminders=eq.true&select=email,name,topics,city,magic_token";
  var res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey
    }
  });
  if (!res.ok) throw new Error("Supabase query failed: " + res.status + " " + (await res.text()));
  return res.json();
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
