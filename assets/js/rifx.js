/* ==========================================================================
   RIFX risk desk: a small, honest simulation of the Rider Infinity trading
   engine's decision path, run on a random-walk market in the browser.

   Mirrors the engine's own rules (github.com/rider315/rider_infinity):
   - evaluators (RSI, MACD, EMA trend) submit scores to an evaluation matrix
     that aggregates by weighted average, majority vote or unanimity
   - the risk manager checks, in order: daily drawdown cap, max open
     positions, spread filter, then sizes the lot so the stop risks N% of equity
   - stops are 1.5 × ATR clamped to 8–60 pips; take-profit is 1.8 × the stop
   - when the daily drawdown reaches the cap, an automation rule pauses trading

   The market is random, so there is no edge to find. That's the point.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.querySelector("[data-desk]");
  if (!root) return;

  var canvas = root.querySelector("[data-desk-chart]");
  var ctx = canvas.getContext("2d");
  var logEl = root.querySelector("[data-desk-log]");
  var statusEl = root.querySelector("[data-desk-status]");
  var runBtn = root.querySelector("[data-desk-run]");
  var regimeEl = root.querySelector("[data-desk-regime]");
  var form = root.querySelector(".desk-controls");
  var stat = function (k) { return root.querySelector('[data-stat="' + k + '"]'); };
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  var PIP = 0.0001, PIP_VALUE = 10, START = 10000, BARS = 220, WARMUP = 30;
  var COL = { up: "#7cf0a8", down: "#ff5fa2", ink: "rgba(238,235,227,0.85)", dim: "rgba(238,235,227,0.18)", amber: "#ffb547", cap: "#ff6b6b" };

  var sim = null;       // the current session
  var running = false;
  var raf = 0;
  var W = 0, H = 0, dpr = 1;

  /* ------------------------------------------------------------ helpers */

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function gauss(rng) {
    var u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function money(v) { return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
  function pct(v) { return (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(1) + "%"; }

  function settings() {
    var fd = new FormData(form);
    return {
      agg: fd.get("agg") || "weighted",
      risk: parseFloat(fd.get("risk")) / 100,
      cap: parseFloat(fd.get("cap")) / 100,
      maxPos: parseInt(fd.get("maxpos"), 10)
    };
  }

  /* ------------------------------------------------------------- market */

  function makeMarket(seed) {
    var rng = mulberry32(seed);
    var bars = [];
    var price = 1.0850, anchor = price;
    var regime = "range", left = 0, dir = 1;
    for (var i = 0; i < BARS; i++) {
      if (left-- <= 0) {
        regime = regime === "range" ? "trend" : "range";
        left = 28 + Math.floor(rng() * 40);
        dir = rng() < 0.5 ? -1 : 1;
        anchor = price;
      }
      var o = price, hi = o, lo = o, p = o;
      for (var k = 0; k < 4; k++) {
        var drift = regime === "trend" ? dir * 0.00006 : (anchor - p) * 0.06;
        p += drift + gauss(rng) * (regime === "trend" ? 0.00022 : 0.00018);
        hi = Math.max(hi, p);
        lo = Math.min(lo, p);
      }
      price = p;
      // spread in points (1 pip = 10 points); occasional spikes exercise the spread filter
      var spread = rng() < 0.07 ? 34 + Math.round(rng() * 22) : 8 + Math.round(rng() * 16);
      bars.push({ o: o, h: hi, l: lo, c: p, spread: spread, regime: regime });
    }
    // indicators
    var e12 = bars[0].c, e26 = bars[0].c, sig = 0, ag = 0, al = 0, atr = 0.0003;
    var k12 = 2 / 13, k26 = 2 / 27, k9 = 2 / 10;
    for (i = 0; i < bars.length; i++) {
      var b = bars[i], prev = bars[i - 1];
      e12 += (b.c - e12) * k12;
      e26 += (b.c - e26) * k26;
      var macd = e12 - e26;
      sig += (macd - sig) * k9;
      var ch = prev ? b.c - prev.c : 0;
      ag = (ag * 13 + Math.max(ch, 0)) / 14;
      al = (al * 13 + Math.max(-ch, 0)) / 14;
      var tr = prev ? Math.max(b.h - b.l, Math.abs(b.h - prev.c), Math.abs(b.l - prev.c)) : b.h - b.l;
      atr = (atr * 13 + tr) / 14;
      b.ema12 = e12; b.ema26 = e26; b.hist = macd - sig; b.atr = atr;
      b.rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return bars;
  }

  /* ------------------------------------------- evaluators + the matrix */

  function evaluate(b) {
    return [
      { name: "RSI", w: 1, v: clamp((50 - b.rsi) / 25, -1, 1), c: 0.5 + Math.abs(b.rsi - 50) / 100 },
      { name: "MACD", w: 1, v: clamp(b.hist / (b.atr * 0.15), -1, 1), c: 0.6 },
      { name: "EMA", w: 1.2, v: clamp((b.ema12 - b.ema26) / (b.atr * 0.5), -1, 1), c: 0.7 }
    ];
  }

  function aggregate(scores, mode) {
    var i, s;
    if (mode === "weighted") {
      var num = 0, den = 0;
      for (i = 0; i < scores.length; i++) { s = scores[i]; num += s.v * s.w * s.c; den += s.w * s.c; }
      var score = num / den;
      return { side: score > 0.3 ? 1 : score < -0.3 ? -1 : 0, score: score };
    }
    if (mode === "majority") {
      var lw = 0, sw = 0, tw = 0;
      for (i = 0; i < scores.length; i++) {
        s = scores[i];
        tw += s.w * s.c;
        if (s.v > 0.15) lw += s.w * s.c;
        else if (s.v < -0.15) sw += s.w * s.c;
      }
      return { side: lw > sw && lw > tw * 0.5 ? 1 : sw > lw && sw > tw * 0.5 ? -1 : 0, score: (lw - sw) / tw };
    }
    var up = scores.every(function (x) { return x.v > 0.15; });
    var dn = scores.every(function (x) { return x.v < -0.15; });
    return { side: up ? 1 : dn ? -1 : 0, score: up ? 1 : dn ? -1 : 0 };
  }

  /* -------------------------------------------------------------- session */

  function newSession() {
    var seed = (Math.random() * 1e9) | 0;
    return {
      bars: makeMarket(seed), seed: seed, cfg: settings(), i: WARMUP,
      equity: START, eq: [], open: [], closed: [], blocked: 0, paused: false,
      lastEntry: -99, lastSignal: -99, lastSide: 0, done: false
    };
  }

  function log(text, cls) {
    var li = document.createElement("li");
    li.textContent = text;
    if (cls) li.className = "is-" + cls;
    logEl.appendChild(li);
    while (logEl.children.length > 60) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function stepBar(S) {
    var i = S.i, b = S.bars[i], cfg = S.cfg;

    // 1. manage open positions on this bar (stop checked first: conservative)
    for (var p = S.open.length - 1; p >= 0; p--) {
      var t = S.open[p], hitSL, hitTP, exit = null;
      if (t.side > 0) { hitSL = b.l <= t.sl; hitTP = b.h >= t.tp; }
      else { hitSL = b.h >= t.sl; hitTP = b.l <= t.tp; }
      if (hitSL) exit = t.sl; else if (hitTP) exit = t.tp;
      if (exit !== null) {
        var pips = (exit - t.entry) / PIP * t.side;
        var pnl = pips * PIP_VALUE * t.lot;
        S.equity += pnl;
        t.exit = exit; t.exitI = i; t.pnl = pnl;
        S.open.splice(p, 1);
        S.closed.push(t);
        log("Trade closed by " + (hitSL ? "stop" : "target") + ": " + (pnl >= 0 ? "+" : "") + money(pnl) + " (" + pips.toFixed(1) + " pips)", pnl >= 0 ? "ok" : "err");
      }
    }

    // 2. automation: daily drawdown trigger → pause trading
    var dd = (START - S.equity) / START;
    if (!S.paused && dd >= cfg.cap) {
      S.paused = true;
      log("Automation: DrawdownThresholdTrigger at " + (dd * 100).toFixed(1) + "% → PauseTradingAction. No new trades today.", "warn");
    }

    // 3. evaluators → matrix → risk gates → order (fills at the next bar's open)
    var next = S.bars[i + 1];
    if (next) {
      var decision = aggregate(evaluate(b), cfg.agg);
      // A signal is acted on (or blocked) once, then cools down, whether or not it became a trade.
      var fresh = decision.side !== 0 && (decision.side !== S.lastSide || i - S.lastSignal > 24) && i - S.lastSignal > 5;
      if (fresh) {
        var label = (decision.side > 0 ? "LONG" : "SHORT") + " (" + (decision.score >= 0 ? "+" : "") + decision.score.toFixed(2) + ", " + cfg.agg + ")";
        var block = null;
        if (S.paused) block = "trading paused by the drawdown rule";
        else if (S.open.length >= cfg.maxPos) block = "max open positions (" + cfg.maxPos + ") reached";
        else if (b.spread > 30) block = "spread " + b.spread + " pts > 30";
        if (block) {
          S.blocked++;
          log("Matrix → " + label + " · RiskManager blocked: " + block, "warn");
        } else {
          var slPips = clamp(1.5 * b.atr / PIP, 8, 60);
          var lot = Math.max(0.01, Math.floor(S.equity * cfg.risk / (slPips * PIP_VALUE) * 100) / 100);
          var entry = next.o;
          var trade = {
            side: decision.side, entry: entry, lot: lot, i: i + 1,
            sl: entry - decision.side * slPips * PIP,
            tp: entry + decision.side * slPips * 1.8 * PIP
          };
          S.open.push(trade);
          S.lastEntry = i;
          log("Matrix → " + label + " · lot " + lot.toFixed(2) + " (" + (cfg.risk * 100).toFixed(2) + "% of " + money(S.equity) + ", stop " + slPips.toFixed(1) + " pips) · [dry run] " + (decision.side > 0 ? "BUY" : "SELL") + " @ " + entry.toFixed(5));
        }
        S.lastSide = decision.side;
        S.lastSignal = i;
      }
    }

    S.eq.push({ i: i, v: S.equity });
    S.i++;
    if (S.i >= S.bars.length) finish(S);
  }

  function finish(S) {
    S.done = true;
    var last = S.bars[S.bars.length - 1];
    S.open.forEach(function (t) {
      var pnl = (last.c - t.entry) / PIP * t.side * PIP_VALUE * t.lot;
      S.equity += pnl;
      t.exit = last.c; t.exitI = S.bars.length - 1; t.pnl = pnl;
      S.closed.push(t);
    });
    S.open = [];
    var change = (S.equity - START) / START;
    var msg = "Session over: " + S.closed.length + " trades, " + S.blocked + " blocked by risk, " + pct(change) + ". " +
      "A random walk has no edge to find. What matters is that every loss stayed inside the limits you set.";
    log(msg, change >= 0 ? "ok" : "dim");
    if (statusEl) statusEl.textContent = msg;
  }

  /* -------------------------------------------------------------- drawing */

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    canvas.width = W;
    canvas.height = H;
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var S = sim;
    var bars = S ? S.bars : idleBars;
    var upto = S ? S.i : bars.length;
    var padL = 12 * dpr, padR = 64 * dpr, padT = 40 * dpr;
    var chartH = H * 0.7, eqTop = H * 0.76, eqH = H * 0.2;
    var n = bars.length, bw = (W - padL - padR) / n;

    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < n; i++) { lo = Math.min(lo, bars[i].l); hi = Math.max(hi, bars[i].h); }
    var y = function (p) { return padT + (hi - p) / (hi - lo) * (chartH - padT); };
    var x = function (i) { return padL + i * bw + bw / 2; };

    // regime shading
    for (i = 0; i < upto; i++) {
      if (bars[i].regime === "trend") {
        ctx.fillStyle = "rgba(124,240,168,0.035)";
        ctx.fillRect(padL + i * bw, padT, bw + 0.5, chartH - padT);
      }
    }
    // grid
    ctx.strokeStyle = "rgba(238,235,227,0.06)";
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gy = padT + g * (chartH - padT) / 4;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
      ctx.fillStyle = "rgba(238,235,227,0.35)";
      ctx.font = 10 * dpr + "px JetBrains Mono, monospace";
      ctx.fillText((hi - g * (hi - lo) / 4).toFixed(4), W - padR + 8 * dpr, gy + 3 * dpr);
    }
    // candles
    for (i = 0; i < upto; i++) {
      var b = bars[i], up = b.c >= b.o;
      ctx.strokeStyle = ctx.fillStyle = S ? (up ? COL.up : COL.down) : "rgba(238,235,227,0.22)";
      ctx.beginPath(); ctx.moveTo(x(i), y(b.h)); ctx.lineTo(x(i), y(b.l)); ctx.stroke();
      var top = y(Math.max(b.o, b.c)), bot = y(Math.min(b.o, b.c));
      ctx.fillRect(x(i) - bw * 0.32, top, bw * 0.64, Math.max(1, bot - top));
    }
    if (!S) {
      ctx.fillStyle = "rgba(238,235,227,0.55)";
      ctx.font = 12 * dpr + "px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Press Run a session", (W - padR) / 2, chartH / 2);
      ctx.textAlign = "left";
      return;
    }
    // trades
    var all = S.closed.concat(S.open);
    all.forEach(function (t) {
      var end = t.exitI !== undefined ? t.exitI : upto - 1;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.strokeStyle = "rgba(255,107,107,0.6)";
      ctx.beginPath(); ctx.moveTo(x(t.i), y(t.sl)); ctx.lineTo(x(end), y(t.sl)); ctx.stroke();
      ctx.strokeStyle = "rgba(124,240,168,0.6)";
      ctx.beginPath(); ctx.moveTo(x(t.i), y(t.tp)); ctx.lineTo(x(end), y(t.tp)); ctx.stroke();
      ctx.setLineDash([]);
      // entry marker
      var ex = x(t.i), ey = y(t.entry), s = 6 * dpr * t.side;
      ctx.fillStyle = COL.amber;
      ctx.beginPath(); ctx.moveTo(ex, ey - s * 0.2); ctx.lineTo(ex - 5 * dpr, ey + s); ctx.lineTo(ex + 5 * dpr, ey + s); ctx.closePath(); ctx.fill();
      if (t.exitI !== undefined) {
        ctx.fillStyle = t.pnl >= 0 ? COL.up : COL.cap;
        ctx.beginPath(); ctx.arc(x(t.exitI), y(t.exit), 3.5 * dpr, 0, Math.PI * 2); ctx.fill();
      }
    });
    // equity curve + drawdown cap
    var eLo = START * (1 - S.cfg.cap * 1.25), eHi = START * 1.04;
    S.eq.forEach(function (p) { eLo = Math.min(eLo, p.v); eHi = Math.max(eHi, p.v); });
    var ey2 = function (v) { return eqTop + (eHi - v) / (eHi - eLo) * eqH; };
    ctx.strokeStyle = "rgba(238,235,227,0.08)";
    ctx.beginPath(); ctx.moveTo(padL, ey2(START)); ctx.lineTo(W - padR, ey2(START)); ctx.stroke();
    ctx.setLineDash([3 * dpr, 5 * dpr]);
    ctx.strokeStyle = COL.cap;
    var capY = ey2(START * (1 - S.cfg.cap));
    ctx.beginPath(); ctx.moveTo(padL, capY); ctx.lineTo(W - padR, capY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,107,107,0.8)";
    ctx.font = 10 * dpr + "px JetBrains Mono, monospace";
    ctx.fillText("cap −" + (S.cfg.cap * 100).toFixed(1) + "%", W - padR + 8 * dpr, capY + 3 * dpr);
    if (S.eq.length > 1) {
      ctx.strokeStyle = COL.amber;
      ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath();
      S.eq.forEach(function (p, k) { if (k) ctx.lineTo(x(p.i), ey2(p.v)); else ctx.moveTo(x(p.i), ey2(p.v)); });
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  function updateStats() {
    var S = sim;
    if (!S) return;
    var change = (S.equity - START) / START;
    stat("equity").textContent = money(S.equity);
    var dd = stat("dd");
    dd.textContent = pct(change);
    dd.className = change < 0 ? "is-down" : change > 0 ? "is-up" : "";
    stat("trades").textContent = String(S.closed.length + S.open.length);
    stat("blocked").textContent = String(S.blocked);
    var b = S.bars[Math.min(S.i, S.bars.length - 1)];
    if (regimeEl) regimeEl.textContent = (S.paused ? "Paused · " : "") + "sim regime: " + b.regime;
  }

  /* ---------------------------------------------------------- run control */

  function run() {
    if (running) return;
    init();
    running = true;
    runBtn.setAttribute("aria-disabled", "true");
    logEl.innerHTML = "";
    if (statusEl) statusEl.textContent = "Session running.";
    sim = newSession();
    var c = sim.cfg;
    log("New session · seed " + sim.seed + " · " + c.agg + " matrix · risk " + (c.risk * 100).toFixed(2) + "% · cap " + (c.cap * 100).toFixed(1) + "% · max " + c.maxPos + " positions", "dim");
    if (reduceMQ.matches) {
      while (!sim.done) stepBar(sim);
      updateStats();
      draw();
      end();
      return;
    }
    var last = performance.now(), acc = 0;
    (function frame(now) {
      acc += (now - last) / 1000 * 26; // bars per second
      last = now;
      while (acc >= 1 && !sim.done) { stepBar(sim); acc -= 1; }
      updateStats();
      draw();
      if (!sim.done) raf = requestAnimationFrame(frame);
      else end();
    })(last);
  }

  function end() {
    running = false;
    runBtn.removeAttribute("aria-disabled");
  }

  /* ------------------------------------------------------------- outputs */

  function syncOutputs() {
    var c = settings();
    root.querySelector('[data-out="risk"]').textContent = (c.risk * 100).toFixed(2) + "%";
    root.querySelector('[data-out="cap"]').textContent = (c.cap * 100).toFixed(1) + "%";
    root.querySelector('[data-out="maxpos"]').textContent = String(c.maxPos);
  }

  form.addEventListener("input", syncOutputs);
  runBtn.addEventListener("click", run);
  syncOutputs();

  // The desk sits far down the page, so its chart is built only when it comes near the viewport.
  var idleBars = null;
  function init() {
    if (idleBars) return;
    idleBars = makeMarket(20240503);
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener("resize", resize);
    resize();
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        io.disconnect();
        init();
      }
    }, { rootMargin: "150% 0px 150% 0px" });
    io.observe(root);
  } else {
    init();
  }
})();
