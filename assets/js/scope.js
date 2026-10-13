/* ==========================================================================
   Scope: the "Phase Space" oscilloscope engine.

   Draws a 3D Lissajous figure on a fixed canvas behind the page:
     x = sin(a·t + phase)     y = sin(b·t + beta)     z = cos(a·t + phase)
   The curve lies on a cylinder, so changing `phase` is a real rotation.
   With a:b = 1:2 it is the infinity sign. `yt` blends the same signal into
   time-domain (YT) mode: a waveform sweeping across the screen.

   Pages steer it by writing to Scope.target (directly or via a driver that
   runs every frame). The engine eases its current state toward the target,
   so the picture is always a pure function of scroll position + time and
   reverses cleanly when the visitor scrolls back up.
   ========================================================================== */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var KEYS = [
    "a", "b", "beta", "phase", "tilt", "yt", "k", "amp", "cx", "cy", "sx", "sy",
    "cr", "cg", "cb", "intensity", "draw", "noise", "front", "spin", "ribbon", "vt", "mk"
  ];
  var DEFAULTS = {
    a: 1, b: 2, beta: 0, phase: 0, tilt: 0.34,
    yt: 0, k: 5, amp: 0.07,
    cx: 0.5, cy: 0.5, sx: 0.42, sy: 0.24,
    cr: 255, cg: 181, cb: 71,
    intensity: 1, draw: 1, noise: 0, front: 0, spin: 1, ribbon: 1, vt: 0, mk: 0
  };
  var LEVELS = 7;
  var frameGap = 0; // ms between renders; phones and small CPUs render at 30 fps
  var lastRender = 0;

  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var coarseMQ = window.matchMedia("(pointer: coarse)");

  var back, bctx, front, fctx;
  var cw = 0, ch = 0, dpr = 1, cssW = 0, cssH = 0;
  var cur = {}, target = {};
  var clock = 0, last = 0, raf = 0;
  var frozen = false, reduced = reduceMQ.matches, started = false;
  var needsRender = true, frontDirty = false;
  var velocity = 0;
  var glitch = 0, lastLabel = null; // a short chromatic "channel switch" when the section changes
  var driver = null, hudFn = null, hudLast = 0;
  var N = 900;
  var px, py, pd; // point buffers

  var lowPower = coarseMQ.matches || (navigator.hardwareConcurrency || 8) <= 4;
  if (lowPower) {
    LEVELS = 5;
    frameGap = 31;
  }

  var packets = [];
  for (var p = 0; p < (lowPower ? 8 : 16); p++) {
    packets.push({ seed: Math.random(), speed: 0.03 + Math.random() * 0.07, dir: Math.random() < 0.7 ? 1 : -1, size: 0.7 + Math.random() * 1.1 });
  }

  function copy(dst, src) {
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      if (src[k] !== undefined) dst[k] = src[k];
    }
    if (src.label !== undefined) dst.label = src.label;
    if (src.frontY !== undefined) dst.frontY = src.frontY;
    return dst;
  }

  function hash(i, s) {
    var x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    // Mobile browsers resize the viewport while the URL bar slides; ignore small height-only changes.
    if (coarseMQ.matches && w === cssW && Math.abs(h - cssH) < 160 && cssH) return;
    cssW = w;
    cssH = h;
    dpr = Math.min(window.devicePixelRatio || 1, coarseMQ.matches ? 1.5 : 1.75);
    cw = Math.round(w * dpr);
    ch = Math.round(h * dpr);
    [back, front].forEach(function (c) {
      if (!c) return;
      c.width = cw;
      c.height = ch;
    });
    N = w < 700 ? 360 : w < 1200 ? 640 : 900;
    px = new Float32Array(N);
    py = new Float32Array(N);
    pd = new Float32Array(N);
    needsRender = true;
    schedule();
  }

  /* Evaluate the signal at parameter u ∈ [0,1]. Writes into out = [x, y, depth]. */
  function evalPoint(u, s, rot, beta, ytPhase, out) {
    var M = Math.min(cw, ch);
    var t = u * TAU;
    var ang = s.a * t + rot;
    var x = Math.sin(ang);
    var z = Math.cos(ang);
    var y = Math.sin(s.b * t + beta);
    var ct = Math.cos(s.tilt), st = Math.sin(s.tilt);
    var y2 = y * ct - z * st;
    var z2 = y * st + z * ct;
    var persp = 1 / (1 - z2 * 0.22);
    var X1 = s.cx * cw + x * s.sx * M * persp;
    var Y1 = s.cy * ch - y2 * s.sy * M * persp;
    // YT mode sweeps horizontally; with vt = 1 it sweeps down the screen instead.
    var sweep = -0.03 + u * 1.06;
    var wave = Math.sin(u * TAU * s.k + ytPhase);
    if (s.mk > 0.001) {
      // "Market" mode: incommensurate harmonics read like a price tape rather than a clean sine.
      var q = ytPhase * 0.25;
      var market = 0.55 * Math.sin(u * TAU * 1.3 + q) + 0.26 * Math.sin(u * TAU * 4.7 + q * 2.1 + 1.7) +
        0.12 * Math.sin(u * TAU * 13.1 + q * 3.7 + 0.4) + 0.07 * Math.sin(u * TAU * 31.7 + q * 6.3 + 2.2);
      wave += (market * 1.6 - wave) * s.mk;
    }
    var X2 = sweep * cw + (s.cx * cw + wave * s.amp * cw - sweep * cw) * s.vt;
    var Y2 = s.cy * ch - wave * s.amp * ch + (sweep * ch - (s.cy * ch - wave * s.amp * ch)) * s.vt;
    var m = s.yt;
    out[0] = X1 + (X2 - X1) * m;
    out[1] = Y1 + (Y2 - Y1) * m;
    out[2] = z2 * (1 - m);
  }

  var tmp = [0, 0, 0];

  function fade(ctx, amount) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0," + amount + ")";
    ctx.fillRect(0, 0, cw, ch);
  }

  function render() {
    if (!bctx) return;
    var s = cur;
    var animating = !frozen && !reduced;
    var persist = animating ? 0.3 : 1;

    fade(bctx, persist);
    if (fctx && (frontDirty || s.front > 0.5)) {
      fade(fctx, persist);
      frontDirty = s.front > 0.5 || persist < 1;
    }

    if (s.intensity <= 0.002 || s.draw <= 0.002) return;

    var rot = s.phase + Math.sin(clock * 0.21) * 0.55 * s.spin;
    var beta = s.beta + Math.sin(clock * 0.13) * 0.22 * s.spin;
    var ytPhase = s.phase * 2 - clock * 1.6;
    var col = Math.round(s.cr) + "," + Math.round(s.cg) + "," + Math.round(s.cb);
    var useFront = !!fctx && s.front > 0.5;
    var frontY = s.frontY ? s.frontY * dpr : Infinity; // front layer only above this line (CSS px)
    var seed = Math.floor(clock * 24);

    // 1. Sample the curve
    var n = N;
    var maxI = Math.max(2, Math.floor(s.draw * (n - 1)) + 1);
    for (var i = 0; i < maxI; i++) {
      evalPoint(i / (n - 1), s, rot, beta, ytPhase, tmp);
      var yy = tmp[1];
      if (s.noise > 0) yy += (hash(i, seed) - 0.5) * s.noise * ch * 0.035;
      px[i] = tmp[0];
      py[i] = yy;
      pd[i] = tmp[2];
    }

    // 2. Beam head sweeps along the curve; segments behind it glow brighter (phosphor decay)
    var head = s.draw < 0.999 ? s.draw : (clock * 0.16) % 1;
    var backPaths = [], frontPaths = [];
    for (var l = 0; l < LEVELS; l++) {
      backPaths.push(null);
      frontPaths.push(null);
    }
    for (i = 0; i < maxI - 1; i++) {
      var u = i / (n - 1);
      var depth = (pd[i] + pd[i + 1]) * 0.5;
      var dn = (depth + 1) * 0.5;
      var behind = head - u;
      if (behind < 0) behind += 1;
      var decay = Math.exp(-behind * 4.2);
      var b = (0.26 + 0.74 * dn) * (0.42 + 0.58 * decay);
      var lvl = Math.min(LEVELS - 1, Math.floor(b * LEVELS));
      var list = useFront && depth > 0.04 && py[i] < frontY ? frontPaths : backPaths;
      var path = list[lvl] || (list[lvl] = new Path2D());
      path.moveTo(px[i], py[i]);
      path.lineTo(px[i + 1], py[i + 1]);
    }

    function strokeLevels(ctx, paths) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (var l = 0; l < LEVELS; l++) {
        var path = paths[l];
        if (!path) continue;
        var f = (l + 0.5) / LEVELS;
        var a = f * s.intensity;
        // glow
        ctx.strokeStyle = "rgba(" + col + "," + Math.min(1, a * 0.13).toFixed(3) + ")";
        ctx.lineWidth = (3.5 + f * 6) * dpr;
        ctx.stroke(path);
        // core
        ctx.strokeStyle = "rgba(" + col + "," + Math.min(1, a * 0.95).toFixed(3) + ")";
        ctx.lineWidth = (0.6 + f * 1.25) * dpr;
        ctx.stroke(path);
      }
      // the hottest segments get a white-ish core, like a real phosphor trace
      var hot = paths[LEVELS - 1];
      if (hot) {
        ctx.strokeStyle = "rgba(255,250,240," + (0.55 * s.intensity).toFixed(3) + ")";
        ctx.lineWidth = 0.7 * dpr;
        ctx.stroke(hot);
      }
    }

    // 3. Ribbon ghosts: faint copies at small phase offsets. They spread while scrolling fast.
    var spread = (0.035 + Math.min(0.22, velocity * 0.00022)) * s.ribbon;
    if (s.ribbon > 0.01 && s.yt < 0.98 && !lowPower) {
      bctx.globalCompositeOperation = "lighter";
      bctx.lineWidth = 0.7 * dpr;
      for (var g = -1; g <= 1; g += 2) {
        var ghost = new Path2D();
        for (i = 0; i < maxI; i += 2) {
          evalPoint(i / (n - 1), s, rot + g * spread, beta - g * spread * 0.6, ytPhase, tmp);
          if (i === 0) ghost.moveTo(tmp[0], tmp[1]);
          else ghost.lineTo(tmp[0], tmp[1]);
        }
        bctx.strokeStyle = "rgba(" + col + "," + (0.16 * s.intensity * (1 - s.yt)).toFixed(3) + ")";
        bctx.stroke(ghost);
      }
    }

    strokeLevels(bctx, backPaths);
    if (useFront) strokeLevels(fctx, frontPaths);

    // Channel switch: red and cyan ghosts of the brightest segments, offset sideways, fading fast.
    if (glitch > 0.03) {
      var off = glitch * 7 * dpr;
      [[off, "255,70,90"], [-off, "70,220,255"]].forEach(function (g) {
        bctx.save();
        bctx.translate(g[0], 0);
        bctx.globalCompositeOperation = "lighter";
        bctx.lineWidth = 1.4 * dpr;
        bctx.strokeStyle = "rgba(" + g[1] + "," + (0.55 * glitch * s.intensity).toFixed(3) + ")";
        for (var l = LEVELS - 3; l < LEVELS; l++) if (backPaths[l]) bctx.stroke(backPaths[l]);
        bctx.restore();
      });
    }

    // 4. Packets: small bright dots riding the signal
    if (s.draw > 0.98) {
      for (var q = 0; q < packets.length; q++) {
        var pk = packets[q];
        var pu = (pk.seed + clock * pk.speed * pk.dir) % 1;
        if (pu < 0) pu += 1;
        evalPoint(pu, s, rot, beta, ytPhase, tmp);
        var ctxP = useFront && tmp[2] > 0.04 && tmp[1] < frontY ? fctx : bctx;
        var al = (0.35 + 0.65 * (tmp[2] + 1) * 0.5) * s.intensity;
        ctxP.globalCompositeOperation = "lighter";
        ctxP.fillStyle = "rgba(" + col + "," + Math.min(1, al).toFixed(3) + ")";
        ctxP.beginPath();
        ctxP.arc(tmp[0], tmp[1], pk.size * dpr * 1.3, 0, TAU);
        ctxP.fill();
      }
    }

    // 5. Beam head
    evalPoint(head, s, rot, beta, ytPhase, tmp);
    var hctx = useFront && tmp[2] > 0.04 && tmp[1] < frontY ? fctx : bctx;
    var r = 26 * dpr;
    var grd = hctx.createRadialGradient(tmp[0], tmp[1], 0, tmp[0], tmp[1], r);
    grd.addColorStop(0, "rgba(255,252,245," + (0.95 * s.intensity).toFixed(3) + ")");
    grd.addColorStop(0.12, "rgba(" + col + "," + (0.75 * s.intensity).toFixed(3) + ")");
    grd.addColorStop(1, "rgba(" + col + ",0)");
    hctx.globalCompositeOperation = "lighter";
    hctx.fillStyle = grd;
    hctx.fillRect(tmp[0] - r, tmp[1] - r, r * 2, r * 2);
    if (hctx === fctx) frontDirty = true;

    Scope.head = { x: tmp[0] / dpr, y: tmp[1] / dpr };
  }

  function step(now) {
    raf = 0;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;

    if (driver) driver(target, dt);

    var f = reduced ? 1 : 1 - Math.exp(-dt * 5.5);
    var delta = 0;
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      var d = target[k] - cur[k];
      if (d !== 0) {
        cur[k] += d * f;
        delta += Math.abs(d);
      }
    }
    if (target.label !== lastLabel) {
      if (lastLabel !== null && !reduced) glitch = 1;
      lastLabel = target.label;
    }
    cur.label = target.label;
    cur.frontY = target.frontY;
    glitch *= Math.exp(-dt * 6);
    velocity *= Math.exp(-dt * 4);

    var running = !frozen && !reduced && !document.hidden;
    if (running) clock += dt;

    if ((running || delta > 0.0005 || needsRender) && (now - lastRender >= frameGap || needsRender)) {
      render();
      lastRender = now;
      needsRender = false;
    }

    if (hudFn && now - hudLast > 110) {
      hudLast = now;
      hudFn(cur, clock);
    }

    if (running || delta > 0.0005 || glitch > 0.03) schedule();
  }

  function schedule() {
    if (!raf && started && !document.hidden) raf = requestAnimationFrame(step);
  }

  var Scope = {
    target: target,
    state: cur,
    head: { x: 0, y: 0 },

    init: function (opts) {
      opts = opts || {};
      back = opts.canvas || document.getElementById("scope");
      if (!back || !back.getContext) return false;
      bctx = back.getContext("2d");
      front = opts.front || null;
      fctx = front ? front.getContext("2d") : null;
      copy(cur, DEFAULTS);
      copy(target, DEFAULTS);
      if (opts.state) {
        copy(cur, opts.state);
        copy(target, opts.state);
      }
      if (opts.from) copy(cur, opts.from);
      clock = Math.random() * 10;
      started = true;
      resize();
      window.addEventListener("resize", resize, { passive: true });
      document.addEventListener("visibilitychange", function () {
        last = 0;
        schedule();
      });
      var onReduce = function () {
        reduced = reduceMQ.matches;
        needsRender = true;
        schedule();
      };
      if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", onReduce);
      else if (reduceMQ.addListener) reduceMQ.addListener(onReduce);
      var lastY = window.scrollY;
      window.addEventListener("scroll", function () {
        var y = window.scrollY;
        velocity = Math.min(4000, velocity + Math.abs(y - lastY) * 6);
        lastY = y;
        schedule();
      }, { passive: true });
      schedule();
      return true;
    },

    /* Merge values into the target. instant=true also snaps the current state. */
    set: function (state, instant) {
      copy(target, state);
      if (instant) copy(cur, state);
      needsRender = true;
      schedule();
    },

    setDriver: function (fn) {
      driver = fn;
      schedule();
    },

    onHud: function (fn) {
      hudFn = fn;
    },

    freeze: function (on) {
      frozen = !!on;
      last = 0;
      needsRender = true;
      schedule();
    },

    isFrozen: function () {
      return frozen;
    },

    isReduced: function () {
      return reduced;
    },

    glitch: function () {
      if (!reduced) glitch = 1;
      schedule();
    },

    wake: function () {
      needsRender = true;
      schedule();
    },

    defaults: DEFAULTS,
    keys: KEYS
  };

  window.Scope = Scope;
})();
