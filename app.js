"use strict";

const PAGE_SIZE = 12;
const SOURCE_NAMES = {
  archive: "互联网档案馆",
  loc: "美国国会图书馆",
};
const SOURCE_KEYS = ["archive", "loc"];

const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const filters = Array.from(document.querySelectorAll(".filter"));
const suggestions = Array.from(document.querySelectorAll("[data-query]"));
const results = document.querySelector("#results");
const resultSummary = document.querySelector("#result-summary");
const notice = document.querySelector("#notice");
const emptyState = document.querySelector("#empty-state");
const loadMoreButton = document.querySelector("#load-more");

const state = {
  query: "",
  source: "all",
  pages: { archive: 0, loc: 0 },
  hasMore: { archive: true, loc: true },
  loading: false,
  requestId: 0,
  errors: [],
};
const activeControllers = new Set();

function selectedSources() {
  return state.source === "all" ? SOURCE_KEYS : [state.source];
}

function plainText(value) {
  const input = Array.isArray(value) ? value.join(" ") : value;
  return String(input || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function shorten(value, maxLength) {
  const text = plainText(value);
  return text.length > maxLength ? text.slice(0, maxLength - 1).trimEnd() + "…" : text;
}

function yearOf(value) {
  const match = String(value || "").match(/\b(?:18|19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function safeLocLink(value) {
  try {
    const parsed = new URL(value);
    if (!["www.loc.gov", "loc.gov"].includes(parsed.hostname)) return "";
    if (!parsed.pathname.startsWith("/item/")) return "";
    return "https://www.loc.gov" + parsed.pathname;
  } catch {
    return "";
  }
}

function escapeArchivePhrase(value) {
  return value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&");
}

async function fetchJson(url) {
  const controller = new AbortController();
  activeControllers.add(controller);
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return await response.json();
  } finally {
    clearTimeout(timeout);
    activeControllers.delete(controller);
  }
}

async function searchArchive(query, page) {
  const params = new URLSearchParams();
  let archiveQuery = "collection:feature_films AND mediatype:movies";
  if (query) archiveQuery += ' AND "' + escapeArchivePhrase(query) + '"';
  params.set("q", archiveQuery);
  ["identifier", "title", "year", "date", "creator", "description", "downloads"].forEach(
    (field) => params.append("fl[]", field)
  );
  params.set("rows", String(PAGE_SIZE));
  params.set("page", String(page));
  params.set("output", "json");
  if (!query) params.append("sort[]", "downloads desc");

  const data = await fetchJson("https://archive.org/advancedsearch.php?" + params.toString());
  const response = data.response || {};
  const documents = Array.isArray(response.docs) ? response.docs : [];
  const movies = documents.map((item) => {
    const identifier = String(item.identifier || "");
    if (!/^[A-Za-z0-9._-]+$/.test(identifier)) return null;
    const title = shorten(item.title || identifier, 150);
    return {
      source: "archive",
      title,
      year: yearOf(item.year || item.date),
      detail: shorten(item.creator, 70),
      description: shorten(item.description, 165),
      image: "https://archive.org/services/img/" + encodeURIComponent(identifier),
      url: "https://archive.org/details/" + encodeURIComponent(identifier),
    };
  }).filter(Boolean);

  return {
    movies,
    hasMore: page * PAGE_SIZE < Number(response.numFound || 0),
  };
}

async function searchLoc(query, page) {
  const params = new URLSearchParams({
    fo: "json",
    at: "results,pagination",
    c: String(PAGE_SIZE),
    sp: String(page),
    fa: "online-format:video",
  });
  if (query) params.set("q", query);

  const data = await fetchJson(
    "https://www.loc.gov/collections/national-screening-room/?" + params.toString()
  );
  const documents = Array.isArray(data.results) ? data.results : [];
  const movies = documents.map((item) => {
    const url = safeLocLink(item.id);
    if (!url || item.access_restricted === true) return null;
    if (!Array.isArray(item.online_format) || !item.online_format.includes("video")) return null;
    const images = Array.isArray(item.image_url) ? item.image_url : [];
    const image = images.find((candidate) => {
      try {
        const host = new URL(candidate).hostname;
        return host === "www.loc.gov" || host === "tile.loc.gov" || host === "loc.gov";
      } catch {
        return false;
      }
    }) || "";
    return {
      source: "loc",
      title: shorten(item.title || "未命名影像", 150),
      year: yearOf(item.date),
      detail: "National Screening Room",
      description: shorten(item.description, 165),
      image: image.replace(/^http:/, "https:"),
      url,
    };
  }).filter(Boolean);

  return {
    movies,
    hasMore: Boolean(data.pagination && data.pagination.next),
  };
}

function addTextElement(parent, tag, className, textValue) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = textValue;
  parent.append(element);
  return element;
}

function renderMovie(movie) {
  const card = document.createElement("article");
  card.className = "movie-card";

  const imageWrap = document.createElement("div");
  imageWrap.className = "card-image";
  addTextElement(imageWrap, "span", "image-placeholder", "✦");
  if (movie.image) {
    const image = document.createElement("img");
    image.src = movie.image;
    image.alt = movie.title + "的馆藏缩略图";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => imageWrap.classList.add("is-image-missing"));
    imageWrap.append(image);
  } else {
    imageWrap.classList.add("is-image-missing");
  }
  card.append(imageWrap);

  const content = document.createElement("div");
  content.className = "card-content";
  addTextElement(content, "span", "card-source", SOURCE_NAMES[movie.source]);
  addTextElement(content, "h3", "card-title", movie.title);
  const details = [movie.year, movie.detail].filter(Boolean).join(" · ");
  addTextElement(content, "p", "card-detail", details || "公开馆藏影像");
  addTextElement(
    content,
    "p",
    "card-description",
    movie.description || "前往来源页面查看影片介绍、播放方式和使用说明。"
  );
  const link = addTextElement(content, "a", "card-link", "前往原站 ↗");
  link.href = movie.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", "前往原站查看《" + movie.title + "》");
  card.append(content);
  return card;
}

function appendInterleaved(groupedMovies) {
  const fragment = document.createDocumentFragment();
  const longest = Math.max(0, ...groupedMovies.map((items) => items.length));
  for (let index = 0; index < longest; index += 1) {
    groupedMovies.forEach((items) => {
      if (items[index]) fragment.append(renderMovie(items[index]));
    });
  }
  results.append(fragment);
}

function updateFilters() {
  filters.forEach((filter) => {
    const active = filter.dataset.source === state.source;
    filter.classList.toggle("is-active", active);
    filter.setAttribute("aria-pressed", String(active));
  });
}

function updateUrl() {
  const url = new URL(window.location.href);
  if (state.query) url.searchParams.set("q", state.query);
  else url.searchParams.delete("q");
  if (state.source !== "all") url.searchParams.set("source", state.source);
  else url.searchParams.delete("source");
  window.history.replaceState(null, "", url);
}

function updateStatus() {
  const count = results.childElementCount;
  if (state.loading) {
    resultSummary.textContent = count
      ? "已显示 " + count + " 部影片，正在继续查找…"
      : "正在查找公开影片…";
  } else if (count) {
    resultSummary.textContent = (state.query ? "搜索“" + state.query + "” · " : "")
      + "已显示 " + count + " 部影片";
  } else if (state.errors.length) {
    resultSummary.textContent = "暂时无法连接影片来源";
  } else {
    resultSummary.textContent = "没有找到匹配的影片";
  }

  notice.hidden = state.errors.length === 0;
  if (state.errors.length) {
    const names = state.errors.map((key) => SOURCE_NAMES[key]).join("、");
    notice.textContent = names + "暂时无法连接，请稍后点击“重试加载”。";
  }
  emptyState.hidden = state.loading || count > 0 || state.errors.length > 0;
  const canLoad = selectedSources().some((key) => state.hasMore[key]);
  loadMoreButton.hidden = state.loading || !canLoad;
  loadMoreButton.disabled = state.loading;
  loadMoreButton.textContent = state.errors.length ? "重试加载 ↻" : "加载更多影片 ↓";
}

async function loadPage(requestId) {
  if (state.loading) return;
  const sources = selectedSources().filter((key) => state.hasMore[key]);
  if (!sources.length) {
    updateStatus();
    return;
  }

  state.loading = true;
  state.errors = [];
  updateStatus();
  const attempts = sources.map((key) => {
    const nextPage = state.pages[key] + 1;
    return key === "archive"
      ? searchArchive(state.query, nextPage)
      : searchLoc(state.query, nextPage);
  });
  const outcomes = await Promise.allSettled(attempts);
  if (requestId !== state.requestId) return;

  const groupedMovies = [];
  outcomes.forEach((outcome, index) => {
    const source = sources[index];
    if (outcome.status === "fulfilled") {
      state.pages[source] += 1;
      state.hasMore[source] = outcome.value.hasMore;
      groupedMovies.push(outcome.value.movies);
    } else {
      state.errors.push(source);
    }
  });
  appendInterleaved(groupedMovies);
  state.loading = false;
  updateStatus();
}

function runSearch() {
  activeControllers.forEach((controller) => controller.abort());
  state.requestId += 1;
  state.query = searchInput.value.trim().slice(0, 80);
  state.pages = { archive: 0, loc: 0 };
  state.hasMore = { archive: true, loc: true };
  state.errors = [];
  state.loading = false;
  results.replaceChildren();
  searchInput.value = state.query;
  updateUrl();
  updateFilters();
  void loadPage(state.requestId);
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch();
});

filters.forEach((filter) => {
  filter.addEventListener("click", () => {
    if (state.source === filter.dataset.source) return;
    state.source = filter.dataset.source;
    runSearch();
  });
});

suggestions.forEach((suggestion) => {
  suggestion.addEventListener("click", () => {
    searchInput.value = suggestion.dataset.query || "";
    runSearch();
  });
});

loadMoreButton.addEventListener("click", () => void loadPage(state.requestId));

const initialParams = new URLSearchParams(window.location.search);
const initialSource = initialParams.get("source");
if (initialSource === "archive" || initialSource === "loc") state.source = initialSource;
searchInput.value = (initialParams.get("q") || "").slice(0, 80);
runSearch();
