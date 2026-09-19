/* Shared preference handling: read/write from the URL query string and
 * localStorage, so a reader can either bookmark/share a link or just
 * revisit the site with nothing but their browser's saved state.
 *
 * Preference shape: { name: string, topics: string[], city: string|null }
 * "city" is a city slug (see cities.js) or null if local news is off.
 */
(function () {
  var STORAGE_KEY = "dailyNewsPrefs";

  function validTopicSlugs() {
    return window.TOPICS.map(function (t) { return t.slug; });
  }

  function validCitySlugs() {
    return window.CITIES.map(function (c) { return c.slug; });
  }

  function sanitizePrefs(raw) {
    if (!raw) return null;
    var name = (raw.name || "").toString().trim();
    var allowedTopics = validTopicSlugs();
    var topics = Array.isArray(raw.topics)
      ? raw.topics.filter(function (t) { return allowedTopics.indexOf(t) !== -1; })
      : [];
    var city = null;
    if (raw.city && validCitySlugs().indexOf(raw.city) !== -1) {
      city = raw.city;
    }
    if (!name && topics.length === 0 && !city) return null;
    return { name: name, topics: topics, city: city };
  }

  function parseQueryPrefs() {
    var params = new URLSearchParams(window.location.search);
    if (!params.has("name") && !params.has("topics") && !params.has("city")) {
      return null;
    }
    var topicsParam = params.get("topics") || "";
    var topics = topicsParam.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    return sanitizePrefs({
      name: params.get("name") || "",
      topics: topics,
      city: params.get("city") || null
    });
  }

  function loadStoredPrefs() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return sanitizePrefs(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  function savePrefs(prefs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
      /* localStorage unavailable (private browsing, quota) — the URL
         query string still works on its own, so this is non-fatal. */
    }
  }

  function resolvePrefs() {
    var fromQuery = parseQueryPrefs();
    if (fromQuery) {
      savePrefs(fromQuery);
      return fromQuery;
    }
    return loadStoredPrefs();
  }

  function buildQueryString(prefs) {
    var params = new URLSearchParams();
    if (prefs.name) params.set("name", prefs.name);
    if (prefs.topics && prefs.topics.length) params.set("topics", prefs.topics.join(","));
    if (prefs.city) params.set("city", prefs.city);
    return params.toString();
  }

  window.NewsPrefs = {
    parseQueryPrefs: parseQueryPrefs,
    loadStoredPrefs: loadStoredPrefs,
    savePrefs: savePrefs,
    resolvePrefs: resolvePrefs,
    buildQueryString: buildQueryString
  };
})();
