/* ==========================================================================
   Shared site chrome: header, menu, progress, HUD, RUN/STOP, cursor lens,
   tab-title swap and the lazily loaded chat widget. Used by every page.
   ========================================================================== */
(function () {
  "use strict";

  var doc = document.documentElement;
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var fineMQ = window.matchMedia("(hover: hover) and (pointer: fine)");
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };

  /* ---------------------------------------------------------------- header */
  var header = $(".site-header");
  var progress = $(".progress span");
  var lastY = window.scrollY;
  var ticking = false;
  var menuOpen = false;

  function onScroll() {
    var y = window.scrollY;
    if (header) {
      header.classList.toggle("is-scrolled", y > 24);
      var hide = y > 320 && y > lastY + 2 && !menuOpen && !header.contains(document.activeElement);
      if (y < lastY - 2 || y < 320) header.classList.remove("is-hidden");
      else if (hide) header.classList.add("is-hidden");
    }
    if (progress) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = "scaleX(" + (max > 0 ? Math.min(1, y / max) : 0).toFixed(4) + ")";
    }
    lastY = y;
    ticking = false;
  }

  window.addEventListener("scroll", function () {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(onScroll);
    }
  }, { passive: true });
  onScroll();

  /* ------------------------------------------------------------------ menu */
  var menuBtn = $(".menu-btn");
  var menu = $("#menu");

  function setMenu(open) {
    if (!menu || !menuBtn) return;
    menuOpen = open;
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.querySelector(".menu-btn-label").textContent = open ? "Close" : "Menu";
    menu.classList.toggle("is-open", open);
    menu.setAttribute("aria-hidden", String(!open));
    if ("inert" in menu) menu.inert = !open;
    document.body.style.overflow = open ? "hidden" : "";
    if (open) {
      header.classList.remove("is-hidden");
      var first = menu.querySelector("a");
      if (first) setTimeout(function () { first.focus(); }, 60);
    }
  }

  if (menu && menuBtn) {
    if ("inert" in menu) menu.inert = true;
    menu.setAttribute("aria-hidden", "true");
    menuBtn.addEventListener("click", function () { setMenu(!menuOpen); });
    menu.addEventListener("click", function (e) {
      var a = e.target.closest("a");
      if (!a) return;
      var url = new URL(a.getAttribute("href"), window.location.href);
      var target = url.pathname === window.location.pathname && url.hash.length > 1 && document.getElementById(url.hash.slice(1));
      if (target) {
        // Closing makes the menu inert, which would cancel the link's own navigation, so scroll here.
        e.preventDefault();
        setMenu(false);
        if (window.location.hash !== url.hash) history.pushState(null, "", url.hash);
        requestAnimationFrame(function () {
          target.scrollIntoView({ behavior: reduceMQ.matches ? "auto" : "smooth", block: "start" });
          if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
        });
        return;
      }
      setTimeout(function () { setMenu(false); }, 0);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menuOpen) {
        setMenu(false);
        menuBtn.focus();
      }
    });
    window.addEventListener("resize", function () {
      if (menuOpen && window.innerWidth > 1080) setMenu(false);
    });
  }

  /* ------------------------------------------------- active nav (in-page) */
  var navLinks = $$('.nav a[href*="#"], .menu-links a[href*="#"]').filter(function (a) {
    var url = new URL(a.getAttribute("href"), window.location.href);
    return url.pathname === window.location.pathname && url.hash.length > 1;
  });
  var observed = {};
  navLinks.forEach(function (a) {
    var id = new URL(a.getAttribute("href"), window.location.href).hash.slice(1);
    var el = document.getElementById(id);
    if (el) (observed[id] = observed[id] || { el: el, links: [] }).links.push(a);
  });
  var ids = Object.keys(observed);
  if (ids.length && "IntersectionObserver" in window) {
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting; });
      var active = null;
      ids.forEach(function (id) { if (visible[id]) active = id; });
      ids.forEach(function (id) {
        observed[id].links.forEach(function (a) {
          if (id === active) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    ids.forEach(function (id) { io.observe(observed[id].el); });
  }

  /* --------------------------------------------------------- RUN / STOP */
  var runBtns = $$(".hud-run");
  function setFrozen(on, persist) {
    doc.setAttribute("data-motion", on ? "stopped" : "running");
    if (window.Scope) window.Scope.freeze(on);
    runBtns.forEach(function (btn) {
      // The accessible name starts with the visible word (WCAG 2.5.3), then says what pressing does.
      btn.setAttribute("data-stopped", String(on));
      var label = btn.querySelector(".hud-run-label");
      if (label) label.textContent = on ? "Stopped" : "Running";
      btn.setAttribute("aria-label", on ? "Stopped. Resume background animation" : "Running. Pause background animation");
      btn.title = on ? "Resume background animation" : "Pause background animation";
    });
    if (persist) store.set("scope-stopped", on ? "1" : "0");
    document.dispatchEvent(new CustomEvent("scope:motion", { detail: { stopped: on } }));
  }
  setFrozen(store.get("scope-stopped") === "1", false);
  runBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setFrozen(btn.getAttribute("data-stopped") !== "true", true);
    });
  });

  /* ------------------------------------------- HUD readouts + glow follow */
  var hud = {
    ch: $("[data-hud-ch]"),
    ratio: $("[data-hud-ratio]"),
    phase: $("[data-hud-phase]"),
    mode: $("[data-hud-mode]"),
    time: $("[data-hud-time]")
  };
  var glow = $(".bg-glow");
  var lastRGB = "";

  function fmt(n, d) { return (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(d); }

  function onHud(s, clock) {
    // Quantised so the root custom property (which restyles the page) changes rarely.
    var q = function (v) { return Math.min(255, Math.round(v / 6) * 6); };
    var rgb = q(s.cr) + " " + q(s.cg) + " " + q(s.cb);
    if (rgb !== lastRGB) {
      lastRGB = rgb;
      doc.style.setProperty("--glow-rgb", rgb);
    }
    if (glow) {
      var gx = (s.cx * 100).toFixed(1), gy = (s.cy * 100).toFixed(1);
      glow.style.transform = "translate3d(" + gx + "vw," + gy + "vh,0) scale(" + (0.5 + s.intensity * 0.6).toFixed(3) + ")";
      glow.style.opacity = Math.min(1, 0.25 + s.intensity * 0.75).toFixed(3);
    }
    if (hud.ch && s.label) hud.ch.textContent = s.label;
    if (hud.ratio) hud.ratio.textContent = s.a.toFixed(2) + ":" + s.b.toFixed(2);
    if (hud.phase) {
      var ph = ((s.phase + Math.sin(clock * 0.21) * 0.55 * s.spin) % (Math.PI * 2));
      hud.phase.textContent = "φ " + fmt(ph, 2);
    }
    if (hud.mode) hud.mode.textContent = s.yt > 0.5 ? "YT" : "XY";
    if (hud.time) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      hud.time.textContent = "T " + String(Math.round(max > 0 ? (window.scrollY / max) * 100 : 0)).padStart(3, "0") + "%";
    }
  }

  window.Site = window.Site || {};
  window.Site.startScope = function (opts) {
    if (!window.Scope) return false;
    var ok = window.Scope.init(opts);
    if (!ok) return false;
    window.Scope.onHud(onHud);
    window.Scope.freeze(doc.getAttribute("data-motion") === "stopped");
    return true;
  };
  window.Site.reduced = function () { return reduceMQ.matches; };
  window.Site.fine = function () { return fineMQ.matches; };

  /* ------------------------------------------------------- cursor lens */
  var lens = $(".bg-lens");
  var lensInner = $(".bg-lens-inner");
  if (lens && lensInner && fineMQ.matches && !reduceMQ.matches) {
    var mx = -999, my = -999, lx = -999, ly = -999, lensRaf = 0;
    var R = 220;
    var tickLens = function () {
      lensRaf = 0;
      lx += (mx - lx) * 0.2;
      ly += (my - ly) * 0.2;
      lens.style.transform = "translate3d(" + (lx - R).toFixed(1) + "px," + (ly - R).toFixed(1) + "px,0)";
      lensInner.style.transform = "translate3d(" + (R - lx).toFixed(1) + "px," + (R - ly).toFixed(1) + "px,0)";
      if (Math.abs(mx - lx) + Math.abs(my - ly) > 0.5) lensRaf = requestAnimationFrame(tickLens);
    };
    window.addEventListener("pointermove", function (e) {
      if (lx < -900) { lx = e.clientX; ly = e.clientY; }
      mx = e.clientX;
      my = e.clientY;
      lens.classList.add("is-on");
      if (!lensRaf) lensRaf = requestAnimationFrame(tickLens);
    }, { passive: true });
    document.addEventListener("pointerleave", function () { lens.classList.remove("is-on"); });
    window.addEventListener("blur", function () { lens.classList.remove("is-on"); });
  }

  /* ---------------------------------------------------- magnetic targets */
  if (fineMQ.matches && !reduceMQ.matches) {
    $$("[data-magnetic]").forEach(function (el) {
      var strength = parseFloat(el.getAttribute("data-magnetic")) || 0.25;
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = "translate3d(" + (dx * strength).toFixed(1) + "px," + (dy * strength).toFixed(1) + "px,0)";
      });
      el.addEventListener("pointerleave", function () {
        el.style.transition = "transform 0.6s cubic-bezier(.16,1,.3,1)";
        el.style.transform = "";
        setTimeout(function () { el.style.transition = ""; }, 600);
      });
    });
  }

  /* ------------------------------------------------------------ rewind */
  $$("[data-rewind]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reduceMQ.matches ? "auto" : "smooth" });
      var target = document.getElementById(btn.getAttribute("data-rewind")) || $("h1");
      if (target) {
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        setTimeout(function () { target.focus({ preventScroll: true }); }, reduceMQ.matches ? 0 : 700);
      }
    });
  });

  /* ---------------------------------------------------------- footer year */
  $$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* --------------------------------------------- tab title while away */
  var favicon = $("#favicon");
  var baseTitle = document.title;
  var baseIcon = favicon ? favicon.getAttribute("href") : null;
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      document.title = baseTitle;
      if (favicon && baseIcon) favicon.setAttribute("href", baseIcon);
    } else {
      baseTitle = document.title;
      document.title = "Come Back To Portfolio";
      if (favicon) favicon.setAttribute("href", "/assets/images/favhand.png");
    }
  });

  /* ------------------------------------------- Tawk.to chat, loaded late */
  function loadTawk() {
    if (window.Tawk_API && window.Tawk_API.loaded) return;
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();
    var s1 = document.createElement("script");
    s1.async = true;
    s1.src = "https://embed.tawk.to/676ab3c3af5bfec1dbe11e4e/1ifscsdoh";
    s1.charset = "UTF-8";
    s1.setAttribute("crossorigin", "*");
    document.body.appendChild(s1);
  }
  // The chat widget loads on the visitor's first interaction, so it never competes with the first render.
  window.addEventListener("load", function () {
    var events = ["pointerdown", "keydown", "scroll", "touchstart"];
    var go = function () {
      events.forEach(function (ev) { window.removeEventListener(ev, go); });
      var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1); };
      setTimeout(function () { idle(loadTawk); }, 1500);
    };
    events.forEach(function (ev) { window.addEventListener(ev, go, { passive: true }); });
  });
})();
