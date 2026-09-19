/* Wires the login/signup forms and account panel on index.html to
 * NewsAuth (js/auth.js). When signed in: prefills the customize form from
 * the saved account, saves name/topics/city back to the account whenever
 * "Build My Paper" is submitted (see the hook in js/customize.js), and
 * saves the "Allow Daily Reminders" toggle immediately on change.
 *
 * Does nothing (and doesn't error) on pages without an account panel, so
 * it's safe to leave off pages that don't need it.
 */
(function () {
  var signedOutBox = document.getElementById("account-signed-out");
  var signedInBox = document.getElementById("account-signed-in");
  if (!signedOutBox || !signedInBox || !window.NewsAuth) return;

  var tabLogin = document.getElementById("tab-login");
  var tabSignup = document.getElementById("tab-signup");
  var loginForm = document.getElementById("login-form");
  var signupForm = document.getElementById("signup-form");
  var loginError = document.getElementById("login-error");
  var signupError = document.getElementById("signup-error");
  var signupNote = document.getElementById("signup-note");
  var accountEmail = document.getElementById("account-email");
  var remindersYes = document.getElementById("reminders-yes");
  var remindersNo = document.getElementById("reminders-no");
  var remindersYesLabel = document.getElementById("reminders-yes-label");
  var remindersNoLabel = document.getElementById("reminders-no-label");
  var remindersNote = document.getElementById("reminders-note");
  var logoutBtn = document.getElementById("logout-btn");

  var currentUserId = null;
  var suppressRemindersSave = false;

  function showTab(which) {
    tabLogin.classList.toggle("active", which === "login");
    tabSignup.classList.toggle("active", which === "signup");
    loginForm.classList.toggle("hidden", which !== "login");
    signupForm.classList.toggle("hidden", which !== "signup");
  }

  function updateRemindersStyle() {
    remindersYesLabel.classList.toggle("active", remindersYes.checked);
    remindersNoLabel.classList.toggle("active", remindersNo.checked);
  }

  async function showSignedIn(session) {
    if (!session || !session.user) return;
    currentUserId = session.user.id;
    signedOutBox.classList.add("hidden");
    signedInBox.classList.remove("hidden");
    accountEmail.textContent = session.user.email;

    var row = await window.NewsAuth.getSubscriberRow(currentUserId);
    if (row) {
      suppressRemindersSave = true;
      remindersYes.checked = !!row.allow_daily_reminders;
      remindersNo.checked = !row.allow_daily_reminders;
      updateRemindersStyle();
      suppressRemindersSave = false;

      if (window.NewsCustomize && (row.name || (row.topics && row.topics.length) || row.city)) {
        window.NewsCustomize.applyPrefsToForm({ name: row.name, topics: row.topics || [], city: row.city });
      }
    }
  }

  function showSignedOut() {
    currentUserId = null;
    signedInBox.classList.add("hidden");
    signedOutBox.classList.remove("hidden");
  }

  tabLogin.addEventListener("click", function () { showTab("login"); });
  tabSignup.addEventListener("click", function () { showTab("signup"); });

  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    loginError.textContent = "";
    var email = document.getElementById("login-email").value.trim();
    var password = document.getElementById("login-password").value;
    var remember = document.getElementById("login-remember").checked;
    try {
      var data = await window.NewsAuth.signIn(email, password, remember);
      await showSignedIn(data.session);
    } catch (err) {
      loginError.textContent = (err && err.message) || "Couldn't log in — check your email and password.";
    }
  });

  signupForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    signupError.textContent = "";
    signupNote.textContent = "";
    var email = document.getElementById("signup-email").value.trim();
    var password = document.getElementById("signup-password").value;
    try {
      var data = await window.NewsAuth.signUp(email, password);
      if (data.session) {
        await showSignedIn(data.session);
      } else {
        signupNote.textContent = "Account created — check your email to confirm it, then log in.";
        showTab("login");
      }
    } catch (err) {
      signupError.textContent = (err && err.message) || "Couldn't sign up — please try again.";
    }
  });

  logoutBtn.addEventListener("click", async function () {
    await window.NewsAuth.signOut();
    showSignedOut();
  });

  [remindersYes, remindersNo].forEach(function (el) {
    el.addEventListener("change", async function () {
      updateRemindersStyle();
      if (suppressRemindersSave || !currentUserId) return;
      remindersNote.textContent = "";
      try {
        await window.NewsAuth.saveSubscriberRow(currentUserId, { allow_daily_reminders: remindersYes.checked });
        remindersNote.textContent = "Saved.";
      } catch (err) {
        remindersNote.textContent = "Couldn't save that — please try again.";
      }
    });
  });

  window.NewsAccount = {
    isLoggedIn: function () { return !!currentUserId; },
    syncPrefs: async function (prefs) {
      if (!currentUserId) return;
      try {
        await window.NewsAuth.saveSubscriberRow(currentUserId, {
          name: prefs.name,
          topics: prefs.topics,
          city: prefs.city
        });
      } catch (err) {
        console.error("NewsAccount: couldn't sync prefs to account:", err.message);
      }
    }
  };

  (async function init() {
    var session = await window.NewsAuth.getSession();
    if (session) {
      await showSignedIn(session);
    } else {
      showSignedOut();
    }
    window.NewsAuth.onAuthChange(function (session) {
      if (session) showSignedIn(session); else showSignedOut();
    });
  })();
})();
