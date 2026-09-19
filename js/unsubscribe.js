/* unsubscribe.html logic: turns off "allow daily reminders" for the
 * subscriber matching ?token=<magic token>, with no login required — see
 * unsubscribe_by_magic_token() in supabase/schema.sql. Requires an
 * explicit click rather than firing on page load, so link-preview bots and
 * email scanners that GET the URL don't silently unsubscribe people.
 */
(function () {
  var params = new URLSearchParams(window.location.search);
  var token = params.get("token");
  var btn = document.getElementById("unsubscribe-btn");
  var msg = document.getElementById("unsubscribe-message");
  var err = document.getElementById("unsubscribe-error");

  if (!token) {
    msg.textContent = "This unsubscribe link is missing its token, so we can't tell which account to update. Please use the link from the email you received.";
    btn.style.display = "none";
    return;
  }

  btn.addEventListener("click", async function () {
    btn.disabled = true;
    err.textContent = "";
    try {
      var matched = await window.NewsAuth.unsubscribeByToken(token);
      if (matched) {
        msg.textContent = "You're unsubscribed — you won't get any more daily emails. You can turn reminders back on anytime from your account settings.";
        btn.style.display = "none";
      } else {
        err.textContent = "That link doesn't match an active subscriber. It may have already been used.";
        btn.disabled = false;
      }
    } catch (e) {
      err.textContent = "Something went wrong — please try again in a moment.";
      btn.disabled = false;
    }
  });
})();
