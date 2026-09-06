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

const { findNavigationLink, inferPageURL } = context.NextPageNavigation;

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

test("a generic Next button outside pagination is refused", () => {
  const button = fakeLink("Next", "", "BUTTON");
  assert.equal(findNavigationLink("next", rootWithCandidates([button])), null);
});
