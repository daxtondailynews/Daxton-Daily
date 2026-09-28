/* Fills the date and edition number on the right of the navy brand bar.
 * Defaults to today (Toronto time); the reading page calls
 * DaxtonBrand.setDate() with the edition being read.
 * Edition numbers count days since the first edition, so each date always
 * gets the same number no matter how many editions a reader can load.
 */
(function () {
  var FIRST_EDITION = "2026-09-17"; // No. 1
  var dateEl = document.getElementById("brand-date");
  var editionEl = document.getElementById("brand-edition");

  function todayIso() {
    // en-CA formats as YYYY-MM-DD.
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  }

  function editionNumber(iso) {
    var ms = Date.parse(iso + "T00:00:00Z") - Date.parse(FIRST_EDITION + "T00:00:00Z");
    if (isNaN(ms) || ms < 0) return null;
    return Math.round(ms / 86400000) + 1;
  }

  function setDate(iso) {
    if (!dateEl) return;
    iso = iso || todayIso();
    var d = new Date(iso + "T00:00:00");
    dateEl.textContent = isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
    var n = editionNumber(iso);
    if (editionEl) editionEl.textContent = n ? "Edition No. " + n : "";
  }

  setDate();
  window.DaxtonBrand = { setDate: setDate };
})();
