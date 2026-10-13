/* ==========================================================================
   Homepage choreography.
   1. The oscilloscope's state is a pure function of scroll position: each
      [data-scene] section has a target signal, and we blend between them as
      sections enter. Scrolling back up replays the same states in reverse.
   2. GSAP + ScrollTrigger handle reveals, the pinned timeline and scrubbed
      transforms. Everything is created inside gsap.matchMedia so it is torn
      down and rebuilt when the layout or motion preference changes.
   3. Content is in the HTML; if GSAP fails to load, the page still works.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var doc = document.documentElement;
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var hasGSAP = !!(window.gsap && window.ScrollTrigger);
  var TAU = Math.PI * 2;

  var CH1 = [255, 181, 71], CH2 = [92, 225, 255], CH3 = [255, 95, 162], CH4 = [164, 147, 255], CHM = [124, 240, 168];

  /* ------------------------------------------------------------ text splitting */

  // Wraps every word of el (recursing into inline children such as <em>) in a masked span.
  function splitWords(el, withChars) {
    if (el.dataset.splitDone) return $$(withChars ? ".char" : ".word", el);
    el.dataset.splitDone = "1";
    var label = el.textContent.replace(/\s+/g, " ").trim();
    var walk = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var parts = child.textContent.split(/(\s+)/);
          var frag = document.createDocumentFragment();
          parts.forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(" "));
              return;
            }
            var mask = document.createElement("span");
            mask.className = "word-mask";
            var word = document.createElement("span");
            word.className = "word";
            if (withChars) {
              Array.prototype.forEach.call(part, function (c) {
                var ch = document.createElement("span");
                ch.className = "char";
                ch.textContent = c;
                word.appendChild(ch);
              });
            } else {
              word.textContent = part;
            }
            mask.appendChild(word);
            frag.appendChild(mask);
          });
          child.parentNode.replaceChild(frag, child);
        } else if (child.nodeType === 1 && !child.classList.contains("visually-hidden")) {
          walk(child);
        }
      });
    };
    if (withChars) {
      // Screen readers get the plain text once; the split letters are hidden from them.
      var inner = document.createElement("span");
      inner.setAttribute("aria-hidden", "true");
      while (el.firstChild) inner.appendChild(el.firstChild);
      el.appendChild(inner);
      var sr = document.createElement("span");
      sr.className = "visually-hidden";
      sr.textContent = label;
      el.appendChild(sr);
      walk(inner);
    } else {
      walk(el);
    }
    return $$(withChars ? ".char" : ".word", el);
  }

  /* --------------------------------------------------------------- the scope */

  var front = $("#scope-front");
  var started = false;
  var bootAt = 0;
  var intro = { draw: reduceMQ.matches ? 1 : 0 };
  var scenes = [];
  var anchors = { portrait: null, xpLine: 0, xpRailX: 24, titleBottom: 0 };
  var xpTrigger = null;

  var BASE = {
    a: 1, b: 2, beta: 0, phase: 0, tilt: 0.34, yt: 0, k: 5, amp: 0.05,
    cx: 0.5, cy: 0.5, sx: 0.4, sy: 0.24, cr: 255, cg: 181, cb: 71,
    intensity: 1, draw: 1, noise: 0, front: 0, spin: 1, ribbon: 1, lock: 0, vt: 0, label: "CH1"
  };

  function S(partial, rgb) {
    var o = {};
    for (var k in BASE) o[k] = BASE[k];
    for (k in partial) o[k] = partial[k];
    if (rgb) { o.cr = rgb[0]; o.cg = rgb[1]; o.cb = rgb[2]; }
    return o;
  }

  function sceneState(name, s) {
    var W = window.innerWidth, H = window.innerHeight, M = Math.min(W, H);
    var mob = W <= 900;
    var p;
    switch (name) {
      case "hero":
        return S({
          a: 1, b: 2, tilt: 0.34,
          cx: mob ? 0.5 : 0.6, cy: (mob ? 0.34 : 0.47) - Math.min(1, s / H) * 0.28,
          sx: mob ? 0.47 : 0.62, sy: mob ? 0.27 : 0.3,
          intensity: 1, front: !mob && s < H * 0.32 ? 1 : 0, ribbon: 1.2, label: "CH1"
        }, CH1);
      case "about":
        p = anchors.portrait;
        if (!p) return S({ a: 1, b: 1, beta: TAU / 4, label: "CH1" }, CH1);
        var r = (p.r * 1.12) / M;
        return S({
          a: 1, b: 1, beta: TAU / 4, tilt: 0.18,
          cx: p.x / W, cy: (p.y - s) / H, sx: r, sy: r,
          intensity: 0.8, ribbon: 0.8, label: "CH1"
        }, CH1);
      case "experience":
        if (mob) {
          // Phones: the waveform runs down the vertical timeline rail.
          return S({ yt: 1, vt: 1, k: 3, amp: 0.022, cx: anchors.xpRailX / W, cy: 0.5, intensity: 0.85, ribbon: 0, label: "CH2" }, CH2);
        }
        var y = 0.32 * H;
        if (xpTrigger) {
          if (s < xpTrigger.start) y = anchors.xpLine + (xpTrigger.start - s);
          else if (s <= xpTrigger.end) y = anchors.xpLine;
          else y = anchors.xpLine - (s - xpTrigger.end);
        }
        return S({ yt: 1, k: 4.5, amp: 0.034, cy: y / H, intensity: 0.95, ribbon: 0, label: "CH2" }, CH2);
      case "stack":
        return S({
          a: 3, b: 4, beta: 0.3, tilt: 0.5,
          cx: mob ? 0.5 : 0.27, cy: mob ? 0.3 : 0.52, sx: mob ? 0.42 : 0.3, sy: mob ? 0.42 : 0.3,
          intensity: mob ? 0.24 : 0.5, label: "CH3"
        }, CH3);
      case "work":
        return S({ a: 1, b: 1, beta: TAU / 4, tilt: 1.05, cx: 0.5, cy: 0.55, sx: mob ? 0.9 : 0.95, sy: mob ? 0.9 : 0.55, intensity: mob ? 0.3 : 0.5, label: "CH4" }, CH4);
      case "tokins":
        return S({ a: 2, b: 3, tilt: 0.4, cx: mob ? 0.5 : 0.68, cy: 0.5, sx: mob ? 0.45 : 0.42, sy: 0.32, intensity: mob ? 0.2 : 0.38, label: "CH2" }, CH2);
      case "chills":
        return S({ a: 3, b: 2, tilt: 0.36, cx: mob ? 0.5 : 0.34, cy: 0.5, sx: mob ? 0.45 : 0.38, sy: 0.32, intensity: mob ? 0.2 : 0.36, label: "CH4" }, CH4);
      case "vision":
        return S({ a: 1, b: 1, beta: TAU / 4, tilt: 0.22, cx: mob ? 0.5 : 0.34, cy: 0.5, sx: mob ? 0.48 : 0.44, sy: mob ? 0.3 : 0.32, intensity: mob ? 0.22 : 0.45, label: "CH1" }, CH1);
      case "lastone":
        return S({ a: 1, b: 3, tilt: 0.3, cx: mob ? 0.5 : 0.3, cy: 0.5, sx: mob ? 0.42 : 0.3, sy: mob ? 0.32 : 0.38, intensity: mob ? 0.24 : 0.45, label: "MATH" }, CHM);
      case "lab":
        return S({ a: 2, b: 1, tilt: 0.3, cx: 0.5, cy: 0.5, sx: 0.32, sy: 0.46, intensity: 0.2, ribbon: 0.4, label: "CH3" }, CH3);
      case "more":
        return S({ a: 3, b: 2, tilt: 0.4, cx: mob ? 0.5 : 0.84, cy: 0.5, sx: 0.22, sy: 0.22, intensity: mob ? 0.18 : 0.3, label: "CH4" }, CH4);
      case "creds":
        return S({ a: 3, b: 2, tilt: 0.36, cx: mob ? 0.5 : 0.8, cy: 0.42, sx: mob ? 0.4 : 0.26, sy: mob ? 0.3 : 0.3, intensity: mob ? 0.28 : 0.55, label: "CH1" }, CH1);
      case "contact":
        return S({ a: 1, b: 2, tilt: 0.3, cx: mob ? 0.5 : 0.64, cy: mob ? 0.3 : 0.4, sx: mob ? 0.46 : 0.5, sy: mob ? 0.26 : 0.27, intensity: 1.05, ribbon: 1.5, lock: 1, label: "CH1" }, CH1);
    }
    return S({}, CH1);
  }

  function measure() {
    var sy = window.scrollY;
    scenes = $$("[data-scene]").map(function (el) {
      var top = el.getBoundingClientRect().top + sy;
      if (el.id === "experience" && xpTrigger) top = xpTrigger.start;
      return { name: el.getAttribute("data-scene"), top: top };
    }).sort(function (a, b) { return a.top - b.top; });

    var portrait = $("#about-portrait .portrait-frame");
    if (portrait) {
      var pr = portrait.getBoundingClientRect();
      anchors.portrait = { x: pr.left + pr.width / 2, y: pr.top + sy + pr.height / 2, r: Math.max(pr.width, pr.height) / 2 };
    }
    var title = $(".hero-title");
    if (title) anchors.titleBottom = title.getBoundingClientRect().bottom + sy;
    var xp = $("#experience"), track = $(".xp-track");
    if (xp && track) anchors.xpLine = track.getBoundingClientRect().top - xp.getBoundingClientRect().top;
    if (track) {
      // The mobile rail is drawn by .xp-track::before at padding-left + 5px (items themselves may be mid-reveal).
      anchors.xpRailX = track.getBoundingClientRect().left + parseFloat(getComputedStyle(track).paddingLeft) + 5.5;
    }
    if (started) window.Scope.wake();
  }

  var blended = S({}, CH1);
  var KEYS = Object.keys(BASE).filter(function (k) { return k !== "label"; });

  function smooth(k) { return k * k * (3 - 2 * k); }

  function driver(target) {
    var s = window.scrollY;
    var H = window.innerHeight;
    var step = reduceMQ.matches;
    if (!scenes.length) return;
    var out = sceneState(scenes[0].name, s);
    for (var i = 1; i < scenes.length; i++) {
      var start = scenes[i].top - H * 0.85;
      var end = scenes[i].top - H * 0.22;
      var k = (s - start) / (end - start);
      if (k <= 0) break;
      k = k >= 1 ? 1 : step ? (k >= 0.5 ? 1 : 0) : smooth(k);
      var to = sceneState(scenes[i].name, s);
      for (var j = 0; j < KEYS.length; j++) {
        var key = KEYS[j];
        out[key] += (to[key] - out[key]) * k;
      }
      if (k > 0.5) out.label = to.label;
    }
    // Scrolling turns the figure; the closing scene "locks" it back to a clean infinity.
    out.phase += step ? 0 : (s / H) * 0.35 * (1 - out.lock);
    // Power-on: the beam draws the figure in over ~2 s after the scope starts.
    if (intro.draw < 1) intro.draw = Math.min(1, (performance.now() - bootAt) / 2200);
    out.draw = Math.min(out.draw, intro.draw * intro.draw * (3 - 2 * intro.draw));
    out.frontY = anchors.titleBottom ? anchors.titleBottom - s : 0;
    for (var key2 in out) target[key2] = out[key2];
    blended = out;
  }

  // The oscilloscope is decoration, so it starts once the page has loaded and the main thread is idle.
  function bootScope() {
    if (started || !window.Site) return;
    started = window.Site.startScope({
      canvas: $("#scope"),
      front: front,
      from: { draw: reduceMQ.matches ? 1 : 0, intensity: reduceMQ.matches ? 1 : 0.2 }
    });
    if (!started) return;
    bootAt = performance.now();
    measure();
    window.Scope.setDriver(driver);
    window.addEventListener("resize", debounce(measure, 150));
  }
  var idle = function (fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 900 });
    else setTimeout(fn, 200);
  };
  if (document.readyState === "complete") idle(bootScope);
  else window.addEventListener("load", function () { idle(bootScope); });

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  /* ---------------------------------------------------------------- counters */

  function setCount(el, v) {
    var dec = parseInt(el.getAttribute("data-decimals") || "0", 10);
    el.textContent = v.toFixed(dec);
  }

  function countUp(el) {
    var end = parseFloat(el.getAttribute("data-count"));
    if (!hasGSAP || reduceMQ.matches) { setCount(el, end); return; }
    var o = { v: 0 };
    gsap.to(o, { v: end, duration: 1.8, ease: "power3.out", overwrite: true, onUpdate: function () { setCount(el, o.v); } });
  }

  function counter(el) {
    setCount(el, 0);
    ScrollTrigger.create({
      trigger: el, start: "top 88%",
      onEnter: function () { countUp(el); },
      onLeaveBack: function () { gsap.killTweensOf(el); setCount(el, 0); }
    });
  }

  /* ============================================================ GSAP scenes */

  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    ScrollTrigger.addEventListener("refresh", measure);

    // Shared reveals for a section's kicker, display lines and project titles.
    var revealIn = function (root) {
      $$(".kicker", root).forEach(function (el) {
        gsap.from(el, {
          opacity: 0, x: -24, duration: 0.9, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 90%", toggleActions: "play none none reverse" }
        });
      });
      $$("[data-split='lines']", root).forEach(function (el) {
        gsap.from(splitWords(el, false), {
          yPercent: 115, duration: 1.1, ease: "expo.out", stagger: 0.04,
          scrollTrigger: { trigger: el, start: "top 86%", toggleActions: "play none none reverse" }
        });
      });
      $$(".project-title", root).forEach(function (el) {
        gsap.from(splitWords(el, true), {
          yPercent: 115, duration: 1.2, ease: "expo.out", stagger: 0.03,
          scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none reverse" }
        });
      });
    };

    var mm = gsap.matchMedia();

    mm.add({
      desktop: "(min-width: 901px)",
      mobile: "(max-width: 900px)",
      motion: "(prefers-reduced-motion: no-preference)"
    }, function (ctx) {
      var desktop = ctx.conditions.desktop;
      var motion = ctx.conditions.motion;

      if (!motion) {
        $$("[data-count]").forEach(function (el) { setCount(el, parseFloat(el.getAttribute("data-count"))); });
        return;
      }

      var observers = [];
      var cleanups = [];

      // Builds a section's scroll scenes only when it comes within ~1.5 screens of the viewport,
      // so the first load does not pay for scenes the visitor may never reach.
      var whenNear = function (el, build) {
        if (!el) return;
        var io = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              io.disconnect();
              ctx.add(build);
              return;
            }
          }
        }, { rootMargin: "150% 0px 150% 0px" });
        io.observe(el);
        observers.push(io);
      };

      /* ------------------------------------------------------- hero exit */
      gsap.timeline({
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true }
      })
        .to(".hero-line--first", { "--wdth": 62, xPercent: desktop ? -4 : 0, opacity: 0.12, ease: "none" }, 0)
        .to(".hero-line--last", { xPercent: desktop ? 8 : 4, opacity: 0.12, ease: "none" }, 0)
        .to(".hero-foot, .hero-meas", { y: -80, opacity: 0, ease: "none" }, 0)
        .to(".hero-eyebrow", { y: -20, opacity: 0, duration: 0.06, ease: "none" }, 0)
        .to(".scroll-cue", { opacity: 0, duration: 0.15, ease: "none" }, 0);

      /* ------------------------------------------------------- experience */
      // The desktop pin is built up front: it adds scroll length that every later trigger depends on.
      var xp = $("#experience");
      var track = $(".xp-track");
      var items = $$(".xp-item");

      if (desktop && xp && track) {
        xp.classList.add("is-pinned");
        var dist = function () { return Math.max(0, track.scrollWidth - document.documentElement.clientWidth); };
        var xpTween = gsap.to(track, {
          x: function () { return -dist(); },
          ease: "none",
          scrollTrigger: {
            trigger: xp,
            start: "top top",
            end: function () { return "+=" + (dist() + window.innerHeight * 0.35); },
            pin: true,
            scrub: 0.6,
            anticipatePin: 1,
            invalidateOnRefresh: true
          }
        });
        xpTrigger = xpTween.scrollTrigger;

        items.forEach(function (item) {
          ScrollTrigger.create({
            trigger: item, containerAnimation: xpTween,
            start: "left 62%", end: "right 38%",
            toggleClass: { targets: item, className: "is-active" }
          });
          gsap.from(item.querySelectorAll(".xp-when, .xp-org, .xp-role, .xp-points li, .xp-tech"), {
            x: 90, ease: "none", stagger: 0.08,
            scrollTrigger: { trigger: item, containerAnimation: xpTween, start: "left 100%", end: "left 62%", scrub: true }
          });
        });

        // Keyboard users tabbing into an off-screen panel: scroll the page to it.
        var onFocus = function (e) {
          var item = e.target.closest(".xp-item");
          if (!item || !xpTrigger) return;
          var p = Math.min(1, item.offsetLeft / Math.max(1, track.scrollWidth - document.documentElement.clientWidth));
          window.scrollTo({ top: xpTrigger.start + p * (xpTrigger.end - xpTrigger.start - window.innerHeight * 0.35), behavior: "auto" });
        };
        track.addEventListener("focusin", onFocus);
        revealIn(xp);

        cleanups.push(function () {
          xp.classList.remove("is-pinned");
          track.removeEventListener("focusin", onFocus);
          xpTrigger = null;
          items.forEach(function (i) { i.classList.remove("is-active"); });
        });
      } else {
        whenNear(xp, function () {
          revealIn(xp);
          items.forEach(function (item) {
            gsap.from(item, {
              opacity: 0, x: -24, duration: 0.9, ease: "power3.out",
              scrollTrigger: { trigger: item, start: "top 85%", toggleActions: "play none none reverse" }
            });
            ScrollTrigger.create({ trigger: item, start: "top 60%", end: "bottom 40%", toggleClass: { targets: item, className: "is-active" } });
          });
        });
      }

      /* ------------------------------------------------------------ about */
      whenNear($(".about"), function () {
        revealIn($(".about"));
        // A reading highlight that stays above WCAG AA contrast at every step: dim ink to full ink.
        var words = splitWords($(".statement"), false);
        gsap.fromTo(words, { color: "#8a877f" }, {
          color: function (i, el) { return el.closest("em") ? "#ffb547" : "#eeebe3"; },
          ease: "none", stagger: 0.1,
          scrollTrigger: { trigger: ".statement", start: "top 78%", end: "bottom 42%", scrub: true }
        });
        gsap.fromTo(".portrait-frame", { clipPath: "inset(100% 0% 0% 0%)" }, {
          clipPath: "inset(0% 0% 0% 0%)", ease: "none",
          scrollTrigger: { trigger: ".portrait", start: "top 88%", end: "top 38%", scrub: true }
        });
        gsap.fromTo(".portrait-frame img", { scale: 1.3 }, {
          scale: 1, ease: "none",
          scrollTrigger: { trigger: ".portrait", start: "top 88%", end: "bottom 30%", scrub: true }
        });
        gsap.from(".about-body p, .facts > div", {
          opacity: 0, y: 26, duration: 0.9, ease: "power3.out", stagger: 0.06,
          scrollTrigger: { trigger: ".about-body", start: "top 85%", toggleActions: "play none none reverse" }
        });
      });

      /* ------------------------------------------------------------ stack */
      whenNear($(".stack"), function () {
        revealIn($(".stack"));
        var planes = $$(".plane");
        var layers = $$(".layer");
        var readout = $("[data-stack-readout]");
        var setLayer = function (i) {
          planes.forEach(function (p, j) { p.classList.toggle("is-active", j === i); });
          layers.forEach(function (l, j) { l.classList.toggle("is-active", j === i); });
          if (readout) readout.textContent = planes[i] ? planes[i].querySelector(".plane-label").textContent : "";
        };
        setLayer(0);
        layers.forEach(function (layer, i) {
          ScrollTrigger.create({
            trigger: layer, start: "top 58%", end: "bottom 58%",
            onEnter: function () { setLayer(i); },
            onEnterBack: function () { setLayer(i); }
          });
          gsap.from(layer.children, {
            opacity: 0, y: 24, stagger: 0.06, duration: 0.8, ease: "power3.out",
            scrollTrigger: { trigger: layer, start: "top 80%", toggleActions: "play none none reverse" }
          });
        });
        gsap.fromTo(".stack-3d", { "--gap": "6px", "--rz": "-24deg", "--rx": "62deg" }, {
          "--gap": "50px", "--rz": "-52deg", "--rx": "56deg", ease: "none",
          scrollTrigger: { trigger: ".stack-grid", start: "top 75%", end: "bottom 70%", scrub: true }
        });
      });

      /* ------------------------------------------------------------- work */
      whenNear($(".work-intro"), function () {
        revealIn($(".work-intro"));
        gsap.fromTo(".work-marquee", { xPercent: 4 }, {
          xPercent: -38, ease: "none",
          scrollTrigger: { trigger: ".work-intro", start: "top bottom", end: "bottom top", scrub: true }
        });
      });

      $$(".project").forEach(function (proj) {
        whenNear(proj, function () {
          revealIn(proj);
          gsap.from(proj.querySelectorAll(".project-meta, .project-sub, .project-body, .stats, .project-tech, .project-links, .lastone-flow"), {
            opacity: 0, y: 30, duration: 1, ease: "power3.out", stagger: 0.07,
            scrollTrigger: { trigger: proj, start: "top 72%", toggleActions: "play none none reverse" }
          });
          $$("[data-count]", proj).forEach(counter);

          if (proj.id === "tokins") {
            gsap.fromTo(".browser", { rotateX: 24, y: 90, scale: 0.9, transformPerspective: 1400 }, {
              rotateX: 0, y: 0, scale: 1, ease: "none",
              scrollTrigger: { trigger: proj, start: "top 90%", end: "center 55%", scrub: true }
            });
          } else if (proj.id === "chills") {
            gsap.from(".latex [data-ln]", {
              opacity: 0, x: -30, ease: "none", stagger: 0.3,
              scrollTrigger: { trigger: ".latex", start: "top 80%", end: "top 30%", scrub: true }
            });
            ScrollTrigger.create({
              trigger: ".latex", start: "top 35%",
              toggleClass: { targets: ".ln--block", className: "is-flagged" }
            });
          } else if (proj.id === "vision") {
            gsap.fromTo(".vf-box", { strokeDashoffset: 420 }, {
              strokeDashoffset: 0, ease: "none", stagger: 0.15,
              scrollTrigger: { trigger: ".vision-feed", start: "top 80%", end: "center 50%", scrub: true }
            });
            gsap.fromTo(".vf-hud", { scale: 1.12, transformOrigin: "50% 50%", opacity: 0 }, {
              scale: 1, opacity: 1, ease: "none",
              scrollTrigger: { trigger: ".vision-feed", start: "top 85%", end: "top 40%", scrub: true }
            });
          } else if (proj.id === "lastone") {
            gsap.fromTo(".lastone-num", { "--fill": "0%" }, {
              "--fill": "100%", ease: "none",
              scrollTrigger: { trigger: proj, start: "top 75%", end: "center 45%", scrub: true }
            });
          }
        });
      });

      /* ------------------------------------------------ lab, more, creds */
      whenNear($(".lab"), function () {
        revealIn($(".lab"));
        gsap.from(".router", {
          opacity: 0, y: 60, duration: 1.1, ease: "power3.out",
          scrollTrigger: { trigger: ".router", start: "top 85%", toggleActions: "play none none reverse" }
        });
      });

      whenNear($(".more"), function () {
        revealIn($(".more"));
        gsap.from(".more-row", {
          opacity: 0, y: 24, duration: 0.8, ease: "power3.out", stagger: 0.06,
          scrollTrigger: { trigger: ".more-list", start: "top 85%", toggleActions: "play none none reverse" }
        });
      });

      whenNear($(".creds"), function () {
        revealIn($(".creds"));
        $$("[data-count]", $(".creds")).forEach(counter);
        gsap.from(".ledger li", {
          opacity: 0, x: -30, duration: 0.8, ease: "power3.out", stagger: 0.07,
          scrollTrigger: { trigger: ".ledger", start: "top 85%", toggleActions: "play none none reverse" }
        });
        gsap.from(".pub, .edu-degree, .edu-school, .edu-course", {
          opacity: 0, y: 30, duration: 1, ease: "power3.out", stagger: 0.08,
          scrollTrigger: { trigger: ".creds-grid", start: "top 80%", toggleActions: "play none none reverse" }
        });
      });

      /* ----------------------------------------------------------- contact */
      whenNear($(".contact"), function () {
        revealIn($(".contact"));
        gsap.from(".contact-direct > *, .contact-form", {
          opacity: 0, y: 36, duration: 1, ease: "power3.out", stagger: 0.08,
          scrollTrigger: { trigger: ".contact-grid", start: "top 85%", toggleActions: "play none none reverse" }
        });
      });

      return function () {
        observers.forEach(function (io) { io.disconnect(); });
        cleanups.forEach(function (fn) { fn(); });
      };
    });

    // Fonts that arrive after first layout change line lengths and section heights.
    if (document.fonts && document.fonts.status !== "loaded") {
      document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
  }

  /* ========================================================= LLM router lab */

  (function initRouter() {
    var root = $("[data-router]");
    if (!root) return;
    var svg = $(".router-diagram svg", root);
    var packet = $(".r-packet", svg);
    var log = $("[data-router-log]", root);
    var status = $("[data-router-status]", root);
    var runBtn = $("[data-router-run]", root);
    var MODELS = {
      openrouter: "openrouter/free",
      gemini: "gemini-2.5-flash",
      sambanova: "Meta-Llama-3.3-70B-Instruct",
      cerebras: "gpt-oss-120b",
      puter: "claude-sonnet-4-6"
    };
    var running = false;

    var edge = function (n) { return $('[data-edge="' + n + '"]', svg); };
    var node = function (n) { return $('[data-node="' + n + '"]', svg); };
    var val = function (name) { var c = $('input[name="' + name + '"]:checked', root); return c ? c.value : ""; };
    var fast = function () { return reduceMQ.matches; };

    function setNode(n, cls) {
      var el = node(n);
      if (!el) return;
      el.classList.remove("is-active", "is-error", "is-ok", "is-wait");
      if (cls) el.classList.add(cls);
    }

    function markSelected() {
      var p = val("provider");
      Object.keys(MODELS).forEach(function (k) { node(k).classList.toggle("is-selected", k === p); });
    }
    root.addEventListener("change", markSelected);
    markSelected();

    function line(text, cls) {
      var li = document.createElement("li");
      li.textContent = text;
      if (cls) li.className = cls;
      log.appendChild(li);
      log.scrollTop = log.scrollHeight;
    }

    function wait(ms) {
      return new Promise(function (r) { setTimeout(r, fast() ? Math.min(ms, 60) : ms); });
    }

    function travel(path, dur) {
      dur = fast() ? 0 : dur || 560;
      return new Promise(function (resolve) {
        var len = path.getTotalLength();
        path.classList.add("is-hot");
        packet.classList.add("is-on");
        var t0 = performance.now();
        (function frame(now) {
          var k = dur ? Math.min(1, (now - t0) / dur) : 1;
          var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          var pt = path.getPointAtLength(e * len);
          packet.setAttribute("cx", pt.x);
          packet.setAttribute("cy", pt.y);
          if (k < 1) requestAnimationFrame(frame);
          else { path.classList.remove("is-hot"); resolve(); }
        })(t0);
      });
    }

    function countdown(ms) {
      // A real 5 s backoff, shown 10× faster.
      var shown = ms / 10;
      var t0 = performance.now();
      return new Promise(function (resolve) {
        (function tick(now) {
          var left = Math.max(0, ms - (now - t0) * 10);
          status.textContent = "Backoff · " + (left / 1000).toFixed(1) + " s";
          if (now - t0 < shown && !fast()) requestAnimationFrame(tick);
          else resolve();
        })(t0);
      });
    }

    async function run() {
      if (running) return;
      running = true;
      runBtn.setAttribute("aria-disabled", "true");
      var prov = val("provider");
      var fault = val("fault");
      ["prompt", "router", "gate", "json"].concat(Object.keys(MODELS)).forEach(function (n) { setNode(n, ""); });
      log.innerHTML = "";
      status.textContent = "Running";

      line("→ generateContent(prompt, { provider: '" + prov + "' })", "is-dim");
      setNode("prompt", "is-active");
      await travel(edge("in"));
      setNode("prompt", "is-ok");
      setNode("router", "is-active");
      line("[router] model = " + MODELS[prov]);

      var attempt = 0;
      for (;;) {
        attempt++;
        await travel(edge("p-" + prov));
        setNode("router", "is-ok");
        setNode(prov, "is-active");
        status.textContent = "Attempt " + attempt;
        await wait(420);

        if (fault === "429" && attempt === 1) {
          setNode(prov, "is-error");
          line("[" + prov + "] Attempt 1 failed: 429 Too Many Requests", "is-err");
          line("[rate-limit] 429 detected, waiting 5s (attempt 1)", "is-warn");
          setNode(prov, "is-wait");
          await countdown(5000);
          setNode(prov, "");
          setNode("router", "is-active");
          line("No Retry-After header, so exponential backoff: 5s, 10s, 20s, 40s.", "is-dim");
          continue;
        }

        await travel(edge("g-" + prov));
        setNode(prov, "is-ok");
        setNode("gate", "is-active");
        await wait(360);

        if (fault === "weak" && attempt === 1) {
          setNode("gate", "is-error");
          line("[" + prov + "] Attempt 1: weak/empty response (23 chars)", "is-warn");
          line("isValidResponse() needs 50+ chars and no refusal. Weak replies retry without a delay.", "is-dim");
          await travel(edge("retry"), 900);
          setNode("gate", "");
          setNode(prov, "");
          continue;
        }

        setNode("gate", "is-ok");
        line(prov === "openrouter"
          ? "[openrouter] Success on attempt " + attempt + " (1842 chars)"
          : "[" + prov + "] valid response on attempt " + attempt, "is-ok");
        break;
      }

      await travel(edge("out"), 360);
      setNode("json", "is-active");
      await wait(360);
      if (fault === "json") {
        setNode("json", "is-error");
        line("First JSON parse failed, attempting recovery: Unterminated string in JSON", "is-warn");
        await wait(520);
        line("Recovery: close the open string, strip the trailing comma, balance 1 ] and 2 }.", "is-dim");
        await wait(520);
      }
      setNode("json", "is-ok");
      line("JSON.parse ok → { name, skills[], experience[], projects[], … }", "is-ok");
      status.textContent = "Resolved in " + attempt + (attempt === 1 ? " attempt" : " attempts");
      packet.classList.remove("is-on");
      running = false;
      runBtn.removeAttribute("aria-disabled");
    }

    runBtn.addEventListener("click", run);
  })();

  /* ======================================================= more: preview */

  (function initPreview() {
    var box = $(".more-preview");
    if (!box || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    var img = $("img", box);
    var x = 0, y = 0, tx = 0, ty = 0, raf = 0, on = false;
    function tick() {
      raf = 0;
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      box.style.transform = "translate3d(" + (x + 28).toFixed(1) + "px," + (y - 90).toFixed(1) + "px,0)";
      if (on && (Math.abs(tx - x) + Math.abs(ty - y) > 0.4)) raf = requestAnimationFrame(tick);
    }
    $$(".more-row[data-preview]").forEach(function (row) {
      row.addEventListener("pointerenter", function (e) {
        img.src = row.getAttribute("data-preview");
        x = tx = e.clientX;
        y = ty = e.clientY;
        on = true;
        box.classList.add("is-on");
        tick();
      });
      row.addEventListener("pointermove", function (e) {
        tx = e.clientX;
        ty = e.clientY;
        if (!raf) raf = requestAnimationFrame(tick);
      });
      row.addEventListener("pointerleave", function () {
        on = false;
        box.classList.remove("is-on");
      });
    });
  })();

  /* ====================================================== contact + copy */

  (function initCopy() {
    $$("[data-copy]").forEach(function (btn) {
      var label = $("[data-copy-label]", btn);
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy");
        var done = function (ok) {
          label.textContent = ok ? "Copied" : "Press Ctrl+C to copy";
          setTimeout(function () { label.textContent = "Copy address"; }, 2200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
        } else {
          done(false);
        }
      });
    });
  })();

  (function initForm() {
    var form = $("#contact-form");
    if (!form) return;
    var status = $("[data-form-status]", form);
    var emailjsPromise = null;

    function loadEmailJS() {
      if (window.emailjs) return Promise.resolve(window.emailjs);
      if (emailjsPromise) return emailjsPromise;
      emailjsPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/emailjs-com@3/dist/email.min.js";
        s.async = true;
        s.onload = function () { window.emailjs ? resolve(window.emailjs) : reject(new Error("emailjs missing")); };
        s.onerror = function () { emailjsPromise = null; reject(new Error("emailjs failed to load")); };
        document.head.appendChild(s);
      });
      return emailjsPromise;
    }

    form.addEventListener("focusin", function () { loadEmailJS().catch(function () {}); }, { once: true });

    function setError(input, msg) {
      var field = input.closest(".field");
      var err = field.querySelector(".field-error");
      if (msg) {
        if (!err) {
          err = document.createElement("p");
          err.className = "field-error";
          err.id = input.id + "-error";
          field.appendChild(err);
        }
        err.textContent = msg;
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", err.id);
      } else {
        if (err) err.remove();
        input.removeAttribute("aria-invalid");
        input.removeAttribute("aria-describedby");
      }
    }

    function validate() {
      var bad = [];
      var name = form.elements.name, email = form.elements.email, message = form.elements.message;
      setError(name, name.value.trim() ? "" : "Please add your name.");
      if (!name.value.trim()) bad.push(name);
      var okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
      setError(email, okEmail ? "" : "Please enter a valid email address.");
      if (!okEmail) bad.push(email);
      setError(message, message.value.trim() ? "" : "Please write a short message.");
      if (!message.value.trim()) bad.push(message);
      return bad;
    }

    form.addEventListener("input", function (e) {
      if (e.target.getAttribute("aria-invalid") === "true") validate();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var bad = validate();
      status.className = "form-status";
      if (bad.length) {
        status.textContent = "Please fix the highlighted fields.";
        status.classList.add("is-err");
        bad[0].focus();
        return;
      }
      var btn = form.querySelector("button[type=submit]");
      btn.setAttribute("aria-disabled", "true");
      status.textContent = "Sending…";
      loadEmailJS().then(function (ej) {
        ej.init("y1pQCnfJyQVbHrzNX");
        return ej.sendForm("contact_service", "template_contact", form);
      }).then(function () {
        form.reset();
        status.textContent = "Thanks, your message is on its way. I'll reply by email.";
        status.classList.add("is-ok");
      }).catch(function (err) {
        if (window.console) console.warn("Contact form failed", err);
        status.textContent = "Couldn't send right now. Please email me directly.";
        status.classList.add("is-err");
      }).then(function () {
        btn.removeAttribute("aria-disabled");
      });
    });
  })();
})();
