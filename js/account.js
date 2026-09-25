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
  var joinNote = document.getElementById("join-note");
  var membershipStatus = document.getElementById("membership-status");
  var joinBtn = document.getElementById("join-btn");
  var manageBtn = document.getElementById("manage-btn");
  var codeHint = document.getElementById("code-hint");
  var membershipNote = document.getElementById("membership-note");

  var currentUserId = null;
  var suppressRemindersSave = false;

  // "Become a member" from a paywall (index.html?join=1) sets this so that,
  // once the reader has signed up/logged in — possibly in another tab after
  // confirming their email — they're sent straight to checkout.
  var JOIN_KEY = "dnJoinIntent";
  function hasJoinIntent() {
    try { return localStorage.getItem(JOIN_KEY) === "1"; } catch (e) { return false; }
  }
  function setJoinIntent(on) {
    try {
      if (on) localStorage.setItem(JOIN_KEY, "1");
      else localStorage.removeItem(JOIN_KEY);
    } catch (e) { /* ignore */ }
  }

  function formatDay(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  function renderMembership(m) {
    var status = m ? m.status : "none";
    var showJoin = false, showManage = false, text;
    if (m && m.isMember) {
      if (status === "comped") {
        text = "You have a complimentary membership. Enjoy the full paper!";
      } else {
        text = "You're a member. Thanks for reading!";
        if (m.current_period_end) text += " Renews " + formatDay(m.current_period_end) + ".";
        showManage = true;
      }
    } else if (status === "past_due" || status === "unpaid") {
      text = "Your last payment didn't go through. Update your card to keep reading the full paper.";
      showManage = true;
    } else {
      text = "Free account: you can read the top story each day.";
      showJoin = true;
    }
    membershipStatus.textContent = text;
    joinBtn.classList.toggle("hidden", !showJoin);
    codeHint.classList.toggle("hidden", !showJoin);
    manageBtn.classList.toggle("hidden", !showManage);
  }

  async function goToBilling(which) {
    membershipNote.textContent = "Opening the secure payment page…";
    joinBtn.disabled = manageBtn.disabled = true;
    try {
      if (which === "portal") await window.NewsAuth.openBillingPortal();
      else await window.NewsAuth.startCheckout();
    } catch (err) {
      membershipNote.textContent = (err && err.message) || "Couldn't reach the payment page. Please try again.";
      joinBtn.disabled = manageBtn.disabled = false;
    }
  }

  // Back from Stripe checkout: the webhook can take a few seconds to
  // record the new membership, so poll briefly before giving up.
  async function waitForMembership(userId) {
    for (var i = 0; i < 10; i++) {
      var m = await window.NewsAuth.getMembership(userId);
      if (m && m.isMember) return m;
      await new Promise(function (r) { setTimeout(r, 1500); });
    }
    return window.NewsAuth.getMembership(userId);
  }

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

  async function showSignedIn(session, opts) {
    opts = opts || {};
    if (!session || !session.user) return;
    currentUserId = session.user.id;
    signedOutBox.classList.add("hidden");
    signedInBox.classList.remove("hidden");
    accountEmail.textContent = session.user.email;

    var params = new URLSearchParams(window.location.search);
    var membership;
    if (params.get("membership") === "success") {
      membershipStatus.textContent = "Finishing up your membership…";
      membership = await waitForMembership(currentUserId);
      membershipNote.textContent = membership && membership.isMember
        ? "Welcome aboard! Your full paper is unlocked."
        : "Payment received. Your membership should appear in a minute; refresh this page if it doesn't.";
    } else {
      membership = await window.NewsAuth.getMembership(currentUserId);
      if (params.get("membership") === "cancelled") membershipNote.textContent = "Checkout cancelled. You weren't charged.";
    }
    renderMembership(membership);

    if (hasJoinIntent()) {
      setJoinIntent(false);
      if (!(membership && membership.isMember)) {
        await goToBilling("checkout");
        return;
      }
    }

    var row = await window.NewsAuth.getSubscriberRow(currentUserId);
    if (row) {
      suppressRemindersSave = true;
      remindersYes.checked = !!row.allow_daily_reminders;
      remindersNo.checked = !row.allow_daily_reminders;
      updateRemindersStyle();
      suppressRemindersSave = false;

      var hasSavedPrefs = !!(row.name || (row.topics && row.topics.length) || row.city);
      if (hasSavedPrefs && window.NewsCustomize) {
        window.NewsCustomize.applyPrefsToForm({ name: row.name, topics: row.topics || [], city: row.city });
      }

      // Existing account with prefs already saved: skip the onboarding
      // form and go straight to their paper, same as submitting it.
      if (hasSavedPrefs && opts.redirectIfPrefs && window.NewsPrefs) {
        var prefs = { name: row.name || "", topics: row.topics || [], city: row.city || null };
        window.NewsPrefs.savePrefs(prefs);
        window.location.href = "read.html?" + window.NewsPrefs.buildQueryString(prefs);
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
      await showSignedIn(data.session, { redirectIfPrefs: true });
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

  joinBtn.addEventListener("click", function () { goToBilling("checkout"); });
  manageBtn.addEventListener("click", function () { goToBilling("portal"); });

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
    if (new URLSearchParams(window.location.search).get("join") === "1") {
      setJoinIntent(true);
      joinNote.classList.remove("hidden");
      showTab("signup");
    }

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
