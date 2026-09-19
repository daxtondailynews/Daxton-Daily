(function () {
  var topicsGrid = document.getElementById("topics-grid");
  var citySelect = document.getElementById("city-select");
  var cityField = document.getElementById("city-field");
  var localYes = document.getElementById("local-yes");
  var localNo = document.getElementById("local-no");
  var yesLabel = document.getElementById("local-yes-label");
  var noLabel = document.getElementById("local-no-label");
  var nameInput = document.getElementById("reader-name");
  var form = document.getElementById("customize-form");
  var errorBox = document.getElementById("form-error");

  function renderTopics() {
    topicsGrid.innerHTML = "";
    window.TOPICS.forEach(function (topic) {
      var label = document.createElement("label");
      label.className = "topic-option";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.name = "topics";
      input.value = topic.slug;
      var span = document.createElement("span");
      span.textContent = topic.label;
      label.appendChild(input);
      label.appendChild(span);
      topicsGrid.appendChild(label);
    });
  }

  function renderCities() {
    citySelect.innerHTML = "";
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a city…";
    placeholder.disabled = true;
    placeholder.selected = true;
    citySelect.appendChild(placeholder);

    var groups = { CA: "Canada", US: "United States" };
    ["CA", "US"].forEach(function (countryCode) {
      var optgroup = document.createElement("optgroup");
      optgroup.label = groups[countryCode];
      window.CITIES.filter(function (c) { return c.country === countryCode; })
        .forEach(function (city) {
          var opt = document.createElement("option");
          opt.value = city.slug;
          opt.textContent = city.name;
          optgroup.appendChild(opt);
        });
      citySelect.appendChild(optgroup);
    });
  }

  function updateToggleStyle() {
    yesLabel.classList.toggle("active", localYes.checked);
    noLabel.classList.toggle("active", localNo.checked);
    cityField.classList.toggle("hidden", !localYes.checked);
  }

  function getSelectedTopics() {
    return Array.prototype.slice
      .call(topicsGrid.querySelectorAll("input[name=topics]:checked"))
      .map(function (el) { return el.value; });
  }

  function applyPrefsToForm(prefs) {
    if (!prefs) return;
    nameInput.value = prefs.name || "";
    topicsGrid.querySelectorAll("input[name=topics]").forEach(function (input) {
      input.checked = prefs.topics.indexOf(input.value) !== -1;
    });
    if (prefs.city) {
      localYes.checked = true;
      citySelect.value = prefs.city;
    } else {
      localNo.checked = true;
    }
    updateToggleStyle();
  }

  function prefillFromStorage() {
    applyPrefsToForm(window.NewsPrefs.loadStoredPrefs());
  }

  localYes.addEventListener("change", updateToggleStyle);
  localNo.addEventListener("change", updateToggleStyle);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorBox.textContent = "";

    var name = nameInput.value.trim();
    var topics = getSelectedTopics();
    var wantsLocal = localYes.checked;
    var city = wantsLocal ? citySelect.value : null;

    if (!name) {
      errorBox.textContent = "Please enter a name for your edition.";
      nameInput.focus();
      return;
    }
    if (topics.length === 0) {
      errorBox.textContent = "Please select at least one topic.";
      return;
    }
    if (wantsLocal && !city) {
      errorBox.textContent = "Please choose a city, or switch local news to “No thanks.”";
      return;
    }

    var prefs = { name: name, topics: topics, city: city || null };
    window.NewsPrefs.savePrefs(prefs);

    function goToPaper() {
      window.location.href = "read.html?" + window.NewsPrefs.buildQueryString(prefs);
    }

    // Signed-in readers also get name/topics/city saved to their account,
    // so it's there next time they log in on any device. Never blocks
    // navigation — a failed sync just logs to the console (see account.js).
    if (window.NewsAccount && window.NewsAccount.isLoggedIn()) {
      window.NewsAccount.syncPrefs(prefs).then(goToPaper, goToPaper);
    } else {
      goToPaper();
    }
  });

  renderTopics();
  renderCities();
  prefillFromStorage();

  window.NewsCustomize = { applyPrefsToForm: applyPrefsToForm };
})();
