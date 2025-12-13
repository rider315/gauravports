/**
 * Blog Post Page - UPDATED
 * Supports config styles:
 *  - window.CONTENTFUL_CONFIG = { SPACE_ID, ACCESS_TOKEN, ENVIRONMENT }
 *  - window.CONTENTFULCONFIG  = { SPACEID,   ACCESSTOKEN, ENVIRONMENT }
 * NOTE: Ensure contentful-config.js is loaded BEFORE this file in blog-post.html. 
 */

// ---------- 1) Resolve Contentful config safely ----------
const cfg = window.CONTENTFUL_CONFIG || window.CONTENTFULCONFIG;

const SPACE_ID = cfg?.SPACE_ID || cfg?.SPACEID || "";
const ACCESS_TOKEN = cfg?.ACCESS_TOKEN || cfg?.ACCESSTOKEN || "";
const ENVIRONMENT = cfg?.ENVIRONMENT || "master";

// ---------- 2) Create client safely ----------
const contentfulClient =
  window.contentful && SPACE_ID && ACCESS_TOKEN
    ? contentful.createClient({
        space: SPACE_ID,
        accessToken: ACCESS_TOKEN,
        environment: ENVIRONMENT,
      })
    : null;

// Format date
function formatDate(dateString) {
  const options = { year: "numeric", month: "long", day: "numeric" };
  return new Date(dateString).toLocaleDateString("en-US", options);
}

/**
 * Supports:
 * 1) blog-post.html?slug=my-post
 * 2) blog-post.html?post=<entryId>
 * 3) /blog/my-post (only if your host rewrites to blog-post.html)
 */
function getPostIdentifierFromUrl() {
  const params = new URLSearchParams(window.location.search);

  const slug = (params.get("slug") || "").trim();
  if (slug) return { type: "slug", value: slug };

  const postId = (params.get("post") || "").trim();
  if (postId) return { type: "id", value: postId };

  const path = window.location.pathname.replace(/\/+$/, "");
  const lastSegment = path.split("/").filter(Boolean).pop() || "";
  if (!lastSegment || lastSegment.endsWith(".html")) return null;

  return { type: "slug", value: lastSegment };
}

async function fetchPostBySlug(slug) {
  try {
    if (!contentfulClient) return null;

    const res = await contentfulClient.getEntries({
      content_type: "portfolioBlogPost",
      "fields.slug": slug,
      limit: 1,
      include: 2,
    });

    return res?.items?.[0] || null;
  } catch (err) {
    console.error("Error fetching blog post by slug:", err);
    return null;
  }
}

async function fetchPostById(entryId) {
  try {
    if (!contentfulClient) return null;

    const res = await contentfulClient.getEntries({
      "sys.id": entryId,
      limit: 1,
      include: 2,
    });

    return res?.items?.[0] || null;
  } catch (err) {
    console.error("Error fetching blog post by id:", err);
    return null;
  }
}

// Simple safety: prevents accidental HTML injection from plain text fields
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Minimal rich-text renderer (headings/paragraphs/bullets)
function parseRichText(richText) {
  if (!richText || !richText.content) return "";

  let html = "";
  richText.content.forEach((node) => {
    if (node.nodeType === "paragraph") {
      const text = node.content?.map((c) => c.value || "").join("") || "";
      html += `<p>${escapeHtml(text)}</p>`;
    } else if (node.nodeType === "heading-1") {
      const text = node.content?.map((c) => c.value || "").join("") || "";
      html += `<h2>${escapeHtml(text)}</h2>`;
    } else if (node.nodeType === "heading-2") {
      const text = node.content?.map((c) => c.value || "").join("") || "";
      html += `<h3>${escapeHtml(text)}</h3>`;
    } else if (node.nodeType === "unordered-list") {
      html += "<ul>";
      node.content?.forEach((item) => {
        const text =
          item.content?.[0]?.content?.map((c) => c.value || "").join("") || "";
        html += `<li>${escapeHtml(text)}</li>`;
      });
      html += "</ul>";
    }
  });

  return html;
}

function setSeo({ title, description, imageUrl, canonicalUrl, publishedTime, author }) {
  document.title = title ? `${title} | Blog` : "Blog Post";

  const metaDesc = document.getElementById("metaDescription");
  if (metaDesc) metaDesc.setAttribute("content", description || "");

  const canonical = document.getElementById("canonicalLink");
  if (canonical) canonical.setAttribute("href", canonicalUrl || window.location.href);

  const ogTitle = document.getElementById("ogTitle");
  if (ogTitle) ogTitle.setAttribute("content", title || "");

  const ogDesc = document.getElementById("ogDescription");
  if (ogDesc) ogDesc.setAttribute("content", description || "");

  const ogImg = document.getElementById("ogImage");
  if (ogImg) ogImg.setAttribute("content", imageUrl || "");

  const ogUrl = document.getElementById("ogUrl");
  if (ogUrl) ogUrl.setAttribute("content", canonicalUrl || window.location.href);

  const jsonLd = document.getElementById("jsonLd");
  if (jsonLd) {
    const data = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: title || "",
      description: description || "",
      image: imageUrl ? [imageUrl] : undefined,
      datePublished: publishedTime || undefined,
      author: author ? { "@type": "Person", name: author } : undefined,
      mainEntityOfPage: canonicalUrl || window.location.href,
    };

    jsonLd.textContent = JSON.stringify(data);
  }
}

function toAbsoluteUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  // handles "./assets/..." or "/assets/..."
  const cleaned = url.replace(/^\.\//, "");
  return `${window.location.origin}/${cleaned}`.replace(/([^:]\/)\/+/g, "$1");
}

function renderPost(post, slugForCanonical) {
  const container = document.getElementById("blogPostContainer");
  if (!container) return;

  if (!contentfulClient) {
    container.innerHTML = `
      <p class="blog-error">Blog is not configured.</p>
      <p style="text-align:center; font-size: 1.6rem;">
        (Load Contentful SDK + contentful-config.js before blog-post.js)
      </p>
      <p style="text-align:center; font-size: 1.6rem;">
        <a class="read-more" href="./blog.html">Go back to all posts</a>
      </p>
    `;
    return;
  }

  if (!post) {
    container.innerHTML = `
      <p class="blog-error">Post not found.</p>
      <p style="text-align:center; font-size: 1.6rem;">
        <a class="read-more" href="./blog.html">Go back to all posts</a>
      </p>
    `;
    return;
  }

  const fields = post.fields || {};
  const title = fields.title || "";
  const content = fields.content;
  const category = fields.category || "";
  const featuredImage = fields.featuredImage;
  const author = fields.author || "";
  const excerpt = fields.excerpt || "";
  const publishDate = post.sys?.createdAt;

  const imageUrl = featuredImage?.fields?.file?.url
    ? `https:${featuredImage.fields.file.url}?w=1200&h=600&fit=fill`
    : "./assets/images/cmsoon.png";

  const contentHtml =
    content && content.content
      ? parseRichText(content)
      : typeof content === "string"
        ? `<p>${escapeHtml(content)}</p>`
        : "";

  const canonicalUrl = slugForCanonical
    ? `${window.location.origin}/blog/${encodeURIComponent(slugForCanonical)}`
    : window.location.href;

  setSeo({
    title,
    description: excerpt,
    imageUrl: toAbsoluteUrl(imageUrl),
    canonicalUrl,
    publishedTime: publishDate,
    author,
  });

  container.innerHTML = `
    <img src="${imageUrl}" alt="${escapeHtml(title || "Blog image")}" class="blog-post-image">
    ${category ? `<span class="blog-category">${escapeHtml(category)}</span>` : ""}
    <h1 class="blog-post-title">${escapeHtml(title)}</h1>

    <div class="blog-post-meta">
      ${author ? `<span><i class="fas fa-user"></i> ${escapeHtml(author)}</span>` : ""}
      <span><i class="far fa-calendar-alt"></i> ${publishDate ? formatDate(publishDate) : ""}</span>
    </div>

    <div class="blog-post-content">${contentHtml}</div>

    <div style="margin-top: 3rem;">
      <a class="read-more" href="./blog.html"><i class="fas fa-arrow-left"></i> Back to all posts</a>
    </div>
  `;
}

async function initBlogPost() {
  const container = document.getElementById("blogPostContainer");
  const identifier = getPostIdentifierFromUrl();

  if (!identifier) {
    if (container) {
      container.innerHTML = `
        <p class="blog-error">Missing post slug or id.</p>
        <p style="text-align:center; font-size: 1.6rem;">
          <a class="read-more" href="./blog.html">Go back to all posts</a>
        </p>
      `;
    }
    return;
  }

  if (container) {
    container.innerHTML = `
      <p class="blog-loading"><i class="fas fa-spinner fa-spin"></i> Loading post...</p>
    `;
  }

  let post = null;
  let slugForCanonical = null;

  if (identifier.type === "slug") {
    slugForCanonical = identifier.value;
    post = await fetchPostBySlug(identifier.value);
  } else {
    post = await fetchPostById(identifier.value);
    slugForCanonical = post?.fields?.slug || null;
  }

  renderPost(post, slugForCanonical);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initBlogPost);
} else {
  initBlogPost();
}
