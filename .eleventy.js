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

  // Decap CMS管理画面（/admin/）。ビルド不要の静的ファイルなのでそのままコピーする
  eleventyConfig.addPassthroughCopy("admin");

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
