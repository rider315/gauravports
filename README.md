# gauravports

Portfolio site of Gaurav Chaudhary — AI & full stack engineer. Static HTML, CSS
and vanilla JS, no framework and no build step beyond one generated config file.

```
index.html          home ("Phase Space": one oscilloscope signal behind every section)
experience/         work history
projects/           project archive, rendered from projects/projects.json
blog.html           the blog archive          ← posts come from Contentful
blog-post.html      a single post             ← posts come from Contentful
assets/css          style.css (shared design system) · home.css · venture.css
assets/js           site.js · scope.js (the signal) · home.js · blog-*.js
```

## The blog

Posts live in **Contentful** and are fetched in the browser from the Content
Delivery API. There is no CMS SDK on any page — `assets/js/blog-core.js` talks
to the REST endpoint directly and resolves the entry links itself.

| file | what it does |
| --- | --- |
| `assets/js/blog-core.js` | CDA client, rich-text → HTML, the shared `.post-card` markup |
| `assets/js/blog-home.js` | the three newest posts in the home page's **Notes** section |
| `assets/js/blog-all.js` | the archive at `/blog.html`, with category filters |
| `assets/js/blog-post.js` | a single post, its SEO/structured data, and prev/next |

Content type `portfolioBlogPost`:

| field | type | required |
| --- | --- | --- |
| `title` | short text | yes |
| `slug` | short text | yes — the URL is `/blog/<slug>` |
| `excerpt` | short text | no — otherwise taken from the body |
| `category` | short text | no — drives the filter chips and the accent colour |
| `author` | short text | no — defaults to Gaurav Chaudhary |
| `featuredImage` | media | no — a Lissajous placeholder is drawn instead |
| `content` | rich text | yes |

Nothing breaks when a field is missing, when there are no posts, or when the CMS
cannot be reached: the archive shows a short note and the home page drops its
Notes section rather than leaving a hole.

### Credentials

`generate-config.js` writes `assets/js/contentful-config.js` at build time from:

| variable | |
| --- | --- |
| `CONTENTFUL_SPACE_ID` | required |
| `CONTENTFUL_ACCESS_TOKEN` | required — the **Content Delivery** (read-only) token |
| `CONTENTFUL_ENVIRONMENT` | optional, defaults to `master` |

The generated file is git-ignored, so **it only exists after a build**. On Vercel
the variables live in Project → Settings → Environment Variables, and
`vercel.json` runs the build. If the blog ever goes quiet in production, check
that the deployment ran `node generate-config.js` and that
`/assets/js/contentful-config.js` is served with the space ID filled in.

The delivery token is read-only and public by design — it is what makes fetching
from the browser safe.

## Local development

```bash
cp /dev/null .env            # then add the two CONTENTFUL_* values
npm run build                # writes assets/js/contentful-config.js
python3 -m http.server 8000  # http://localhost:8000
```

Without a `.env`, everything but the blog works.

## Deployment

Vercel, from `vercel.json`: build `node generate-config.js`, serve the repository
root, and rewrite `/blog` → `blog.html` and `/blog/<slug>` → `blog-post.html`.
Post links are written as `blog-post.html?slug=…`, which works with or without
those rewrites, so the site also deploys as plain static files anywhere else.
