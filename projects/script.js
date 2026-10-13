/* Project archive: renders /projects/projects.json and filters it by category. */
(function () {
  "use strict";

  var list = document.querySelector("[data-cards]");
  var count = document.querySelector("[data-count]");
  var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-filter]"));
  if (!list) return;

  var LABELS = { ai: "AI & ML", mern: "Full stack", android: "Android", web: ".NET & web", tools: "Tools", basicweb: "Early web" };
  var COLORS = { ai: "var(--ch3)", mern: "var(--ch2)", android: "var(--chm)", web: "var(--ch4)", tools: "var(--ch1)", basicweb: "var(--ink-2)" };
  var LISSAJOUS = "M20 10C17 5.2 13.6 2 9.5 2 5.4 2 2.5 5.6 2.5 10s2.9 8 7 8c4.1 0 7.5-3.2 10.5-8s6.4-8 10.5-8c4.1 0 7 3.6 7 8s-2.9 8-7 8c-4.1 0-7.5-3.2-10.5-8z";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function link(href, label) {
    var a = el("a", "ext", label);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function card(p, i) {
    var li = el("li", "card" + (p.featured ? " card--featured" : ""));
    li.dataset.category = p.category;
    li.style.setProperty("--n", String(i));
    li.style.setProperty("--c", COLORS[p.category] || "var(--ch4)");

    var media = el("div", "card-media");
    if (p.image) {
      var img = el("img");
      img.src = "/assets/images/opt/" + p.image + "-900.webp";
      img.alt = "Screenshot of " + p.name;
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 900;
      img.height = 506;
      media.appendChild(img);
    } else {
      var ph = el("div", "card-ph");
      ph.setAttribute("aria-hidden", "true");
      ph.innerHTML = '<svg viewBox="0 0 40 20"><path d="' + LISSAJOUS + '"/></svg>';
      ph.appendChild(el("span", null, "No screenshot"));
      media.appendChild(ph);
    }
    li.appendChild(media);

    var body = el("div", "card-body");
    var meta = el("p", "card-meta");
    if (p.year) meta.appendChild(el("span", null, String(p.year)));
    meta.appendChild(el("span", null, LABELS[p.category] || p.category));
    body.appendChild(meta);
    body.appendChild(el("h2", "card-title", p.name));
    body.appendChild(el("p", "card-desc", p.desc));
    if (p.stack && p.stack.length) body.appendChild(el("p", "card-stack", p.stack.join(" · ")));

    var links = el("p", "card-links");
    if (p.links && p.links.view) links.appendChild(link(p.links.view, p.viewLabel || "Live"));
    if (p.links && p.links.code) links.appendChild(link(p.links.code, "Code"));
    if (p.note) links.appendChild(el("span", "card-note", p.note));
    if (links.childNodes.length) body.appendChild(links);

    li.appendChild(body);
    return li;
  }

  function applyFilter(f) {
    var shown = 0;
    Array.prototype.forEach.call(list.children, function (li) {
      var on = f === "*" || li.dataset.category === f;
      li.hidden = !on;
      if (on) shown++;
    });
    buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.filter === f)); });
    if (count) count.textContent = "Showing " + shown + (shown === 1 ? " project" : " projects");
  }

  buttons.forEach(function (b) {
    b.addEventListener("click", function () { applyFilter(b.dataset.filter); });
  });

  fetch("/projects/projects.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (projects) {
      list.innerHTML = "";
      projects.forEach(function (p, i) { list.appendChild(card(p, i)); });
      applyFilter("*");
    })
    .catch(function (err) {
      if (window.console) console.error("Could not load projects", err);
      list.innerHTML = "";
      var li = el("li", "cards-loading", "Couldn't load the project list. Everything is also on GitHub: ");
      var a = link("https://github.com/rider315", "github.com/rider315");
      li.appendChild(a);
      list.appendChild(li);
    });
})();
