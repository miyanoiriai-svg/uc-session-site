/*
 * column.js
 * コラムの検索ページ（/column/search/）専用の軽量クライアントサイド検索。
 * ・外部サービスに依存しない（build時に生成した search-index.json を fetch するだけ）
 * ・公開済み記事のみが対象（search-index.json は collections.columnArticles＝
 *   下書き・未来公開日を除外済みのコレクションから生成されるため、下書きは絶対に出てこない）
 * ・タイトル／抜粋／本文冒頭／カテゴリー名／タグを対象に、日本語もそのまま
 *   部分一致で検索する（形態素解析等は行わない、意図的にシンプルな実装）
 * ・このファイルは検索ページでのみ読み込まれるため、他の公開ページの表示速度には影響しない
 */
(function () {
  "use strict";

  var form = document.getElementById("column-search-form");
  var input = document.getElementById("column-search-input");
  var resultsEl = document.getElementById("column-search-results");
  var countEl = document.getElementById("column-search-count");
  var emptyEl = document.getElementById("column-search-empty");

  if (!form || !input || !resultsEl) return;

  var searchIndex = null;
  var indexPromise = fetch("/column/search-index.json")
    .then(function (res) {
      if (!res.ok) throw new Error("search index fetch failed");
      return res.json();
    })
    .then(function (data) {
      searchIndex = Array.isArray(data) ? data : [];
    })
    .catch(function () {
      searchIndex = [];
    });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function matches(item, query) {
    var q = query.toLowerCase();
    if (item.title && item.title.toLowerCase().indexOf(q) !== -1) return true;
    if (item.excerpt && item.excerpt.toLowerCase().indexOf(q) !== -1) return true;
    if (item.body && item.body.toLowerCase().indexOf(q) !== -1) return true;
    if (item.categoryName && item.categoryName.toLowerCase().indexOf(q) !== -1) return true;
    if (Array.isArray(item.tags)) {
      for (var i = 0; i < item.tags.length; i++) {
        if (String(item.tags[i]).toLowerCase().indexOf(q) !== -1) return true;
      }
    }
    return false;
  }

  function renderCard(item) {
    var cat = item.categoryName
      ? '<p class="article-card-cat"><a href="/column/category/' + encodeURIComponent(item.category) + '/">' + escapeHtml(item.categoryName) + "</a></p>"
      : "";
    var excerpt = item.excerpt ? '<p class="article-card-excerpt">' + escapeHtml(item.excerpt) + "</p>" : "";
    return (
      '<article class="card article-card"><div class="article-card-body">' +
      cat +
      '<h3 class="article-card-title"><a href="' + item.url + '">' + escapeHtml(item.title) + "</a></h3>" +
      excerpt +
      "</div></article>"
    );
  }

  function runSearch(query) {
    if (!searchIndex) return;
    query = (query || "").trim();

    if (!query) {
      resultsEl.innerHTML = "";
      countEl.textContent = "";
      if (emptyEl) emptyEl.hidden = true;
      return;
    }

    var matched = searchIndex.filter(function (item) {
      return matches(item, query);
    });

    countEl.textContent = matched.length + "件の記事が見つかりました";

    if (matched.length === 0) {
      resultsEl.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    resultsEl.innerHTML = matched.map(renderCard).join("");
  }

  function getQueryFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get("q") || "";
  }

  var initialQuery = getQueryFromUrl();
  if (initialQuery) input.value = initialQuery;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = input.value.trim();
    var url = new URL(window.location.href);
    if (q) {
      url.searchParams.set("q", q);
    } else {
      url.searchParams.delete("q");
    }
    window.history.replaceState({}, "", url);
    indexPromise.then(function () {
      runSearch(q);
    });
  });

  indexPromise.then(function () {
    if (initialQuery) runSearch(initialQuery);
  });
})();
