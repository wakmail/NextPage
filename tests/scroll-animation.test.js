const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const contentScript = fs.readFileSync(
  new URL("../content.js", `file://${__filename}`),
  "utf8"
);

function createHarness(scrollDuration) {
  let frameCallback;
  let currentTop = 500;
  const positions = [];
  const scroller = {
    clientHeight: 500,
    scrollHeight: 2000,
    scrollLeft: 0,
    get scrollTop() {
      return currentTop;
    },
    set scrollTop(value) {
      currentTop = value;
      positions.push(value);
    }
  };

  const context = {
    chrome: {
      runtime: {
        onMessage: { addListener() {} },
        sendMessage: async () => ({ behavior: null })
      },
      storage: {
        local: {
          get: async () => ({
            settings: { smoothScroll: true, scrollDuration }
          })
        }
      }
    },
    document: {
      body: scroller,
      documentElement: scroller,
      readyState: "complete",
      scrollingElement: scroller
    },
    location: { href: "https://example.com/page" },
    window: {
      addEventListener() {},
      innerHeight: 500,
      scrollX: 0,
      scrollY: 500
    },
    clearTimeout() {},
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    requestAnimationFrame(callback) {
      frameCallback = callback;
    },
    setTimeout() {
      return 1;
    }
  };

  vm.createContext(context);
  vm.runInContext(contentScript, context);

  return {
    context,
    getFrameCallback: () => frameCallback,
    positions,
    scroller
  };
}

test("smooth scrolling follows a growing page bottom", async () => {
  const { context, getFrameCallback, positions, scroller } = createHarness(1000);
  context.scrollToPosition(0, () => scroller.scrollHeight);
  await Promise.resolve();
  await Promise.resolve();

  const frameCallback = getFrameCallback();
  frameCallback(0);
  frameCallback(250);
  scroller.scrollHeight = 2500;
  frameCallback(500);
  frameCallback(750);
  frameCallback(1000);

  assert.equal(positions.at(-1), 2000);
  assert.ok(positions[1] < positions[2]);
  assert.ok(positions[2] < positions[3]);
  assert.ok(positions[3] < positions[4]);
});

test("zero duration scrolls instantly", async () => {
  const { context, getFrameCallback, positions, scroller } = createHarness(0);
  context.scrollToPosition(0, () => scroller.scrollHeight);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(positions.at(-1), 1500);
  assert.equal(getFrameCallback(), undefined);
});
