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
});

test("the page bar includes dragging and direct page entry", () => {
  assert.match(controls, /id="move"/);
  assert.match(controls, /id="page-grid"/);
  assert.match(controls, /id="page-input"/);
  assert.match(controls, /floatingPosition/);
});
