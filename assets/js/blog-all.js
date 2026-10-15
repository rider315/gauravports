/* ==========================================================================
   Blog archive (/blog.html): every post, newest first, filterable by category.
   The newest post leads as a wide card; the rest fill the grid.
   Cards are the shared .post-card component from assets/js/blog-core.js.
   ========================================================================== */

(function () {
  "use strict";

  var B = window.Blog;
  var list = document.querySelector("[data-posts]");
  if (!B || !list) return;

  var filterBar = document.querySelector("[data-filters]");
  var count = document.querySelector("[data-count]");

  var all = [];
  var active = "*";

  function note(title, body) {
    list.innerHTML = '<li><p class="blog-note"><b>' + B.escape(title) + "</b>" + (body || "") + "</p></li>";
    if (count) count.textContent = "";
  }

  function plural(n) {
    return n === 1 ? "1 post" : n + " posts";
  }

  function render() {
    var posts = active === "*"
      ? all
      : all.filter(function (p) { return B.field(p, "category") === active; });

    if (!posts.length) {
      list.innerHTML = '<li><p class="blog-note"><b>Nothing filed under that yet.</b>Pick another category.</p></li>';
    } else {
      list.innerHTML = posts.map(function (post, i) {
        // The lead card only makes sense for the unfiltered, newest-first view.
        var featured = active === "*" && i === 0 && posts.length > 2;
        return '<li' + (featured ? ' class="is-lead"' : "") + ">" +
          B.cardHtml(post, i, { featured: featured, heading: "h2" }) + "</li>";
      }).join("");
    }

    if (count) {
      count.textContent = active === "*"
        ? plural(all.length)
        : posts.length + " of " + plural(all.length) + " · " + active;
    }
  }

  function chip(label, value) {
    var b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(active === value));
    b.addEventListener("click", function () {
      active = value;
      Array.prototype.forEach.call(filterBar.children, function (el) {
        el.setAttribute("aria-pressed", String(el === b));
      });
      render();
    });
    return b;
  }

  function buildFilters() {
    if (!filterBar) return;
    var seen = [];
    all.forEach(function (post) {
      var c = B.field(post, "category");
      if (c && seen.indexOf(c) === -1) seen.push(c);
    });
    if (seen.length < 2) return; // one category is not a choice

    filterBar.innerHTML = "";
    filterBar.appendChild(chip("All", "*"));
    seen.sort().forEach(function (c) {
      var b = chip(c, c);
      b.style.setProperty("--c", B.channelFor(c)); // a pressed chip takes its category's channel
      filterBar.appendChild(b);
    });
    filterBar.hidden = false;
  }

  B.onReady(function () {
    if (!B.ready) {
      note("Posts aren't available right now.", "The CMS credentials are missing from this build. Everything else on the site still works — try the <a class=\"link-arrow\" href=\"/projects\">project archive</a>.");
      return;
    }

    list.innerHTML = B.skeletonHtml(6, true);

    B.posts({ limit: 200 })
      .then(function (res) {
        all = res.items;
        if (!all.length) {
          note("No posts yet.", "The first one is being written. Check back soon.");
          return;
        }
        buildFilters();
        render();
      })
      .catch(function (err) {
        if (window.console) console.error("[blog] could not load posts", err);
        note("Posts couldn't be loaded.", "The CMS did not answer. Please try again in a moment.");
      });
  });
})();
