const ACTIONS = new Set([
  "next-page",
  "previous-page",
  "scroll-top",
  "scroll-bottom"
]);

const NEXT_WORDS = ["next", "newer", "more", "continue", "forward", "›", "»", "→"];
const PREVIOUS_WORDS = ["previous", "prev", "older", "back", "‹", "«", "←"];

let saveTimer;
let scrollAnimationId = 0;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "action" || !ACTIONS.has(message.action)) return;

  runAction(message.action)
    .then(sendResponse)
    .catch(error => sendResponse({ ok: false, message: error.message }));
  return true;
});

window.addEventListener("scroll", schedulePositionSave, { passive: true });
window.addEventListener("pagehide", savePosition);
["wheel", "touchstart", "pointerdown", "keydown"].forEach(eventName => {
  window.addEventListener(eventName, cancelScrollAnimation, { passive: true, capture: true });
});

applyPendingArrivalBehavior();

async function runAction(action) {
  if (action === "scroll-top") {
    scrollToPosition(0, 0);
    return { ok: true, message: "Scrolled to the top" };
  }

  if (action === "scroll-bottom") {
    scrollToPosition(0, document.documentElement.scrollHeight);
    return { ok: true, message: "Scrolled to the bottom" };
  }

  const direction = action === "next-page" ? "next" : "previous";
  const link = findNavigationLink(direction);
  if (!link) {
    return {
      ok: false,
      message: direction === "next" ? "No next page link found" : "No previous page link found"
    };
  }

  await savePosition();
  await chrome.runtime.sendMessage({ type: "prepare-navigation" });
  activateNavigationTarget(link);
  setTimeout(applyPendingArrivalBehavior, 100);
  return {
    ok: true,
    message: direction === "next" ? "Opening the next page" : "Opening the previous page"
  };
}

function activateNavigationTarget(element) {
  if (element.tagName === "LINK") {
    location.assign(element.href);
    return;
  }

  element.click();
}

function findNavigationLink(direction) {
  const relation = direction === "next" ? "next" : "prev";
  const direct = document.querySelector(`a[rel~="${relation}"], link[rel~="${relation}"]`);
  if (direct?.href && isUsableLink(direct)) return direct;

  const words = direction === "next" ? NEXT_WORDS : PREVIOUS_WORDS;
  const candidates = [...document.querySelectorAll("a[href], button")]
    .filter(isUsableLink)
    .map(element => ({ element, score: scoreLink(element, direction, words) }))
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.element ?? null;
}

function scoreLink(element, direction, words) {
  const text = normalizedText(element.textContent);
  const label = normalizedText(element.getAttribute("aria-label"));
  const title = normalizedText(element.getAttribute("title"));
  const identity = normalizedText(`${element.id} ${element.className}`);
  const combined = `${text} ${label} ${title}`.trim();
  let score = 0;

  for (const word of words) {
    if (combined === word) score = Math.max(score, 100);
    else if (label === word || title === word) score = Math.max(score, 90);
    else if (combined.startsWith(`${word} `) || combined.endsWith(` ${word}`)) score = Math.max(score, 70);
    else if (combined.includes(word) && word.length > 3) score = Math.max(score, 45);
  }

  const identityWord = direction === "next" ? "next" : "prev";
  if (new RegExp(`(^|\\s|_)${identityWord}($|\\s|_)`).test(identity)) score += 50;
  if (element.closest("nav, [role='navigation'], .pagination, [class*='pagination']")) score += 20;
  if (element.tagName === "A") score += 5;

  const rect = element.getBoundingClientRect();
  if (direction === "next" && rect.left > window.innerWidth / 2) score += 5;
  if (direction === "previous" && rect.left < window.innerWidth / 2) score += 5;

  return score;
}

function normalizedText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

function schedulePositionSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePosition, 300);
}

async function savePosition() {
  try {
    await chrome.runtime.sendMessage({
      type: "save-position",
      url: location.href,
      x: window.scrollX,
      y: window.scrollY
    });
  } catch {
    // The extension may be reloading while the page remains open.
  }
}

async function applyPendingArrivalBehavior() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "consume-arrival" });
    if (!response?.behavior || response.behavior === "leave") return;

    if (response.behavior === "top") {
      whenPageLoaded(() => scrollToPosition(0, 0));
      return;
    }

    if (response.behavior === "bottom") {
      whenPageLoaded(() => scrollToPosition(0, () => pageScroller().scrollHeight));
      return;
    }

    if (response.behavior === "restore") {
      const saved = await chrome.runtime.sendMessage({
        type: "get-position",
        url: location.href
      });
      const position = saved?.position;
      whenPageLoaded(() => repeatScroll(position?.x ?? 0, position?.y ?? 0));
    }
  } catch {
    // Arrival behavior is optional when the extension is reloading.
  }
}

function repeatScroll(x, y) {
  [0, 120, 500].forEach(delay => {
    setTimeout(() => {
      const resolvedY = typeof y === "function" ? y() : y;
      const scroller = pageScroller();
      scroller.scrollLeft = x;
      scroller.scrollTop = resolvedY;
    }, delay);
  });
}

function scrollToPosition(x, y) {
  chrome.storage.local.get("settings").then(({ settings }) => {
    const scroller = pageScroller();
    const startX = scroller.scrollLeft;
    const startY = scroller.scrollTop;
    const targetX = Math.max(0, x);
    const duration = Number(settings?.scrollDuration) || 250;
    const animationId = ++scrollAnimationId;

    function resolveTargetY() {
      const requestedY = typeof y === "function" ? y() : y;
      const viewportHeight = scroller.clientHeight || window.innerHeight;
      const maxY = Math.max(0, scroller.scrollHeight - viewportHeight);
      return Math.max(0, Math.min(requestedY, maxY));
    }

    if (settings?.smoothScroll === false || duration <= 0) {
      scroller.scrollLeft = targetX;
      scroller.scrollTop = resolveTargetY();
      return;
    }

    let startedAt;
    function step(now) {
      if (animationId !== scrollAnimationId) return;
      if (startedAt === undefined) startedAt = now;

      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      const targetY = resolveTargetY();

      scroller.scrollLeft = startX + (targetX - startX) * eased;
      scroller.scrollTop = startY + (targetY - startY) * eased;

      if (progress < 1) requestAnimationFrame(step);
      else settleScrollTarget(scroller, targetX, resolveTargetY, animationId);
    }

    requestAnimationFrame(step);
  });
}

function settleScrollTarget(scroller, targetX, resolveTargetY, animationId) {
  [200, 700, 1500].forEach(delay => {
    setTimeout(() => {
      if (animationId !== scrollAnimationId) return;
      scroller.scrollLeft = targetX;
      scroller.scrollTop = resolveTargetY();
    }, delay);
  });
}

function cancelScrollAnimation() {
  scrollAnimationId += 1;
}

function whenPageLoaded(callback) {
  let fallbackTimer;
  let finished = false;

  function run() {
    if (finished) return;
    finished = true;
    clearTimeout(fallbackTimer);
    setTimeout(callback, 100);
  }

  if (document.readyState === "complete") {
    run();
    return;
  }

  window.addEventListener("load", run, { once: true });
  fallbackTimer = setTimeout(run, 5000);
}

function pageScroller() {
  const root = document.documentElement;
  const body = document.body;

  if (body && root && body.scrollHeight > body.clientHeight + 1 &&
      root.scrollHeight <= root.clientHeight + 1) {
    return body;
  }

  return document.scrollingElement || root || body;
}
