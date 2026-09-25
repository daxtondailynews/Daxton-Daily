/* Thin wrapper around the Supabase client: session handling (with the
 * remember-me tab-vs-device storage split), sign up/in/out, account-row
 * read/write, the two public RPC calls used for magic-link reading and
 * unsubscribing (see supabase/schema.sql for their server-side half), plus
 * membership status, Stripe checkout, and loading editions (see
 * supabase/membership.sql and supabase/functions/).
 *
 * Loaded on every page that touches accounts (index.html, read.html,
 * unsubscribe.html), after the supabase-js CDN script and
 * js/supabase-config.js. Exposes window.NewsAuth.
 */
(function () {
  var REMEMBER_KEY = "dnRememberMe";

  function rememberMe() {
    try { return localStorage.getItem(REMEMBER_KEY) === "1"; } catch (e) { return false; }
  }

  function setRememberMe(value) {
    try {
      if (value) localStorage.setItem(REMEMBER_KEY, "1");
      else localStorage.removeItem(REMEMBER_KEY);
    } catch (e) { /* localStorage unavailable — remember-me just won't persist */ }
  }

  // A storage adapter for supabase-js: always writes the session to
  // sessionStorage (tab-only), and mirrors it into localStorage only when
  // "remember me" is on. So leaving it unchecked keeps the login for this
  // tab alone (gone on close); checking it survives closing and reopening
  // the browser, because getItem then prefers the persisted copy.
  var hybridStorage = {
    getItem: function (key) {
      try {
        if (rememberMe()) {
          var persisted = localStorage.getItem(key);
          if (persisted !== null) return persisted;
        }
        return sessionStorage.getItem(key);
      } catch (e) { return null; }
    },
    setItem: function (key, value) {
      try {
        sessionStorage.setItem(key, value);
        if (rememberMe()) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
      } catch (e) { /* ignore */ }
    },
    removeItem: function (key) {
      try {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      } catch (e) { /* ignore */ }
    }
  };

  var client = null;
  var warnedNotConfigured = false;
  function getClient() {
    if (client) return client;
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      if (!warnedNotConfigured) {
        warnedNotConfigured = true;
        console.error("NewsAuth: Supabase isn't configured yet — fill in js/supabase-config.js (and make sure the supabase-js CDN script loads before js/auth.js). Account features are disabled until then.");
      }
      return null;
    }
    client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { storage: hybridStorage, persistSession: true, autoRefreshToken: true }
    });
    return client;
  }

  async function getSession() {
    var sb = getClient();
    if (!sb) return null;
    var result = await sb.auth.getSession();
    return result.data ? result.data.session : null;
  }

  function onAuthChange(cb) {
    var sb = getClient();
    if (!sb) return;
    sb.auth.onAuthStateChange(function (_event, session) { cb(session); });
  }

  async function signUp(email, password) {
    var sb = getClient();
    if (!sb) throw new Error("Supabase isn't configured yet.");
    var result = await sb.auth.signUp({ email: email, password: password });
    if (result.error) throw result.error;
    return result.data;
  }

  async function signIn(email, password, remember) {
    // Set the flag before signing in so the storage adapter's first
    // setItem (which happens inside signInWithPassword) already sees it.
    setRememberMe(!!remember);
    var sb = getClient();
    if (!sb) throw new Error("Supabase isn't configured yet.");
    var result = await sb.auth.signInWithPassword({ email: email, password: password });
    if (result.error) {
      setRememberMe(false);
      throw result.error;
    }
    return result.data;
  }

  async function signOut() {
    var sb = getClient();
    if (!sb) return;
    await sb.auth.signOut();
    setRememberMe(false);
  }

  async function getSubscriberRow(userId) {
    var sb = getClient();
    if (!sb) return null;
    var result = await sb.from("subscribers").select("*").eq("id", userId).single();
    if (result.error) {
      console.error("NewsAuth: couldn't load account row:", result.error.message);
      return null;
    }
    return result.data;
  }

  async function saveSubscriberRow(userId, fields) {
    var sb = getClient();
    if (!sb) throw new Error("Supabase isn't configured yet.");
    var result = await sb.from("subscribers").update(fields).eq("id", userId);
    if (result.error) throw result.error;
  }

  async function resolveMagicPrefs(token) {
    var sb = getClient();
    if (!sb) return null;
    var result = await sb.rpc("get_subscriber_by_magic_token", { token: token });
    if (result.error || !result.data || !result.data.length) return null;
    var row = result.data[0];
    return { name: row.name || "", topics: row.topics || [], city: row.city || null };
  }

  async function unsubscribeByToken(token) {
    var sb = getClient();
    if (!sb) throw new Error("Supabase isn't configured yet.");
    var result = await sb.rpc("unsubscribe_by_magic_token", { token: token });
    if (result.error) throw result.error;
    return !!result.data;
  }

  // ---------- Membership ----------

  var MEMBER_STATUSES = ["active", "trialing", "comped"];

  async function getMembership(userId) {
    var sb = getClient();
    if (!sb || !userId) return null;
    var result = await sb.from("memberships").select("status, current_period_end").eq("user_id", userId).maybeSingle();
    if (result.error) {
      console.error("NewsAuth: couldn't load membership:", result.error.message);
      return null;
    }
    var row = result.data || { status: "none", current_period_end: null };
    row.isMember = MEMBER_STATUSES.indexOf(row.status) !== -1;
    return row;
  }

  // Calls the "billing" Edge Function (supabase/functions/billing) and
  // sends the browser to the Stripe page it returns.
  async function goToBilling(action) {
    var sb = getClient();
    if (!sb) throw new Error("Supabase isn't configured yet.");
    var result = await sb.functions.invoke("billing", { body: { action: action } });
    if (result.error || !result.data || !result.data.url) {
      var message = (result.data && result.data.error) || "Couldn't reach the payment page — please try again.";
      throw new Error(message);
    }
    window.location.href = result.data.url;
  }

  function startCheckout() { return goToBilling("checkout"); }
  function openBillingPortal() { return goToBilling("portal"); }

  // ---------- Editions ----------

  // Loads the newest editions, newest first, as fully as this reader is
  // allowed: a member's magic link or a signed-in member gets full
  // editions; everyone else gets each edition's top story only.
  // Returns { editions: [...], full: boolean }.
  async function loadEditions(magicToken) {
    var sb = getClient();
    if (!sb) return { editions: [], full: false };

    if (magicToken) {
      var magic = await sb.rpc("get_editions_by_magic_token", { token: magicToken });
      if (!magic.error && magic.data && magic.data.length) {
        return { editions: magic.data, full: true };
      }
    }

    var session = await getSession();
    if (session) {
      // Row Level Security returns rows only to current members.
      var full = await sb.from("editions").select("edition").order("date", { ascending: false }).limit(30);
      if (!full.error && full.data && full.data.length) {
        return { editions: full.data.map(function (r) { return r.edition; }), full: true };
      }
    }

    var preview = await sb.rpc("get_edition_previews");
    if (preview.error) {
      console.error("NewsAuth: couldn't load editions:", preview.error.message);
      return { editions: [], full: false };
    }
    return {
      editions: (preview.data || []).map(function (r) { return { date: r.date, topStory: r.top_story }; }),
      full: false
    };
  }

  window.NewsAuth = {
    getClient: getClient,
    getSession: getSession,
    onAuthChange: onAuthChange,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    getSubscriberRow: getSubscriberRow,
    saveSubscriberRow: saveSubscriberRow,
    resolveMagicPrefs: resolveMagicPrefs,
    unsubscribeByToken: unsubscribeByToken,
    getMembership: getMembership,
    startCheckout: startCheckout,
    openBillingPortal: openBillingPortal,
    loadEditions: loadEditions,
    rememberMe: rememberMe
  };
})();
