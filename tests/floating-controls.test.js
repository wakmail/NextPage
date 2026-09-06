const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const manifest = JSON.parse(fs.readFileSync(
  new URL("../manifest.json", `file://${__filename}`),
  "utf8"
));
const popup = fs.readFileSync(new URL("../popup.html", `file://${__filename}`), "utf8");
const controls = fs.readFileSync(new URL("../controls.js", `file://${__filename}`), "utf8");

test("navigation loads before the page controls", () => {
  assert.deepEqual(manifest.content_scripts[0].js, [
    "navigation.js",
    "content.js",
    "controls.js"
  ]);
});

test("the popup offers visibility and position controls", () => {
  assert.match(popup, /id="floating-controls"/);
  assert.match(popup, /id="reset-floating-position"/);
  assert.match(popup, /id="controls-theme"/);
  assert.match(popup, /id="remember-setting"/);
  assert.match(popup, /id="duration-setting"/);
});

test("the page bar includes dragging and direct page entry", () => {
  assert.match(controls, /id="move"/);
  assert.match(controls, /id="page-grid"/);
  assert.match(controls, /id="page-input"/);
  assert.match(controls, /floatingPosition/);
  assert.match(controls, /addEventListener\("dblclick", resetPosition\)/);
  assert.match(controls, /Math\.min\(page, model\.lastPage\)/);
  assert.match(controls, /MAX_UNVERIFIED_PAGE = 1000000/);
  assert.match(controls, /updateVisibility\(Boolean\(previous \|\| next \|\| model\.availablePages\.length\)\)/);
  assert.match(controls, /remove\("floatingPosition"\)/);
  assert.match(controls, /MAX_GRID_PAGES = 10/);
  assert.match(controls, /grid-template-columns: repeat\(5, 1fr\)/);
  assert.match(controls, /host\.style\.colorScheme/);
});
