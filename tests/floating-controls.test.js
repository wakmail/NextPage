const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const manifest = JSON.parse(fs.readFileSync(
  new URL("../manifest.json", `file://${__filename}`),
  "utf8"
));
const popup = fs.readFileSync(new URL("../popup.html", `file://${__filename}`), "utf8");
const popupStyles = fs.readFileSync(new URL("../popup.css", `file://${__filename}`), "utf8");
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
  assert.match(popup, /id="hide-controls-on-scroll"/);
  assert.match(popup, /id="reset-floating-position"/);
  assert.match(popup, /id="controls-theme"/);
  assert.match(popup, /id="remember-setting"/);
  assert.match(popup, /id="duration-setting"/);
  assert.match(popup, /id="popup-theme"/);
  assert.match(popup, /id="arrival-description"/);
  assert.match(popupStyles, /html \{[\s\S]*height: 580px;[\s\S]*overflow: hidden;/);
  assert.match(popupStyles, /body \{[\s\S]*height: 580px;[\s\S]*overflow-y: auto;/);
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
  assert.match(controls, /light-dark\(rgba\(24,24,28,\.1\), rgba\(255,255,255,\.11\)\)/);
  assert.match(controls, /hideControlsOnScroll/);
  assert.match(controls, /nearPageTop\(position\)/);
  assert.match(controls, /atPageBottom\(position\)/);
  assert.match(controls, /BOTTOM_REVEAL_DELAY = 500/);
  assert.match(controls, /scheduleBottomReveal\(\)/);
  assert.match(controls, /Date\.now\(\) < navigationRevealUntil/);
  assert.match(controls, /navigationRevealUntil = Date\.now\(\) \+ NAVIGATION_REVEAL_TIME/);
  assert.match(controls, /wrap\.classList\.toggle\("auto-hidden"/);
});

test("saved position frames use a stable position snapshot", () => {
  assert.match(controls, /const position = storedPosition;/);
  assert.match(controls, /const frameId = \+\+positionFrameId;/);
  assert.match(controls, /if \(frameId !== positionFrameId\) return;/);
  assert.match(controls, /const left = position\.x/);
  assert.doesNotMatch(controls, /const left = storedPosition\.x/);
});
