/* ==========================================================================
   Starts the oscilloscope on sub-pages with a fixed preset chosen by
   <body data-scope="...">. The homepage drives the scope from home.js instead.
   ========================================================================== */
(function () {
  "use strict";

  var CH1 = [255, 181, 71], CH2 = [92, 225, 255], CH4 = [164, 147, 255];

  function rgb(c) { return { cr: c[0], cg: c[1], cb: c[2] }; }
  function merge(a, b) { for (var k in b) a[k] = b[k]; return a; }

  var PRESETS = {
    archive: merge({ a: 3, b: 2, tilt: 0.4, cx: 0.8, cy: 0.3, sx: 0.24, sy: 0.22, intensity: 0.6, label: "CH4" }, rgb(CH4)),
    blog: merge({ a: 2, b: 3, tilt: 0.3, cx: 0.82, cy: 0.3, sx: 0.2, sy: 0.22, intensity: 0.55, label: "CH1" }, rgb(CH1)),
    // A waveform running down the timeline rail (cx is set from the rail's position).
    cv: merge({ yt: 1, vt: 1, k: 6, amp: 0.016, cx: 0.06, cy: 0.5, intensity: 0.75, ribbon: 0, label: "CH2" }, rgb(CH2)),
    // 404: a flat line with noise. Nothing on the input.
    nosignal: merge({ yt: 1, k: 1, amp: 0.004, noise: 1, cy: 0.2, intensity: 0.85, ribbon: 0, label: "NO SIG" }, rgb([255, 120, 100]))
  };

  var name = document.body.getAttribute("data-scope");
  var preset = PRESETS[name];
  if (!preset || !window.Site) return;

  // Decoration only: start once the page has loaded and the main thread is idle.
  function start() {
    var ok = window.Site.startScope({ canvas: document.getElementById("scope"), state: preset });
    if (!ok) return;

    var rail = document.querySelector("[data-scope-rail]");
    if (rail && window.Scope) {
      var place = function () {
        var r = rail.getBoundingClientRect();
        window.Scope.set({ cx: (r.left + r.width / 2) / window.innerWidth }, true);
      };
      place();
      window.addEventListener("resize", place);
      // Scrolling slides the wave along the rail, so it reads as time passing.
      window.Scope.setDriver(function (t) { t.phase = window.scrollY / window.innerHeight * 0.8; });
    }
  }

  var idle = function (fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 900 });
    else setTimeout(fn, 200);
  };
  if (document.readyState === "complete") idle(start);
  else window.addEventListener("load", function () { idle(start); });
})();
