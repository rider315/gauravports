/* ==========================================================================
   Two optional extras, used on every page:
   1. Sound: hear the signal. Left ear plays X, right ear plays Y, at the
      scope's real frequency ratio. On a real oscilloscope in XY mode, exactly
      these two tones draw the figure on screen. Off until the visitor asks.
   2. Console: a small terminal (press "/" or the Console button) to move
      around the site, open links and take over the scope.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var onHome = !!document.querySelector(".page-home");

  /* ================================================================ sound */

  var Sound = {
    ctx: null, oscL: null, oscR: null, master: null, timer: 0, on: false,

    start: function () {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!this.ctx) {
        var ctx = this.ctx = new AC();
        var merger = ctx.createChannelMerger(2);
        var filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 1600;
        this.master = ctx.createGain();
        this.master.gain.value = 0;
        this.oscL = ctx.createOscillator();
        this.oscR = ctx.createOscillator();
        this.oscL.connect(merger, 0, 0); // X → left channel
        this.oscR.connect(merger, 0, 1); // Y → right channel
        merger.connect(filter);
        filter.connect(this.master);
        this.master.connect(ctx.destination);
        this.oscL.start();
        this.oscR.start();
      }
      this.ctx.resume();
      this.on = true;
      this.update(true);
      this.master.gain.setTargetAtTime(0.045, this.ctx.currentTime, 0.15);
      var self = this;
      clearInterval(this.timer);
      this.timer = setInterval(function () { self.update(false); }, 120);
      return true;
    },

    stop: function () {
      this.on = false;
      clearInterval(this.timer);
      if (!this.ctx) return;
      var ctx = this.ctx;
      this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      setTimeout(function () { if (!Sound.on) ctx.suspend(); }, 400);
    },

    update: function (instant) {
      if (!this.ctx || !window.Scope) return;
      var s = window.Scope.state;
      var base = 110;
      var fx = base * Math.max(0.5, s.a || 1);
      var fy = base * Math.max(0.5, s.b || 2);
      var t = this.ctx.currentTime;
      var tc = instant ? 0.001 : 0.12;
      this.oscL.frequency.setTargetAtTime(fx, t, tc);
      this.oscR.frequency.setTargetAtTime(fy, t, tc);
    }
  };

  var soundBtns = [];
  function setSound(on) {
    var ok = on ? Sound.start() : (Sound.stop(), true);
    if (!ok) return false;
    soundBtns.forEach(function (b) {
      b.setAttribute("data-on", String(on));
      b.querySelector(".hud-sound-label").textContent = on ? "Sound on" : "Sound";
      b.setAttribute("aria-label", on ? "Sound on. Turn off the signal sound" : "Sound. Play the signal as stereo tones");
    });
    return true;
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && Sound.on) setSound(false);
  });
  document.addEventListener("scope:motion", function (e) {
    if (e.detail && e.detail.stopped && Sound.on) setSound(false);
  });

  /* ============================================================== console */

  var SECTIONS = ["top", "about", "experience", "stack", "work", "lab", "venture", "more", "credentials", "contact"];
  var LINKS = {
    tokins: "https://tokins.in/",
    chills: "https://chills.pro/",
    rifx: "https://github.com/rider315/rider_infinity",
    studio: "https://www.riderinfinity.com/",
    github: "https://github.com/rider315",
    linkedin: "https://www.linkedin.com/in/gaurav-chaudhary-03900120b/",
    ieee: "https://ieeexplore.ieee.org/document/10574574",
    lastone: "https://play.google.com/store/apps/details?id=com.rider_infinity.lastone&hl=en_IN",
    resume: "/assets/docs/Gaurav-Chaudhary-Resume.pdf",
    archive: "/projects",
    blog: "/blog.html"
  };
  var bootAt = Date.now();

  var panel, out, input, lastFocus, history = [], hIndex = 0;

  function build() {
    panel = document.createElement("div");
    panel.className = "console";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Site console");
    panel.hidden = true;
    panel.innerHTML =
      '<div class="console-bar"><span class="console-dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '<span class="console-title">gaurav@phase-space: ~</span>' +
      '<button class="console-close" type="button" aria-label="Close console">Esc</button></div>' +
      '<ol class="console-out" aria-live="polite"></ol>' +
      '<form class="console-form"><label class="console-prompt" for="console-input">$</label>' +
      '<input id="console-input" class="console-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="type help"></form>';
    document.body.appendChild(panel);
    out = $(".console-out", panel);
    input = $(".console-input", panel);
    $(".console-close", panel).addEventListener("click", close);
    $(".console-form", panel).addEventListener("submit", function (e) {
      e.preventDefault();
      var cmd = input.value.trim();
      input.value = "";
      if (!cmd) return;
      history.push(cmd);
      hIndex = history.length;
      print("$ " + cmd, "cmd");
      run(cmd);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp" && history.length) {
        hIndex = Math.max(0, hIndex - 1);
        input.value = history[hIndex];
        e.preventDefault();
      } else if (e.key === "ArrowDown" && history.length) {
        hIndex = Math.min(history.length, hIndex + 1);
        input.value = history[hIndex] || "";
        e.preventDefault();
      } else if (e.key === "Tab") {
        var words = ["help", "whoami", "ls", "goto ", "open ", "scope ", "sound ", "run", "stop", "glitch", "hire", "uptime", "clear", "exit"];
        var hit = words.filter(function (w) { return w.indexOf(input.value) === 0; })[0];
        if (hit && input.value) { input.value = hit; e.preventDefault(); }
      }
    });
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key === "Tab" && document.activeElement === input && e.shiftKey) {
        e.preventDefault();
        $(".console-close", panel).focus();
      }
    });
    print("Phase Space console. Type help to see what it can do.", "dim");
  }

  function print(text, cls) {
    var li = document.createElement("li");
    li.textContent = text;
    if (cls) li.className = "is-" + cls;
    out.appendChild(li);
    out.scrollTop = out.scrollHeight;
  }

  function open() {
    if (!panel) build();
    lastFocus = document.activeElement;
    panel.hidden = false;
    requestAnimationFrame(function () { panel.classList.add("is-open"); input.focus(); });
  }

  function close() {
    if (!panel || panel.hidden) return;
    panel.classList.remove("is-open");
    setTimeout(function () { panel.hidden = true; }, reduceMQ.matches ? 0 : 250);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function go(id) {
    if (onHome) {
      var el = document.getElementById(id === "top" ? "top" : id);
      if (!el) return false;
      close();
      el.scrollIntoView({ behavior: reduceMQ.matches ? "auto" : "smooth" });
      return true;
    }
    window.location.href = "/#" + id;
    return true;
  }

  function setScope(a, b) {
    if (!window.Scope) { print("The scope hasn't started yet. Try again in a second.", "err"); return; }
    if (typeof window.Scope.setManual === "function") {
      window.Scope.setManual(a === null ? null : { a: a, b: b });
    } else if (a !== null) {
      window.Scope.set({ a: a, b: b, yt: 0, label: "USER" });
    }
    window.Scope.glitch();
  }

  function run(cmd) {
    var parts = cmd.toLowerCase().split(/\s+/);
    var c = parts[0], arg = parts[1];
    switch (c) {
      case "help":
        print("help            this list");
        print("whoami          who built this");
        print("ls              sections on the homepage");
        print("goto <section>  jump to a section (also: cd)");
        print("open <name>     " + Object.keys(LINKS).join(", "));
        print("scope <a> <b>   set the signal's frequency ratio, e.g. scope 3 4 (scope reset)");
        print("sound on|off    hear the signal: left ear X, right ear Y (headphones)");
        print("run | stop      start or freeze the background motion");
        print("glitch          switch channels");
        print("hire            the shortest path to an interview");
        print("clear, exit");
        break;
      case "whoami":
        print("Gaurav Chaudhary. AI & full stack engineer in Bengaluru, India.");
        print("Electronics (VIT Vellore) → automotive ECUs (KPIT) → LLM evaluation (Innodata).");
        print("Runs Rider Infinity, an independent venture, on the side.");
        break;
      case "ls":
        print(SECTIONS.join("  "));
        break;
      case "cd":
      case "goto":
        if (!arg) { print("goto where? Try: " + SECTIONS.join(", "), "err"); break; }
        if (arg === "home" || arg === "~") arg = "top";
        if (arg === "projects" || arg === "archive") { window.location.href = "/projects"; break; }
        if (SECTIONS.indexOf(arg) < 0) { print("No section called " + arg + ". Try ls.", "err"); break; }
        print("→ " + arg, "ok");
        go(arg);
        break;
      case "open":
        if (!arg || !LINKS[arg]) { print("open what? " + Object.keys(LINKS).join(", "), "err"); break; }
        print("Opening " + arg + "…", "ok");
        window.open(LINKS[arg], "_blank", "noopener");
        break;
      case "scope":
        if (arg === "reset") { setScope(null); print("Scope back on autopilot.", "ok"); break; }
        var a = parseFloat(parts[1]), b = parseFloat(parts[2]);
        if (!(a > 0 && b > 0 && a <= 12 && b <= 12)) { print("Usage: scope <a> <b> with 0 < a, b ≤ 12. Try scope 3 4 or scope 5 4.", "err"); break; }
        setScope(a, b);
        print("Signal set to " + a + ":" + b + ". It hands back to the page after 12 s or a scroll.", "ok");
        break;
      case "sound":
        if (arg === "off") { setSound(false); print("Sound off.", "ok"); break; }
        if (setSound(true)) print("Sound on. Headphones recommended: left ear is X, right ear is Y.", "ok");
        else print("This browser can't play Web Audio.", "err");
        break;
      case "run":
      case "stop":
        var btn = $(".hud-run:not(.hud-sound):not(.hud-console)");
        var stopped = btn && btn.getAttribute("data-stopped") === "true";
        if (btn && ((c === "stop") !== stopped)) btn.click();
        print(c === "stop" ? "Background motion stopped." : "Background motion running.", "ok");
        break;
      case "glitch":
        if (window.Scope) window.Scope.glitch();
        print("bzzt.", "ok");
        break;
      case "hire":
        print("Good call. Opening the contact section…", "ok");
        setTimeout(function () { go("contact"); }, 400);
        break;
      case "sudo":
        if (cmd.toLowerCase().indexOf("hire") > -1) {
          print("[sudo] permission granted.", "ok");
          setTimeout(function () { go("contact"); }, 500);
        } else {
          print("Nice try.", "err");
        }
        break;
      case "uptime":
        print("Page up for " + Math.round((Date.now() - bootAt) / 1000) + " s. Tokins has been up a lot longer.");
        break;
      case "echo":
        print(cmd.slice(5));
        break;
      case "clear":
        out.innerHTML = "";
        break;
      case "exit":
      case "quit":
        close();
        break;
      default:
        print("command not found: " + c + ". Try help.", "err");
    }
  }

  /* ========================================================== HUD buttons */

  function addButtons() {
    var targets = [];
    var hud = $(".hud");
    if (hud) targets.push({ el: hud, cls: "" });
    var foot = $(".footer-base");
    if (foot) targets.push({ el: foot, cls: " footer-extra" });
    targets.forEach(function (t) {
      var sb = document.createElement("button");
      sb.type = "button";
      sb.className = "hud-run hud-sound" + t.cls;
      sb.setAttribute("data-on", "false");
      sb.setAttribute("aria-label", "Sound. Play the signal as stereo tones");
      sb.title = "Hear the signal (headphones)";
      sb.innerHTML = '<span class="hud-sound-icon" aria-hidden="true"></span><span class="hud-sound-label">Sound</span>';
      sb.addEventListener("click", function () {
        setSound(sb.getAttribute("data-on") !== "true");
      });
      soundBtns.push(sb);

      var cb = document.createElement("button");
      cb.type = "button";
      cb.className = "hud-run hud-console" + t.cls;
      cb.setAttribute("aria-label", "Console. Open the site console");
      cb.title = "Open the console (press /)";
      cb.innerHTML = '<span class="hud-console-icon" aria-hidden="true">&gt;_</span><span>Console</span>';
      cb.addEventListener("click", open);

      var run = t.el.querySelector(".hud-run:not(.hud-sound):not(.hud-console)");
      if (run) {
        t.el.insertBefore(cb, run);
        t.el.insertBefore(sb, run);
      } else {
        t.el.appendChild(sb);
        t.el.appendChild(cb);
      }
    });
  }

  addButtons();

  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    var typing = tag === "input" || tag === "textarea" || e.target.isContentEditable;
    if (!typing && (e.key === "/" || e.key === "`") && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      open();
    }
  });

  window.SiteConsole = { open: open, close: close, run: run };
})();
