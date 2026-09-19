(function () {
  var root = document.getElementById("content-root");
  var masthead = document.getElementById("masthead");
  var mastheadTitle = document.getElementById("masthead-title");
  var mastheadDate = document.getElementById("masthead-date");
  var mastheadCity = document.getElementById("masthead-city");
  var pageNav = document.getElementById("page-nav");
  var archiveLink = document.getElementById("archive-link");
  var editLink = document.getElementById("edit-link");
  var printRow = document.getElementById("print-row");
  var printBtn = document.getElementById("print-btn");

  function formatDate(isoDate) {
    var d = new Date(isoDate + "T00:00:00");
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  function cityBySlug(slug) {
    return window.CITIES.find(function (c) { return c.slug === slug; }) || null;
  }

  function getEditions() {
    return Array.isArray(window.EDITIONS) ? window.EDITIONS : [];
  }

  function findEdition(date) {
    return getEditions().find(function (e) { return e.date === date; }) || null;
  }

  function archiveHref(prefs, date) {
    var qs = window.NewsPrefs.buildQueryString(prefs);
    var href = "read.html";
    var params = [];
    if (qs) params.push(qs);
    if (date) params.push("date=" + encodeURIComponent(date));
    if (params.length) href += "?" + params.join("&");
    return href;
  }

  function collectSources(list, sources) {
    if (!sources) return;
    sources.forEach(function (pair) { list.push(pair); });
  }

  function buildSourcesFooter(sources) {
    var el = document.createElement("section");
    el.className = "sources-footer";
    var items = sources.map(function (pair) {
      var title = pair[0], url = pair[1];
      return "<li><a href=\"" + url + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + title + "</a></li>";
    }).join("");
    el.innerHTML = "<p class=\"sources-label\">Sources</p><ol>" + items + "</ol>";
    return el;
  }

  function paragraphsHtml(paragraphs) {
    return paragraphs.map(function (p) {
      return "<p class=\"body-text\">" + p + "</p>";
    }).join("");
  }

  function buildTopStoryArticle(story) {
    var el = document.createElement("article");
    el.className = "story top-story";
    el.innerHTML =
      "<p class=\"eyebrow\">Top Story</p>" +
      "<h2>" + story.headline + "</h2>" +
      (story.byline ? "<p class=\"byline\">By " + story.byline + "</p>" : "") +
      paragraphsHtml(story.paragraphs);
    return el;
  }

  function buildTopicSection(topic, stories) {
    var section = document.createElement("section");
    section.className = "topic-section";
    var heading = document.createElement("h2");
    heading.className = "topic-section-title";
    heading.textContent = topic.label;
    section.appendChild(heading);

    var grid = document.createElement("div");
    grid.className = "topic-stories-grid grid-" + stories.length;

    stories.forEach(function (story) {
      var el = document.createElement("article");
      el.className = "story topic-story";
      el.innerHTML =
        "<h3>" + story.headline + "</h3>" +
        (story.byline ? "<p class=\"byline\">By " + story.byline + "</p>" : "") +
        paragraphsHtml(story.paragraphs);
      grid.appendChild(el);
    });

    section.appendChild(grid);
    return section;
  }

  function buildLocalBlock(cityName, story) {
    var el = document.createElement("div");
    el.className = "local-block";
    if (!story) {
      el.innerHTML =
        "<p class=\"eyebrow\">Local — " + cityName + "</p>" +
        "<p class=\"local-fallback\">A local edition for " + cityName +
        " isn't available yet — check back soon.</p>";
      return el;
    }
    el.innerHTML =
      "<p class=\"eyebrow\">Local — " + cityName + "</p>" +
      "<h2>" + story.headline + "</h2>" +
      paragraphsHtml(story.paragraphs);
    return el;
  }

  function showEmptyState(message, ctaText, ctaHref) {
    root.innerHTML =
      "<div class=\"empty-state\">" +
        "<h2>Nothing to show yet</h2>" +
        "<p>" + message + "</p>" +
        (ctaText ? "<a class=\"primary-btn-link\" href=\"" + ctaHref + "\">" + ctaText + "</a>" : "") +
      "</div>";
  }

  function setNav(showArchiveLink, showPrint) {
    pageNav.classList.remove("hidden");
    archiveLink.classList.toggle("hidden", !showArchiveLink);
    printRow.classList.toggle("hidden", !showPrint);
  }

  function renderSingleEdition(prefs, date) {
    var edition = findEdition(date);

    mastheadDate.textContent = edition ? formatDate(edition.date) : "";
    var city = prefs.city ? cityBySlug(prefs.city) : null;
    mastheadCity.textContent = city ? "Local edition: " + city.name : "";
    archiveLink.href = archiveHref(prefs, null);
    setNav(true, !!edition);

    if (!edition) {
      showEmptyState("There's no edition for that date. Take a look at the archive instead.", "Browse Editions", archiveHref(prefs, null));
      return;
    }

    root.innerHTML = "";
    var allSources = [];

    root.appendChild(buildTopStoryArticle(edition.topStory));
    collectSources(allSources, edition.topStory.sources);

    window.TOPICS.forEach(function (topic) {
      if (prefs.topics.indexOf(topic.slug) === -1) return;
      var stories = edition.topics && edition.topics[topic.slug];
      if (!stories || !stories.length) return;
      root.appendChild(buildTopicSection(topic, stories));
      stories.forEach(function (story) { collectSources(allSources, story.sources); });
    });

    if (city) {
      var divider = document.createElement("p");
      divider.className = "section-divider";
      divider.textContent = "❦";
      root.appendChild(divider);

      var localStory = edition.local && edition.local[city.name];
      root.appendChild(buildLocalBlock(city.name, localStory));
      if (localStory) collectSources(allSources, localStory.sources);
    }

    if (allSources.length) {
      root.appendChild(buildSourcesFooter(allSources));
    }
  }

  function renderArchive(prefs) {
    var editions = getEditions();
    mastheadDate.textContent = "";
    mastheadCity.textContent = "";
    setNav(false, false);

    if (!editions.length) {
      showEmptyState("No editions are available yet. Check back soon.", null, null);
      return;
    }

    var today = editions[0];
    var past = editions.slice(1);

    root.innerHTML = "";

    var featured = document.createElement("a");
    featured.className = "archive-featured";
    featured.href = archiveHref(prefs, today.date);
    featured.innerHTML =
      "<p class=\"eyebrow\">Today's Edition</p>" +
      "<h2>" + formatDate(today.date) + "</h2>" +
      "<p class=\"archive-featured-headline\">" + today.topStory.headline + "</p>" +
      "<span class=\"archive-cta\">Read today's edition →</span>";
    root.appendChild(featured);

    var divider = document.createElement("hr");
    divider.className = "archive-divider";
    root.appendChild(divider);

    if (past.length) {
      var grid = document.createElement("div");
      grid.className = "archive-grid";
      past.forEach(function (edition) {
        var tile = document.createElement("a");
        tile.className = "archive-tile";
        tile.href = archiveHref(prefs, edition.date);
        tile.innerHTML =
          "<p class=\"archive-tile-date\">" + formatDate(edition.date) + "</p>" +
          "<p class=\"archive-tile-headline\">" + edition.topStory.headline + "</p>";
        grid.appendChild(tile);
      });
      root.appendChild(grid);
    } else {
      var note = document.createElement("p");
      note.className = "archive-empty-note";
      note.textContent = "No past editions yet — check back after today.";
      root.appendChild(note);
    }
  }

  async function render() {
    var editions = getEditions();
    var dateParam = new URLSearchParams(window.location.search).get("date");
    var magicToken = new URLSearchParams(window.location.search).get("magic");

    // A magic-link visit (from the daily email) identifies the reader by
    // an unguessable per-account token instead of login — see js/auth.js
    // and supabase/schema.sql. Falls back to the normal URL/localStorage
    // prefs if there's no token, or it doesn't resolve to anyone.
    var prefs = null;
    if (magicToken && window.NewsAuth) {
      try {
        prefs = await window.NewsAuth.resolveMagicPrefs(magicToken);
      } catch (e) {
        prefs = null;
      }
    }
    if (!prefs) {
      prefs = window.NewsPrefs.resolvePrefs();
    }

    if (!editions.length) {
      masthead.style.display = "none";
      pageNav.classList.add("hidden");
      showEmptyState("Today's content couldn't be loaded. Try reloading the page.", null, null);
      return;
    }

    if (!prefs) {
      masthead.style.display = "none";
      pageNav.classList.add("hidden");
      showEmptyState("You haven't customized a paper yet.", "Build My Paper", "index.html");
      return;
    }

    masthead.style.display = "";
    mastheadTitle.textContent = window.getMastheadTitle(prefs.name);
    editLink.href = "index.html";

    if (dateParam) {
      renderSingleEdition(prefs, dateParam);
    } else {
      renderArchive(prefs);
    }
  }

  if (printBtn) {
    printBtn.addEventListener("click", function () { window.print(); });
  }

  render();
})();
