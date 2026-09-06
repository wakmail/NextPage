(() => {
  const WORDS = {
    next: ["next", "newer", "forward", "›", "»", "→"],
    previous: ["previous", "prev", "older", "back", "‹", "«", "←"]
  };
  const PAGINATION_SELECTORS = [
    "nav",
    "[role='navigation']",
    "[aria-label*='pagination' i]",
    ".pagination",
    "[class*='pagination']",
    "[class*='pager']"
  ];
  const PAGE_CONTAINER_SELECTORS = [
    "nav[aria-label*='page' i]",
    "[role='navigation'][aria-label*='page' i]",
    "[aria-label*='pagination' i]",
    ".pagination",
    "[class*='pagination']",
    "[class*='pager']"
  ];
  const PAGINATION_SELECTOR = PAGINATION_SELECTORS.join(", ");
  const PAGINATION_LINK_SELECTOR = PAGE_CONTAINER_SELECTORS
    .map(selector => `${selector} a[href]`)
    .join(", ");
  const LAST_PAGE_SELECTOR = ["a[rel~='last']", "link[rel~='last']", ...PAGE_CONTAINER_SELECTORS
    .flatMap(selector => [
      `${selector} a[aria-label*='last page' i]`,
      `${selector} a[title*='last page' i]`
    ])]
    .join(", ");
  const EXCLUDED_SELECTOR = "header, [role='banner'], [role='menu'], [role='menubar'], [class*='carousel'], [class*='slider']";
  const MINIMUM_SCORE = 100;

  function findNavigationLink(direction, root = document) {
    const relation = direction === "next" ? "next" : "prev";
    const direct = [...root.querySelectorAll(`a[rel~="${relation}"], link[rel~="${relation}"]`)]
      .find(element => element.href && isUsableLink(element) &&
        isSameSiteURL(element.href) && !sameDocumentURL(element.href));
    if (direct) return direct;

    const candidates = [...root.querySelectorAll("a[href], button")]
      .filter(isUsableLink)
      .map(element => ({ element, score: scoreLink(element, direction) }))
      .filter(candidate => candidate.score >= MINIMUM_SCORE)
      .sort((left, right) => right.score - left.score);

    return candidates[0]?.element ?? null;
  }

  function scoreLink(element, direction) {
    if (element.tagName === "A" && (!isSameSiteURL(element.href) || sameDocumentURL(element.href))) {
      return 0;
    }

    const text = normalizedText(element.textContent);
    const label = normalizedText(element.getAttribute("aria-label"));
    const title = normalizedText(element.getAttribute("title"));
    const identity = normalizedText(`${element.id} ${element.className}`);
    const combined = `${text} ${label} ${title}`.trim();
    const pagePhrase = direction === "next" ? /\bnext\s+page\b/ : /\b(previous|prev)\s+page\b/;
    const inPagination = Boolean(element.closest(PAGINATION_SELECTOR));
    let score = 0;

    if (pagePhrase.test(combined)) score = 125;
    for (const word of WORDS[direction]) {
      if (combined === word) score = Math.max(score, 100);
      else if (label === word || title === word) score = Math.max(score, 110);
      else if (combined.startsWith(`${word} `) || combined.endsWith(` ${word}`)) {
        score = Math.max(score, word.length > 3 ? 82 : 0);
      }
    }

    const identityWord = direction === "next" ? "next" : "prev";
    if (new RegExp(`(^|[\\s_-])${identityWord}($|[\\s_-])`).test(identity)) score += 55;
    if (inPagination) score += 25;
    if (element.tagName === "A") score += 5;
    if (element.closest(EXCLUDED_SELECTOR)) score -= 80;
    if (element.tagName === "BUTTON" && !inPagination && !pagePhrase.test(combined)) return 0;

    return score;
  }

  function getPageModel(root = document, currentHref = location.href) {
    const pageLinks = new Map();
    const elements = root.querySelectorAll(`${PAGINATION_LINK_SELECTOR}, a[aria-current='page'][href]`);

    for (const element of elements) {
      const page = pageNumberFromText(element.textContent || element.getAttribute("aria-label"));
      if (page && isSameSiteURL(element.href, currentHref)) pageLinks.set(page, element);
    }

    for (const element of root.querySelectorAll(LAST_PAGE_SELECTOR)) {
      if (!isSameSiteURL(element.href, currentHref)) continue;
      const page = pageNumberFromText(element.textContent) || currentPageFromURL(element.href, true);
      if (page) pageLinks.set(page, element);
    }

    let currentPage = currentPageFromDocument(root);
    if (!currentPage) currentPage = currentPageFromURL(currentHref, pageLinks.size > 0);
    if (!currentPage) {
      for (const [page, element] of pageLinks) {
        if (sameDocumentURL(element.href, currentHref)) {
          currentPage = page;
          break;
        }
      }
    }

    const availablePages = [...pageLinks.keys()].sort((left, right) => left - right);
    const maximumPage = Math.max(currentPage ?? 0, ...availablePages) || null;
    const entries = [...pageLinks].map(([page, element]) => ({ page, href: element.href }));
    return {
      currentPage,
      availablePages,
      maximumPage,
      elementForPage: page => pageLinks.get(page) ?? null,
      urlForPage: page => inferPageURL(page, currentHref, entries, currentPage)
    };
  }

  function currentPageFromDocument(root) {
    const selectors = ["[aria-current='page']"];
    for (const container of PAGE_CONTAINER_SELECTORS) {
      selectors.push(
        `${container} .current`,
        `${container} .active`,
        `${container} [class*='current']`
      );
    }

    for (const selector of selectors) {
      const page = pageNumberFromText(root.querySelector(selector)?.textContent);
      if (page) return page;
    }
    return null;
  }

  function currentPageFromURL(href, hasPaginationEvidence = false) {
    try {
      const url = new URL(href);
      const keys = ["page", "paged", "page_num", "pageNumber"];
      if (hasPaginationEvidence) keys.push("p", "pg");
      for (const key of keys) {
        const value = positiveInteger(url.searchParams.get(key));
        if (value) return value;
      }
      const pathMatch = url.pathname.match(/\/page\/(\d+)(?:\/|$)/i);
      if (pathMatch) return positiveInteger(pathMatch[1]);
      if (isGoogleSearch(url)) {
        const start = Number(url.searchParams.get("start") || 0);
        if (Number.isInteger(start) && start >= 0) return Math.floor(start / 10) + 1;
      }
    } catch {
      return null;
    }
    return null;
  }

  function inferPageURL(page, currentHref, entries = [], currentPage = null) {
    const targetPage = positiveInteger(page);
    if (!targetPage) return null;

    const exact = entries.find(entry => entry.page === targetPage);
    if (exact?.href) return exact.href;

    let currentURL;
    try {
      currentURL = new URL(currentHref);
    } catch {
      return null;
    }

    for (const key of ["page", "paged", "page_num", "pageNumber"]) {
      if (!currentURL.searchParams.has(key)) continue;
      currentURL.searchParams.set(key, String(targetPage));
      return currentURL.href;
    }

    for (const key of ["p", "pg"]) {
      const observed = entries.some(entry => {
        try {
          return new URL(entry.href).searchParams.has(key);
        } catch {
          return false;
        }
      });
      if (observed && currentURL.searchParams.has(key)) {
        currentURL.searchParams.set(key, String(targetPage));
        return currentURL.href;
      }
    }

    const pathMatch = currentURL.pathname.match(/\/page\/(\d+)(?=\/|$)/i);
    if (pathMatch) {
      currentURL.pathname = currentURL.pathname.replace(pathMatch[0], pathMatch[0].replace(pathMatch[1], String(targetPage)));
      return currentURL.href;
    }

    const inferred = inferNumericParameter(entries);
    if (inferred) {
      currentURL.searchParams.set(inferred.key, String(inferred.slope * targetPage + inferred.intercept));
      return currentURL.href;
    }

    if (isGoogleSearch(currentURL)) {
      currentURL.searchParams.set("start", String((targetPage - 1) * 10));
      return currentURL.href;
    }

    if (currentPage && entries.length === 1) {
      const observed = new URL(entries[0].href);
      for (const [key, value] of observed.searchParams) {
        const numericValue = Number(value);
        const currentValue = Number(currentURL.searchParams.get(key));
        if (!Number.isFinite(numericValue) || !Number.isFinite(currentValue)) continue;
        const difference = numericValue - currentValue;
        const pageDifference = entries[0].page - currentPage;
        if (pageDifference && difference % pageDifference === 0) {
          currentURL.searchParams.set(key, String(currentValue + (targetPage - currentPage) * (difference / pageDifference)));
          return currentURL.href;
        }
      }
    }

    return null;
  }

  function inferNumericParameter(entries) {
    if (entries.length < 2) return null;
    const firstURL = new URL(entries[0].href);
    const secondURL = new URL(entries[1].href);

    for (const [key, firstValue] of firstURL.searchParams) {
      if (!secondURL.searchParams.has(key)) continue;
      const firstNumber = Number(firstValue);
      const secondNumber = Number(secondURL.searchParams.get(key));
      const pageDifference = entries[1].page - entries[0].page;
      if (!Number.isFinite(firstNumber) || !Number.isFinite(secondNumber) || !pageDifference) continue;
      const slope = (secondNumber - firstNumber) / pageDifference;
      const intercept = firstNumber - slope * entries[0].page;
      if (Number.isInteger(slope) && Number.isInteger(intercept) && slope > 0) {
        return { key, slope, intercept };
      }
    }
    return null;
  }

  function pageNumberFromText(value) {
    const match = String(value ?? "").trim().match(/^(?:page\s+)?(\d{1,6})$/i);
    return match ? positiveInteger(match[1]) : null;
  }

  function positiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function normalizedText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function isGoogleSearch(url) {
    return /(^|\.)google\.[a-z.]+$/i.test(url.hostname) && url.pathname === "/search";
  }

  function isSameSiteURL(href, currentHref = location.href) {
    try {
      return new URL(href, currentHref).hostname === new URL(currentHref).hostname;
    } catch {
      return false;
    }
  }

  function sameDocumentURL(left, right = location.href) {
    try {
      const leftURL = new URL(left, right);
      const rightURL = new URL(right);
      leftURL.hash = "";
      rightURL.hash = "";
      return leftURL.href === rightURL.href;
    } catch {
      return false;
    }
  }

  function isUsableLink(element) {
    if (!element) return false;
    if (element.tagName === "LINK") return Boolean(element.href);
    if (element.matches("[disabled], [aria-disabled='true'], .disabled")) return false;
    if (element.closest("[hidden], [aria-hidden='true']")) return false;

    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;

    if (element.tagName === "A") {
      const href = element.getAttribute("href");
      if (!href || href === "#" || href.startsWith("javascript:")) return false;
    }
    return true;
  }

  globalThis.NextPageNavigation = {
    findNavigationLink,
    getPageModel,
    inferPageURL
  };
})();
