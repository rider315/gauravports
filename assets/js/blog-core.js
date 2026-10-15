/* ==========================================================================
   Blog core — shared by the home "Notes" strip, /blog.html and /blog-post.html.

   Talks to the Contentful Content Delivery API over plain fetch, so no CMS SDK
   is downloaded on any page. Credentials come from assets/js/contentful-config.js,
   which `node generate-config.js` writes at build time from the environment:

     CONTENTFUL_SPACE_ID · CONTENTFUL_ACCESS_TOKEN · CONTENTFUL_ENVIRONMENT

   Nothing here throws when that file is missing (local checkouts, a build that
   skipped the step): Blog.ready is false and every page falls back quietly.

   Content type: portfolioBlogPost
     title · slug · excerpt · category · author · featuredImage · content (rich text)
   ========================================================================== */

window.Blog = (function () {
  "use strict";

  var cfg = window.CONTENTFUL_CONFIG || window.CONTENTFULCONFIG || {};
  var SPACE = cfg.SPACE_ID || cfg.SPACEID || "";
  var TOKEN = cfg.ACCESS_TOKEN || cfg.ACCESSTOKEN || "";
  var ENV = cfg.ENVIRONMENT || "master";
  var TYPE = "portfolioBlogPost";
  var ready = !!(SPACE && TOKEN);

  if (!ready && window.console) {
    console.warn("[blog] Contentful config missing — run `npm run build` with CONTENTFUL_SPACE_ID and CONTENTFUL_ACCESS_TOKEN set.");
  }

  var LISSAJOUS = "M20 10C17 5.2 13.6 2 9.5 2 5.4 2 2.5 5.6 2.5 10s2.9 8 7 8c4.1 0 7.5-3.2 10.5-8s6.4-8 10.5-8c4.1 0 7 3.6 7 8s-2.9 8-7 8c-4.1 0-7.5-3.2-10.5-8z";

  /* Each post gets an oscilloscope channel from its category, so a category keeps
     the same colour everywhere on the site — card accent, article links, and the
     signal behind the page. */
  var CHANNELS = [
    { css: "var(--ch1)", rgb: [255, 181, 71], label: "CH1" },
    { css: "var(--ch2)", rgb: [92, 225, 255], label: "CH2" },
    { css: "var(--ch3)", rgb: [255, 95, 162], label: "CH3" },
    { css: "var(--ch4)", rgb: [164, 147, 255], label: "CH4" },
    { css: "var(--chm)", rgb: [124, 240, 168], label: "MATH" }
  ];

  function channel(category) {
    var key = String(category || "").trim().toLowerCase();
    if (!key) return CHANNELS[0];
    var h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 9973;
    return CHANNELS[h % CHANNELS.length];
  }

  function channelFor(category) {
    return channel(category).css;
  }

  /* ----------------------------------------------------------------- escaping */

  var ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return ENTITIES[c]; });
  }

  /* Only http(s), mailto and same-document links survive, so a CMS field can
     never turn into a javascript: URL. */
  function safeUrl(url) {
    var raw = String(url == null ? "" : url).trim();
    if (!raw) return "";
    if (/^(https?:|mailto:)/i.test(raw)) return raw;
    if (/^(\/|\.|#|\?)/.test(raw)) return raw;
    if (/^\/\//.test(raw)) return "https:" + raw;
    return "";
  }

  /* ------------------------------------------------------- link resolution */

  /* The CDA returns links as { sys: { type: "Link", linkType, id } } plus a flat
     `includes` bag. Walk the tree once and swap each link for the real thing. */
  function resolve(data) {
    var byId = {};
    var inc = data.includes || {};
    ["Entry", "Asset"].forEach(function (kind) {
      (inc[kind] || []).forEach(function (item) { byId[item.sys.id] = item; });
    });
    (data.items || []).forEach(function (item) { byId[item.sys.id] = item; });

    function walk(node, depth, seen) {
      if (!node || typeof node !== "object" || depth > 6) return node;
      if (Array.isArray(node)) {
        return node.map(function (n) { return walk(n, depth + 1, seen); });
      }
      if (node.sys && node.sys.type === "Link") {
        var target = byId[node.sys.id];
        if (!target || seen.indexOf(node.sys.id) !== -1) return null;
        return walk(target, depth + 1, seen.concat(node.sys.id));
      }
      var out = {};
      for (var key in node) {
        if (Object.prototype.hasOwnProperty.call(node, key)) out[key] = walk(node[key], depth + 1, seen);
      }
      return out;
    }

    return (data.items || []).map(function (item) { return walk(item, 0, [item.sys.id]); });
  }

  /* ------------------------------------------------------------------ fetch */

  function request(params) {
    if (!ready) return Promise.resolve({ items: [], total: 0 });

    var query = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
    }).join("&");

    var url = "https://cdn.contentful.com/spaces/" + encodeURIComponent(SPACE) +
      "/environments/" + encodeURIComponent(ENV) + "/entries?" + query;

    return fetch(url, { headers: { Authorization: "Bearer " + TOKEN } })
      .then(function (res) {
        if (!res.ok) throw new Error("Contentful HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        return { items: resolve(data), total: data.total || 0 };
      });
  }

  /* Newest first. `limit` caps the page; Contentful allows up to 1000. */
  function posts(options) {
    var opts = options || {};
    var params = {
      content_type: TYPE,
      order: "-sys.createdAt",
      include: 2,
      limit: opts.limit || 100
    };
    if (opts.skip) params.skip = opts.skip;
    return request(params);
  }

  function postBySlug(slug) {
    return request({ content_type: TYPE, "fields.slug": slug, include: 2, limit: 1 })
      .then(function (r) { return r.items[0] || null; });
  }

  function postById(id) {
    return request({ content_type: TYPE, "sys.id": id, include: 2, limit: 1 })
      .then(function (r) { return r.items[0] || null; });
  }

  /* ----------------------------------------------------------------- fields */

  function f(post, name) {
    return (post && post.fields && post.fields[name]) || "";
  }

  function publishedAt(post) {
    var fields = (post && post.fields) || {};
    var sys = (post && post.sys) || {};
    return fields.publishDate || fields.date || sys.createdAt || "";
  }

  function formatDate(iso, opts) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", opts || { day: "numeric", month: "short", year: "numeric" });
  }

  function imageUrl(asset, opts) {
    var file = asset && asset.fields && asset.fields.file;
    if (!file || !file.url) return "";
    var o = opts || {};
    var q = ["fm=webp", "q=" + (o.q || 72)];
    if (o.w) q.push("w=" + o.w);
    if (o.h) q.push("h=" + o.h);
    if (o.w && o.h) q.push("fit=fill", "f=center");
    return "https:" + file.url + "?" + q.join("&");
  }

  function imageAlt(asset, fallback) {
    var fields = (asset && asset.fields) || {};
    return fields.description || fields.title || fallback || "";
  }

  /* ------------------------------------------------------------- rich text */

  /* Plain text of a rich-text document, for excerpts and reading time. */
  function plainText(node) {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (node.nodeType === "text") return node.value || "";
    var kids = node.content || [];
    var out = "";
    for (var i = 0; i < kids.length; i++) out += plainText(kids[i]) + " ";
    return out;
  }

  function readingTime(content) {
    var words = plainText(content).trim().split(/\s+/).filter(Boolean).length;
    if (!words) return "";
    return Math.max(1, Math.round(words / 220)) + " min read";
  }

  function excerptOf(post, max) {
    var written = f(post, "excerpt");
    var text = written || plainText(f(post, "content"));
    text = String(text).replace(/\s+/g, " ").trim();
    var cap = max || 190;
    if (text.length <= cap) return text;
    var cut = text.slice(0, cap);
    var lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:–-]$/, "") + "…";
  }

  var MARKS = {
    bold: ["<strong>", "</strong>"],
    italic: ["<em>", "</em>"],
    underline: ["<u>", "</u>"],
    code: ["<code>", "</code>"],
    superscript: ["<sup>", "</sup>"],
    subscript: ["<sub>", "</sub>"]
  };

  function textNode(node) {
    var html = esc(node.value || "").replace(/\n/g, "<br>");
    (node.marks || []).forEach(function (mark) {
      var tag = MARKS[mark.type];
      if (tag) html = tag[0] + html + tag[1];
    });
    return html;
  }

  var HEADINGS = {
    "heading-1": "h2", // the post title is the page's only h1
    "heading-2": "h2",
    "heading-3": "h3",
    "heading-4": "h4",
    "heading-5": "h5",
    "heading-6": "h6"
  };

  function children(node) {
    return (node.content || []).map(function (child) { return richNode(child); }).join("");
  }

  function postHref(post) {
    var slug = f(post, "slug");
    var id = (post && post.sys && post.sys.id) || "";
    if (slug) return "/blog-post.html?slug=" + encodeURIComponent(slug);
    return id ? "/blog-post.html?post=" + encodeURIComponent(id) : "/blog.html";
  }

  function richNode(node) {
    if (!node) return "";
    var type = node.nodeType;
    var data = node.data || {};

    if (type === "text") return textNode(node);
    if (HEADINGS[type]) return "<" + HEADINGS[type] + ">" + children(node) + "</" + HEADINGS[type] + ">";

    switch (type) {
      case "document":
        return children(node);
      case "paragraph":
        var inner = children(node);
        return inner.replace(/<br>/g, "").trim() ? "<p>" + inner + "</p>" : "";
      case "unordered-list":
        return "<ul>" + children(node) + "</ul>";
      case "ordered-list":
        return "<ol>" + children(node) + "</ol>";
      case "list-item":
        return "<li>" + children(node) + "</li>";
      case "blockquote":
        return "<blockquote>" + children(node) + "</blockquote>";
      case "hr":
        return "<hr>";
      case "hyperlink":
        var href = safeUrl(data.uri);
        if (!href) return children(node);
        var external = /^https?:/i.test(href) && href.indexOf(window.location.host) === -1;
        return '<a href="' + esc(href) + '"' +
          (external ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" + children(node) + "</a>";
      case "asset-hyperlink":
        var assetUrl = data.target && data.target.fields && data.target.fields.file && data.target.fields.file.url;
        var safeAsset = safeUrl(assetUrl ? "https:" + assetUrl : "");
        return safeAsset
          ? '<a href="' + esc(safeAsset) + '" target="_blank" rel="noopener noreferrer">' + children(node) + "</a>"
          : children(node);
      case "entry-hyperlink":
        return '<a href="' + esc(postHref(data.target)) + '">' + children(node) + "</a>";
      case "embedded-asset-block":
        return assetFigure(data.target);
      case "embedded-entry-block":
      case "embedded-entry-inline":
        var title = f(data.target, "title");
        return title ? '<p><a href="' + esc(postHref(data.target)) + '">' + esc(title) + "</a></p>" : "";
      case "table":
        return '<div class="post-table"><table>' + children(node) + "</table></div>";
      case "table-row":
        return "<tr>" + children(node) + "</tr>";
      case "table-cell":
        return "<td>" + children(node) + "</td>";
      case "table-header-cell":
        return "<th>" + children(node) + "</th>";
      default:
        return children(node);
    }
  }

  function assetFigure(asset) {
    var file = asset && asset.fields && asset.fields.file;
    if (!file || !file.url) return "";
    var type = file.contentType || "";

    if (type.indexOf("image/") !== 0) {
      var href = safeUrl("https:" + file.url);
      return href
        ? '<p><a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' +
          esc(asset.fields.title || "Download") + "</a></p>"
        : "";
    }

    var caption = asset.fields.description || "";
    var dims = (file.details && file.details.image) || {};
    return '<figure class="post-figure">' +
      '<img src="' + esc(imageUrl(asset, { w: 1200 })) + '" alt="' + esc(imageAlt(asset)) + '"' +
      (dims.width ? ' width="' + dims.width + '" height="' + dims.height + '"' : "") +
      ' loading="lazy" decoding="async">' +
      (caption ? '<figcaption>' + esc(caption) + "</figcaption>" : "") +
      "</figure>";
  }

  function richTextToHtml(content) {
    if (!content) return "";
    if (typeof content === "string") {
      return content.split(/\n{2,}/).map(function (p) {
        return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>";
      }).join("");
    }
    return richNode(content);
  }

  /* ------------------------------------------------------------- post card */

  /* One card component, used by the home strip and the archive, so the two can
     never drift apart. Returns an <a>; the archive wraps it in an <li>. */
  function cardHtml(post, index, opts) {
    var o = opts || {};
    var title = f(post, "title") || "Untitled";
    var category = f(post, "category");
    var image = f(post, "featuredImage");
    var date = publishedAt(post);
    var mins = readingTime(f(post, "content"));
    var src = imageUrl(image, o.featured ? { w: 1200, h: 760 } : { w: 760, h: 428 });

    var media = src
      ? '<img src="' + esc(src) + '" alt="' + esc(imageAlt(image, title)) + '" loading="lazy" decoding="async" width="760" height="428">'
      : '<span class="post-ph" aria-hidden="true"><svg viewBox="0 0 40 20"><path d="' + LISSAJOUS + '"/></svg><span>No cover</span></span>';

    return '<a class="post-card' + (o.featured ? " post-card--featured" : "") + '" href="' + esc(postHref(post)) + '"' +
      ' style="--n: ' + (index || 0) + '; --c: ' + channelFor(category) + '"' +
      (category ? ' data-category="' + esc(category) + '"' : "") + ">" +
      '<span class="post-media">' + media + "</span>" +
      '<span class="post-body">' +
        '<span class="post-meta">' +
          (date ? "<span>" + esc(formatDate(date)) + "</span>" : "") +
          (category ? '<span class="post-cat">' + esc(category) + "</span>" : "") +
        "</span>" +
        "<" + (o.heading || "h3") + ' class="post-title">' + esc(title) + "</" + (o.heading || "h3") + ">" +
        '<span class="post-excerpt">' + esc(excerptOf(post, o.featured ? 240 : 150)) + "</span>" +
        '<span class="post-foot">' +
          '<span class="post-read">Read' +
            '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          "</span>" +
          (mins ? '<span class="post-time">' + esc(mins) + "</span>" : "") +
        "</span>" +
      "</span>" +
    "</a>";
  }

  /* Placeholder cards that hold the grid's height while the CMS answers, so the
     page does not jump when posts land. */
  function skeletonHtml(count, wrap) {
    var one = '<span class="post-skel" aria-hidden="true"><span class="post-skel-media"></span>' +
      '<span class="post-skel-body"><span></span><span></span><span></span></span></span>';
    var out = "";
    for (var i = 0; i < (count || 3); i++) out += wrap ? "<li>" + one + "</li>" : one;
    return out;
  }

  function onReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  return {
    ready: ready,
    LISSAJOUS: LISSAJOUS,
    posts: posts,
    postBySlug: postBySlug,
    postById: postById,
    field: f,
    publishedAt: publishedAt,
    formatDate: formatDate,
    imageUrl: imageUrl,
    imageAlt: imageAlt,
    channel: channel,
    channelFor: channelFor,
    plainText: plainText,
    readingTime: readingTime,
    excerptOf: excerptOf,
    richTextToHtml: richTextToHtml,
    postHref: postHref,
    cardHtml: cardHtml,
    skeletonHtml: skeletonHtml,
    escape: esc,
    onReady: onReady
  };
})();
