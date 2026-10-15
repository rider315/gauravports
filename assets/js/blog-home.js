/* ==========================================================================
   Home page "Notes" strip: the three newest posts from the CMS.
   Markup comes from assets/js/blog-core.js, so these cards are the same
   component as the archive at /blog.html.
   If there is nothing to show — no CMS config, no posts, a failed request —
   the whole section leaves the page rather than sitting there empty.
   ========================================================================== */

(function () {
  "use strict";

  var B = window.Blog;
  var grid = document.querySelector("[data-notes]");
  if (!B || !grid) return;

  var section = grid.closest(".notes") || grid;

  /* The strip changes the page height, and the oscilloscope scenes and
     ScrollTriggers are measured from element positions. */
  function settle() {
    window.dispatchEvent(new Event("resize"));
    if (window.ScrollTrigger && window.ScrollTrigger.refresh) window.ScrollTrigger.refresh();
  }

  function drop(reason) {
    if (reason && window.console) console.warn("[blog] notes section hidden:", reason);
    section.remove();
    settle();
  }

  B.onReady(function () {
    if (!B.ready) { drop("CMS not configured"); return; }

    grid.innerHTML = B.skeletonHtml(3);

    B.posts({ limit: 3 })
      .then(function (res) {
        if (!res.items.length) { drop("no published posts"); return; }
        grid.innerHTML = res.items.map(function (post, i) { return B.cardHtml(post, i); }).join("");
        settle();
      })
      .catch(function (err) { drop((err && err.message) || "request failed"); });
  });
})();
