/* ==========================================================================
   A single post (/blog-post.html).

   Accepts  ?slug=my-post  ·  ?post=<entryId>  ·  /blog/my-post (host rewrite).
   Renders the article, fills in SEO and structured data, tints the page's
   oscilloscope with the category's channel, and offers the two neighbouring
   posts at the end.
   ========================================================================== */

(function () {
  "use strict";

  var B = window.Blog;
  var mount = document.querySelector("[data-post-body]");
  if (!B || !mount) return;

  var article = document.querySelector("[data-post]");

  /* ------------------------------------------------------------ the request */

  function identifier() {
    var params = new URLSearchParams(window.location.search);
    var slug = (params.get("slug") || "").trim();
    if (slug) return { type: "slug", value: slug };

    var id = (params.get("post") || "").trim();
    if (id) return { type: "id", value: id };

    // /blog/my-post, where the host rewrites to this file.
    var last = window.location.pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
    if (!last || /\.html$/.test(last)) return null;
    return { type: "slug", value: decodeURIComponent(last) };
  }

  function note(title, body) {
    mount.innerHTML = '<p class="blog-note"><b>' + B.escape(title) + "</b>" + (body || "") +
      '</p><p class="post-tail"><a class="link-arrow" href="/blog.html">All posts ' + arrow() + "</a></p>";
  }

  function arrow() {
    return '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /* ------------------------------------------------------------------- SEO */

  function setMeta(id, attr, value) {
    var el = document.getElementById(id);
    if (el) el.setAttribute(attr, value || "");
  }

  function canonicalFor(post) {
    var slug = B.field(post, "slug");
    return window.location.origin + (slug ? "/blog/" + encodeURIComponent(slug) : window.location.pathname + window.location.search);
  }

  function seo(post, cover) {
    var title = B.field(post, "title");
    var description = B.excerptOf(post, 160);
    var url = canonicalFor(post);
    var author = B.field(post, "author") || "Gaurav Chaudhary";
    var published = B.publishedAt(post);

    document.title = (title ? title + " · " : "") + "Notes · Gaurav Chaudhary";
    setMeta("metaDescription", "content", description);
    setMeta("canonicalLink", "href", url);
    setMeta("ogTitle", "content", title);
    setMeta("ogDescription", "content", description);
    setMeta("ogImage", "content", cover || (window.location.origin + "/assets/images/og-cover.png"));
    setMeta("ogUrl", "content", url);

    var jsonLd = document.getElementById("jsonLd");
    if (jsonLd) {
      jsonLd.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: title,
        description: description,
        image: cover ? [cover] : undefined,
        datePublished: published || undefined,
        dateModified: (post.sys && post.sys.updatedAt) || published || undefined,
        author: { "@type": "Person", name: author },
        publisher: { "@type": "Person", name: "Gaurav Chaudhary" },
        mainEntityOfPage: { "@type": "WebPage", "@id": url }
      });
    }
  }

  /* --------------------------------------------------------------- the post */

  function render(post) {
    var title = B.field(post, "title") || "Untitled";
    var category = B.field(post, "category");
    var author = B.field(post, "author");
    var image = B.field(post, "featuredImage");
    var content = B.field(post, "content");
    var date = B.publishedAt(post);
    var mins = B.readingTime(content);
    var standfirst = B.field(post, "excerpt");
    var ch = B.channel(category);
    var cover = B.imageUrl(image, { w: 1600 });

    if (article) article.style.setProperty("--c", ch.css);

    var head = '<header class="post-head">' +
      '<p class="post-kicker">' +
        (category ? '<span class="post-cat">' + B.escape(category) + "</span>" : "") +
        (date ? "<span>" + B.escape(B.formatDate(date, { day: "numeric", month: "long", year: "numeric" })) + "</span>" : "") +
      "</p>" +
      '<h1 class="post-h1">' + B.escape(title) + "</h1>" +
      (standfirst ? '<p class="post-standfirst">' + B.escape(standfirst) + "</p>" : "") +
      '<div class="post-byline">' +
        "<span>" + (author ? "By <b>" + B.escape(author) + "</b>" : "By <b>Gaurav Chaudhary</b>") + "</span>" +
        (mins ? '<span class="dot">' + B.escape(mins) + "</span>" : "") +
        '<button class="copy-link" type="button" data-copy>' +
          '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 3.5v-.2A1.3 1.3 0 0 0 9.2 2H3.3A1.3 1.3 0 0 0 2 3.3v5.9a1.3 1.3 0 0 0 1.3 1.3h.2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>' +
          "<span data-copy-label>Copy link</span>" +
        "</button>" +
      "</div>" +
    "</header>";

    var figure = cover
      ? '<figure class="post-cover"><img src="' + B.escape(cover) + '" alt="' + B.escape(B.imageAlt(image, title)) + '" width="1600" height="900" fetchpriority="high" decoding="async">' +
        (image.fields.description ? "<figcaption>" + B.escape(image.fields.description) + "</figcaption>" : "") +
        "</figure>"
      : "";

    var body = B.richTextToHtml(content);

    mount.innerHTML = head + figure +
      '<div class="post-copy">' + (body || "<p>This post has no body yet.</p>") + "</div>" +
      '<nav class="post-more" aria-label="More posts" data-more hidden><h2>Keep reading</h2><div class="post-grid" data-more-grid></div></nav>' +
      '<p class="post-tail"><a class="link-arrow" href="/blog.html">All posts ' + arrow() + "</a></p>";

    seo(post, cover);
    wireCopy();

    // The signal behind the page takes the category's channel. The scope may not
    // have started yet (page-scope.js waits for load + idle), so leave the tint
    // where it will pick it up and also apply it if it is already running.
    var tint = { cr: ch.rgb[0], cg: ch.rgb[1], cb: ch.rgb[2], label: ch.label };
    window.ScopeTint = tint;
    if (window.Scope) window.Scope.set(tint);

    neighbours(post);
  }

  function wireCopy() {
    var btn = mount.querySelector("[data-copy]");
    if (!btn) return;
    var label = btn.querySelector("[data-copy-label]");
    btn.addEventListener("click", function () {
      var url = (document.getElementById("canonicalLink") || {}).href || window.location.href;
      var done = function () {
        btn.setAttribute("data-copied", "1");
        if (label) label.textContent = "Link copied";
        setTimeout(function () {
          btn.removeAttribute("data-copied");
          if (label) label.textContent = "Copy link";
        }, 2200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { window.prompt("Copy this link", url); });
      } else {
        window.prompt("Copy this link", url);
      }
    });
  }

  /* The post before and after this one, so a reader has somewhere to go. */
  function neighbours(post) {
    var wrap = mount.querySelector("[data-more]");
    var grid = mount.querySelector("[data-more-grid]");
    if (!wrap || !grid) return;

    B.posts({ limit: 100 })
      .then(function (res) {
        var id = post.sys && post.sys.id;
        var items = res.items.filter(function (p) { return p.sys && p.sys.id !== id; });
        if (!items.length) return;

        var at = -1;
        res.items.forEach(function (p, i) { if (p.sys && p.sys.id === id) at = i; });

        var picks = [];
        if (at > -1) {
          if (res.items[at + 1]) picks.push(res.items[at + 1]); // older
          if (res.items[at - 1]) picks.push(res.items[at - 1]); // newer
        }
        while (picks.length < 2 && items.length) {
          var next = items.shift();
          if (picks.indexOf(next) === -1) picks.push(next);
        }

        grid.innerHTML = picks.slice(0, 2).map(function (p, i) { return B.cardHtml(p, i); }).join("");
        wrap.hidden = false;
      })
      .catch(function () { /* the article itself is what matters */ });
  }

  /* ------------------------------------------------------------------- boot */

  B.onReady(function () {
    if (!B.ready) {
      note("This post can't be loaded right now.", "The CMS credentials are missing from this build.");
      return;
    }

    var who = identifier();
    if (!who) {
      note("That link doesn't point to a post.", "It may have been shortened or mistyped.");
      return;
    }

    mount.innerHTML = '<p class="blog-note"><b>Loading post…</b></p>';

    var lookup = who.type === "slug" ? B.postBySlug(who.value) : B.postById(who.value);

    lookup
      .then(function (post) {
        if (!post) {
          note("Post not found.", "It may have been unpublished or renamed.");
          return;
        }
        render(post);
      })
      .catch(function (err) {
        if (window.console) console.error("[blog] could not load post", err);
        note("The post couldn't be loaded.", "The CMS did not answer. Please try again in a moment.");
      });
  });
})();
