const markdownIt = require("markdown-it");
const markdownItContainer = require("markdown-it-container");
const markdownItAnchor = require("markdown-it-anchor");

// 見出しIDを安全に生成する関数
// ・日本語はそのまま活かす（空文字にしない）
// ・記号・空白は取り除く
// ・同名見出しの重複は markdown-it-anchor が自動で -1, -2 を付与する
function safeSlugify(input) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[<>&"'`]/g, "")
    .replace(/[!?！？。、：:；;（）()「」『』・…\/\\#]/g, "");
}

module.exports = function (eleventyConfig) {
  // ---------- 既存ファイルの受け渡し（無変換・バイト単位で維持） ----------
  eleventyConfig.addPassthroughCopy("index.html");
  eleventyConfig.addPassthroughCopy("og-image.jpg");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy("sitemap.xml");

  // コラム用の静的アセット（CSS・JS・アップロード画像）
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // ---------- 共通データ（content/_data 配下）----------
  eleventyConfig.addGlobalData("categories", () => {
    delete require.cache[require.resolve("./content/_data/categories.json")];
    return require("./content/_data/categories.json");
  });
  eleventyConfig.addGlobalData("site", () => {
    delete require.cache[require.resolve("./content/_data/site.json")];
    return require("./content/_data/site.json");
  });
  eleventyConfig.addGlobalData("categoryList", () => {
    delete require.cache[require.resolve("./content/_data/categories.json")];
    const categories = require("./content/_data/categories.json");
    return Object.keys(categories).map((slug) => ({
      slug,
      name: categories[slug].name,
      description: categories[slug].description,
    }));
  });

  // ---------- Markdown設定 ----------
  const md = markdownIt({ html: false, breaks: false, linkify: true })
    .use(markdownItAnchor, {
      slugify: safeSlugify,
      level: [2, 3],
    })
    .use(markdownItContainer, "note", {
      render: function (tokens, idx) {
        return tokens[idx].nesting === 1
          ? '<div class="callout">\n'
          : "</div>\n";
      },
    })
    .use(markdownItContainer, "cta", {
      render: function (tokens, idx) {
        return tokens[idx].nesting === 1
          ? '<div class="inline-cta">\n'
          : "</div>\n";
      },
    });
  eleventyConfig.setLibrary("md", md);

  // ---------- 記事コレクション ----------
  eleventyConfig.addCollection("columnArticlesAll", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("content/column/articles/*.md")
      .sort(
        (a, b) => new Date(b.data.publish_date) - new Date(a.data.publish_date)
      );
  });

  eleventyConfig.addCollection("columnArticles", function (collectionApi) {
    const now = new Date();
    return collectionApi
      .getFilteredByGlob("content/column/articles/*.md")
      .filter((item) => {
        if (item.data.draft) return false;
        if (!item.data.publish_date) return false;
        if (new Date(item.data.publish_date) > now) return false;
        return true;
      })
      .sort(
        (a, b) => new Date(b.data.publish_date) - new Date(a.data.publish_date)
      );
  });

  eleventyConfig.addCollection("columnTagList", function (collectionApi) {
    const now = new Date();
    const articles = collectionApi
      .getFilteredByGlob("content/column/articles/*.md")
      .filter((item) => {
        if (item.data.draft) return false;
        if (!item.data.publish_date) return false;
        if (new Date(item.data.publish_date) > now) return false;
        return true;
      });
    const set = new Set();
    articles.forEach((a) => (a.data.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).map((tag) => ({ tag }));
  });

  // ---------- フィルター ----------

  eleventyConfig.addFilter("jaDate", function (dateInput) {
    if (!dateInput) return "";
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  });

  eleventyConfig.addFilter("isoDate", function (dateInput) {
    if (!dateInput) return "";
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    return d.toISOString();
  });

  eleventyConfig.addFilter("readingTime", function (htmlContent) {
    if (!htmlContent) return 1;
    const text = String(htmlContent).replace(/<[^>]+>/g, "");
    const charCount = text.length;
    return Math.max(1, Math.round(charCount / 500));
  });

  eleventyConfig.addFilter("safeExcerpt", function (text, maxLen) {
    maxLen = maxLen || 120;
    if (!text) return "";
    const clean = String(text)
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (clean.length <= maxLen) return clean;
    const cut = clean.slice(0, maxLen);
    const lastPunct = Math.max(
      cut.lastIndexOf("。"),
      cut.lastIndexOf("！"),
      cut.lastIndexOf("？")
    );
    if (lastPunct > maxLen * 0.5) {
      return cut.slice(0, lastPunct + 1);
    }
    const lastComma = cut.lastIndexOf("、");
    if (lastComma > maxLen * 0.5) {
      return cut.slice(0, lastComma) + "…";
    }
    return cut + "…";
  });

  eleventyConfig.addFilter("extractToc", function (htmlContent) {
    if (!htmlContent) return [];
    const headingRegex = /<(h2|h3)\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;
    const items = [];
    let match;
    while ((match = headingRegex.exec(htmlContent)) !== null) {
      items.push({
        level: match[1],
        id: match[2],
        text: match[3].replace(/<[^>]+>/g, "").trim(),
      });
    }
    return items;
  });

  eleventyConfig.addFilter("relatedArticles", function (
    currentArticle,
    allArticles
  ) {
    if (!currentArticle || !allArticles) return [];
    const current = currentArticle.data;
    const pool = allArticles.filter((a) => a.data.slug !== current.slug);
    let picks = [];

    if (current.related_articles && current.related_articles.length) {
      current.related_articles.forEach((slug) => {
        const found = pool.find((a) => a.data.slug === slug);
        if (found && !picks.includes(found)) picks.push(found);
      });
    }
    if (picks.length < 4) {
      const sameCat = pool.filter(
        (a) => a.data.category === current.category && !picks.includes(a)
      );
      picks = picks.concat(sameCat.slice(0, 4 - picks.length));
    }
    if (picks.length < 4 && current.tags && current.tags.length) {
      const sameTag = pool.filter(
        (a) =>
          !picks.includes(a) &&
          a.data.tags &&
          a.data.tags.some((t) => current.tags.includes(t))
      );
      picks = picks.concat(sameTag.slice(0, 4 - picks.length));
    }
    if (picks.length < 4) {
      const recent = pool.filter((a) => !picks.includes(a));
      picks = picks.concat(recent.slice(0, 4 - picks.length));
    }
    return picks.slice(0, 4);
  });

  eleventyConfig.addFilter("prevArticle", function (currentArticle, allArticles) {
    const idx = allArticles.findIndex((a) => a.data.slug === currentArticle.data.slug);
    if (idx === -1 || idx === allArticles.length - 1) return null;
    return allArticles[idx + 1];
  });
  eleventyConfig.addFilter("nextArticle", function (currentArticle, allArticles) {
    const idx = allArticles.findIndex((a) => a.data.slug === currentArticle.data.slug);
    if (idx <= 0) return null;
    return allArticles[idx - 1];
  });

  eleventyConfig.addFilter("allTags", function (allArticles) {
    const set = new Set();
    allArticles.forEach((a) => {
      (a.data.tags || []).forEach((t) => set.add(t));
    });
    return Array.from(set);
  });

  eleventyConfig.addFilter("byTag", function (allArticles, tag) {
    return allArticles.filter((a) => (a.data.tags || []).includes(tag));
  });

  eleventyConfig.addFilter("byCategory", function (allArticles, categorySlug) {
    return allArticles.filter((a) => a.data.category === categorySlug);
  });

  eleventyConfig.addFilter("featuredOnly", function (allArticles) {
    return (allArticles || []).filter((a) => a.data.featured);
  });

  eleventyConfig.addFilter("firstN", function (allArticles, n) {
    return (allArticles || []).slice(0, n);
  });

  eleventyConfig.addFilter("absoluteUrl", function (path, siteUrl) {
    if (!path) return siteUrl;
    if (path.startsWith("http")) return path;
    return siteUrl.replace(/\/$/, "") + path;
  });

  eleventyConfig.addFilter("metaTitle", function (data, siteName) {
    if (!data) return siteName || "";
    const base =
      data.seo_title && String(data.seo_title).trim()
        ? String(data.seo_title).trim()
        : data.title || "";
    if (!base) return siteName || "";
    if (siteName && !base.includes(siteName)) {
      return `${base}｜${siteName}コラム`;
    }
    return base;
  });

  eleventyConfig.addFilter("metaDescription", function (data, defaultText) {
    if (!data) return defaultText || "";
    if (data.meta_description && String(data.meta_description).trim()) {
      const clean = String(data.meta_description).trim();
      return clean.length > 160 ? clean.slice(0, 160) : clean;
    }
    if (data.excerpt && String(data.excerpt).trim()) {
      const clean = String(data.excerpt)
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return clean.length > 160 ? clean.slice(0, 157) + "…" : clean;
    }
    return defaultText || "";
  });

  eleventyConfig.addFilter("canonicalFor", function (data, siteUrl, fallbackPath) {
    const base = String(siteUrl || "").replace(/\/$/, "");
    if (data && data.canonical_url && String(data.canonical_url).trim()) {
      return String(data.canonical_url).trim();
    }
    return base + (fallbackPath || "/");
  });

  eleventyConfig.addFilter("ogImageFor", function (data, site) {
    const base = String((site && site.siteUrl) || "").replace(/\/$/, "");
    if (data && data.featured_image && String(data.featured_image).trim()) {
      const img = String(data.featured_image).trim();
      return img.startsWith("http") ? img : base + img;
    }
    return base + ((site && site.ogImagePath) || "/og-image.jpg");
  });

  eleventyConfig.addFilter("robotsMeta", function (data) {
    if (data && data.noindex) return "noindex,follow";
    return "index,follow";
  });

  eleventyConfig.addFilter("articleStructuredData", function (articleData, site) {
    const base = String((site && site.siteUrl) || "").replace(/\/$/, "");
    const url = base + "/column/" + articleData.slug + "/";
    const published = articleData.publish_date
      ? new Date(articleData.publish_date).toISOString()
      : undefined;
    const modified = articleData.updated_date
      ? new Date(articleData.updated_date).toISOString()
      : published;

    const articleNode = {
      "@type": "Article",
      headline: articleData.title,
      description:
        articleData.meta_description ||
        articleData.excerpt ||
        (site && site.defaultMetaDescription) ||
        "",
      url: url,
      author: {
        "@type": "Person",
        name: articleData.author || (site && site.siteName) || "",
      },
      publisher: {
        "@type": "Organization",
        name: (site && site.siteName) || "",
        logo: {
          "@type": "ImageObject",
          url: base + ((site && site.ogImagePath) || "/og-image.jpg"),
        },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
    };
    if (published) articleNode.datePublished = published;
    if (modified) articleNode.dateModified = modified;
    if (articleData.featured_image) {
      articleNode.image = articleData.featured_image.startsWith("http")
        ? articleData.featured_image
        : base + articleData.featured_image;
    }

    const graph = [articleNode];

    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "ホーム", item: base + "/" },
        { "@type": "ListItem", position: 2, name: "コラム", item: base + "/column/" },
        { "@type": "ListItem", position: 3, name: articleData.title, item: url },
      ],
    });

    if (Array.isArray(articleData.faq) && articleData.faq.length) {
      graph.push({
        "@type": "FAQPage",
        mainEntity: articleData.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      });
    }

    return { "@context": "https://schema.org", "@graph": graph };
  });

  eleventyConfig.addFilter("listPageStructuredData", function (
    site,
    pageName,
    pagePath
  ) {
    const base = String((site && site.siteUrl) || "").replace(/\/$/, "");
    const url = base + pagePath;
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          name: pageName,
          url: url,
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "ホーム", item: base + "/" },
            { "@type": "ListItem", position: 2, name: "コラム", item: base + "/column/" },
            { "@type": "ListItem", position: 3, name: pageName, item: url },
          ],
        },
      ],
    };
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
  };
};
