/**
 * Blog (homepage preview) - UPDATED
 * Works with BOTH config styles:
 *  - window.CONTENTFULCONFIG = { SPACEID, ACCESSTOKEN, ENVIRONMENT }
 *  - window.CONTENTFUL_CONFIG = { SPACE_ID, ACCESS_TOKEN, ENVIRONMENT }
 */

// 1) Resolve config safely (support both naming conventions)
const cfg = window.CONTENTFUL_CONFIG || window.CONTENTFULCONFIG;

const SPACE_ID = cfg?.SPACE_ID || cfg?.SPACEID;
const ACCESS_TOKEN = cfg?.ACCESS_TOKEN || cfg?.ACCESSTOKEN;
const ENVIRONMENT = cfg?.ENVIRONMENT || "master";

// 2) Hard guard: show a readable error if config is missing
if (!SPACE_ID || !ACCESS_TOKEN) {
  console.error(
    "Contentful config missing. Ensure contentful-config.js is loaded BEFORE this file and provides SPACE_ID/ACCESS_TOKEN (or SPACEID/ACCESSTOKEN)."
  );
}

// 3) Create client only if SDK + config exist
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

// Fetch blog posts (homepage preview)
async function fetchBlogPosts(limit = 3) {
  try {
    if (!contentfulClient) return [];

    const response = await contentfulClient.getEntries({
      content_type: "portfolioBlogPost",
      limit,
      order: "-sys.createdAt",
      include: 2,
    });

    return response?.items || [];
  } catch (error) {
    console.error("Error fetching blog posts:", error);
    return [];
  }
}

// Render blog posts (NO MODAL; links to dedicated page)
function renderBlogPosts(posts) {
  const blogContainer = document.getElementById("blogContainer");
  if (!blogContainer) return;

  if (!contentfulClient) {
    blogContainer.innerHTML = `
      <p class="blog-loading">
        Blog is not configured.
        <br>
        <span style="font-size:1.3rem;color:#777">
          (Missing Contentful config or Contentful SDK not loaded.)
        </span>
      </p>
    `;
    return;
  }

  if (!posts || posts.length === 0) {
    blogContainer.innerHTML = `
      <p class="blog-loading">
        No blog posts available yet.
        <br>
        <span style="font-size:1.3rem;color:#777">
          (If you have posts in Contentful, check console for 401/token or content_type mismatch.)
        </span>
      </p>
    `;
    return;
  }

  let blogHTML = "";

  posts.forEach((post) => {
    const fields = post.fields || {};
    const title = fields.title || "";
    const excerpt = fields.excerpt || "Read more about this topic...";
    const category = fields.category || "";
    const featuredImage = fields.featuredImage;
    const slug = fields.slug || "";
    const publishDate = post.sys?.createdAt;
    const postId = post.sys?.id;

    const imageUrl = featuredImage?.fields?.file?.url
      ? `https:${featuredImage.fields.file.url}?w=600&h=400&fit=fill`
      : "./assets/images/cmsoon.png";

    // Prefer slug URL (SEO), fallback to id if slug missing
    const postUrl = slug
      ? `blog-post.html?slug=${encodeURIComponent(slug)}`
      : `blog-post.html?post=${encodeURIComponent(postId)}`;

    blogHTML += `
      <a class="blog-card" href="${postUrl}" style="text-decoration:none;">
        <img src="${imageUrl}" alt="${title}" class="blog-image" draggable="false">
        <div class="blog-content">
          ${category ? `<span class="blog-category">${category}</span>` : ""}
          <h3 class="blog-title">${title}</h3>
          <p class="blog-excerpt">${excerpt}</p>
          <div class="blog-meta">
            <span class="blog-date">
              <i class="far fa-calendar-alt"></i>
              ${publishDate ? formatDate(publishDate) : ""}
            </span>
            <span class="read-more">
              Read More <i class="fas fa-arrow-right"></i>
            </span>
          </div>
        </div>
      </a>
    `;
  });

  blogContainer.innerHTML = blogHTML;
}

async function initBlog() {
  const blogContainer = document.getElementById("blogContainer");
  if (!blogContainer) return;

  blogContainer.innerHTML =
    '<p class="blog-loading"><i class="fas fa-spinner fa-spin"></i> Loading blog posts...</p>';

  const posts = await fetchBlogPosts(3);
  renderBlogPosts(posts);
}

// Load blog when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initBlog);
} else {
  initBlog();
}
