const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const navigationScript = fs.readFileSync(
  new URL("../navigation.js", `file://${__filename}`),
  "utf8"
);
const context = {
  URL,
  getComputedStyle: () => ({ display: "block", visibility: "visible" }),
  location: { href: "https://www.google.com/search?q=nextpage" }
};

vm.createContext(context);
vm.runInContext(navigationScript, context);

const { findNavigationLink, getPageModel, inferPageURL } = context.NextPageNavigation;

function fakeLink(text, href, tagName = "A") {
  return {
    className: "",
    href,
    id: "",
    tagName,
    textContent: text,
    closest: () => null,
    getAttribute(name) {
      return name === "href" ? href : null;
    },
    matches: () => false
  };
}

function rootWithCandidates(candidates) {
  return {
    querySelector: () => null,
    querySelectorAll(selector) {
      return selector.includes("rel~") ? [] : candidates;
    }
  };
}

test("direct page parameters can jump to any page", () => {
  const result = inferPageURL(8, "https://example.com/articles?page=3&sort=new");
  assert.equal(result, "https://example.com/articles?page=8&sort=new");
});

test("observed pagination links reveal an offset pattern", () => {
  const entries = [
    { page: 2, href: "https://example.com/search?offset=20" },
    { page: 3, href: "https://example.com/search?offset=40" }
  ];
  const result = inferPageURL(6, "https://example.com/search", entries, 1);
  assert.equal(result, "https://example.com/search?offset=100");
});

test("Google search pages use their result offset", () => {
  const result = inferPageURL(4, "https://www.google.com/search?q=glass+pill", [], 1);
  assert.equal(result, "https://www.google.com/search?q=glass+pill&start=30");
});

test("an unknown URL pattern is refused", () => {
  const result = inferPageURL(4, "https://example.com/articles", [], null);
  assert.equal(result, null);
});

test("an unrelated More link is refused on the last page", () => {
  const link = fakeLink("More", "https://www.google.com/preferences");
  assert.equal(findNavigationLink("next", rootWithCandidates([link])), null);
});

test("an exact same site Next link remains usable", () => {
  const link = fakeLink("Next", "https://www.google.com/search?q=nextpage&start=10");
  assert.equal(findNavigationLink("next", rootWithCandidates([link])), link);
});

test("exact next text works without a named pagination container", () => {
  const previousLocation = context.location.href;
  context.location.href = "https://example.com/articles?page=1";
  const link = fakeLink("Next", "https://example.com/articles?page=2");

  assert.equal(findNavigationLink("next", rootWithCandidates([link])), link);
  context.location.href = previousLocation;
});

test("a generic Next button outside pagination is refused", () => {
  const button = fakeLink("Next", "", "BUTTON");
  assert.equal(findNavigationLink("next", rootWithCandidates([button])), null);
});

test("nearby numbered links fill in a missing next control", () => {
  const previousLocation = context.location.href;
  context.location.href = "https://example.com/articles?page=24";
  const next = fakeLink("25", "https://example.com/articles?page=25");
  next.closest = selector => selector.startsWith("nav") ? {} : null;
  const root = {
    querySelector(selector) {
      return selector === "[aria-current='page']" ? { textContent: "24" } : null;
    },
    querySelectorAll(selector) {
      if (selector.includes('rel~="')) return [];
      if (selector.includes("rel~='last'")) return [];
      return [next];
    }
  };

  assert.equal(findNavigationLink("next", root), next);
  context.location.href = previousLocation;
});

test("a distant numbered link is not treated as the next page", () => {
  const previousLocation = context.location.href;
  context.location.href = "https://example.com/articles?page=1";
  const last = fakeLink("1000", "https://example.com/articles?page=1000");
  last.closest = selector => selector.startsWith("nav") ? {} : null;
  const root = {
    querySelector(selector) {
      return selector === "[aria-current='page']" ? { textContent: "1" } : null;
    },
    querySelectorAll(selector) {
      if (selector.includes('rel~="')) return [];
      if (selector.includes("rel~='last'")) return [last];
      return [last];
    }
  };

  assert.equal(findNavigationLink("next", root), null);
  context.location.href = previousLocation;
});

test("a pagination wrapper can identify an otherwise empty next link", () => {
  const previousLocation = context.location.href;
  context.location.href = "https://example.com/articles?page=1";
  const next = fakeLink("", "https://example.com/articles?page=2");
  next.closest = selector => selector.startsWith("nav") ? {} : null;
  next.parentElement = {
    className: "next",
    id: "",
    getAttribute: () => null
  };

  assert.equal(findNavigationLink("next", rootWithCandidates([next])), next);
  context.location.href = previousLocation;
});

test("a nested icon label can identify a next link", () => {
  const previousLocation = context.location.href;
  context.location.href = "https://example.com/articles?page=1";
  const next = fakeLink("", "https://example.com/articles?page=2");
  next.querySelectorAll = () => [{
    tagName: "SVG",
    textContent: "",
    getAttribute(name) {
      return name === "aria-label" ? "Next page" : null;
    }
  }];

  assert.equal(findNavigationLink("next", rootWithCandidates([next])), next);
  context.location.href = previousLocation;
});

test("the visible page range does not declare the last page", () => {
  const lastVisible = fakeLink("99", "https://www.google.com/search?q=nextpage&start=980");
  const root = {
    querySelector(selector) {
      return selector === "[aria-current='page']" ? { textContent: "1" } : null;
    },
    querySelectorAll(selector) {
      return selector.includes("last page") ? [] : [lastVisible];
    }
  };
  const model = getPageModel(root, "https://www.google.com/search?q=nextpage");
  assert.equal(model.highestKnownPage, 99);
  assert.equal(model.lastPage, null);
});

test("Google offset links are detected without visible text", () => {
  const next = fakeLink("", "https://www.google.com/search?q=nextpage&start=10");
  assert.equal(findNavigationLink("next", rootWithCandidates([next])), next);
});

test("Google related searches are not mistaken for pages", () => {
  const related = fakeLink("More results", "https://www.google.com/search?q=different&start=10");
  assert.equal(findNavigationLink("next", rootWithCandidates([related])), null);
});

test("Google offset links populate the page model", () => {
  const next = fakeLink("", "https://www.google.com/search?q=nextpage&start=10");
  const root = {
    querySelector: () => null,
    querySelectorAll(selector) {
      return selector === "a[href]" ? [next] : [];
    }
  };
  const model = getPageModel(root, "https://www.google.com/search?q=nextpage");
  assert.equal(model.currentPage, 1);
  assert.deepEqual([...model.availablePages], [2]);
  assert.equal(model.highestKnownPage, 2);
  assert.equal(model.lastPage, null);
});

test("Google More results buttons remain usable", () => {
  const button = fakeLink("More results", "", "BUTTON");
  assert.equal(findNavigationLink("next", rootWithCandidates([button])), button);
});

test("an explicit Last link declares the final page", () => {
  const last = fakeLink("Last", "https://example.com/articles?page=1000");
  const root = {
    querySelector: () => null,
    querySelectorAll(selector) {
      return selector.includes("rel~='last'") ? [last] : [];
    }
  };
  const model = getPageModel(root, "https://example.com/articles?page=1");
  assert.equal(model.highestKnownPage, 1000);
  assert.equal(model.lastPage, 1000);
});
