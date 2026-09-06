(() => {
  const DEFAULT_POSITION = null;
  const MAX_GRID_PAGES = 10;
  const MAX_UNVERIFIED_PAGE = 1000000;
  const TOP_REVEAL_DISTANCE = 72;
  const BOTTOM_REVEAL_DISTANCE = 2;
  const BOTTOM_REVEAL_DELAY = 500;
  const NAVIGATION_REVEAL_TIME = 1800;
  const SCROLL_DIRECTION_THRESHOLD = 2;
  const host = document.createElement("div");
  host.id = "nextpage-floating-controls";
  host.hidden = true;
  host.style.cssText = "all:initial;position:fixed;left:50%;bottom:24px;z-index:2147483646;transform:translateX(-50%);display:none;";

  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host { color-scheme: light dark; }
      * { box-sizing: border-box; }
      .wrap {
        position: relative;
        color: light-dark(#171719, #f7f7fa);
        font: 600 13px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
        transition: opacity 150ms ease, transform 150ms ease;
        user-select: none;
      }
      .wrap.auto-hidden { opacity: 0; pointer-events: none; transform: translateY(9px); }
      .pill {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 5px;
        border: 1px solid light-dark(rgba(24,24,28,.1), rgba(255,255,255,.11));
        border-radius: 999px;
        background: light-dark(rgba(240,240,244,.38), rgba(30,30,34,.4));
        box-shadow: 0 12px 34px rgba(0,0,0,.16);
        backdrop-filter: blur(18px) saturate(165%);
        -webkit-backdrop-filter: blur(18px) saturate(165%);
      }
      button, input { font: inherit; }
      button {
        display: grid;
        min-width: 36px;
        height: 36px;
        place-items: center;
        border: 0;
        border-radius: 999px;
        color: inherit;
        background: transparent;
        cursor: pointer;
      }
      button:hover:not(:disabled), button[aria-expanded="true"] {
        background: light-dark(rgba(255,255,255,.72), rgba(255,255,255,.13));
      }
      button:focus-visible, input:focus-visible {
        outline: 2px solid light-dark(#3c6df0, #8ca7ff);
        outline-offset: 1px;
      }
      button:disabled { cursor: default; opacity: .3; }
      .page { min-width: 74px; padding: 0 13px; font-variant-numeric: tabular-nums; }
      .move { width: 25px; min-width: 25px; cursor: grab; opacity: .58; touch-action: none; }
      .move:active { cursor: grabbing; }
      .popover {
        position: absolute;
        left: 50%;
        bottom: calc(100% + 10px);
        width: 246px;
        padding: 12px;
        border: 1px solid light-dark(rgba(24,24,28,.09), rgba(255,255,255,.12));
        border-radius: 8px;
        background: light-dark(rgba(242,242,246,.58), rgba(29,29,33,.55));
        box-shadow: 0 16px 42px rgba(0,0,0,.2);
        backdrop-filter: blur(22px) saturate(165%);
        -webkit-backdrop-filter: blur(22px) saturate(165%);
        transform: translateX(-50%);
      }
      .wrap.below .popover { top: calc(100% + 10px); bottom: auto; }
      .popover[hidden] { display: none; }
      .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
      .grid button { min-width: 0; height: 34px; border-radius: 4px; background: light-dark(rgba(255,255,255,.48), rgba(255,255,255,.07)); }
      .grid button.current { color: white; background: #4169e1; }
      form { display: grid; grid-template-columns: 1fr auto; gap: 7px; margin-top: 9px; }
      input {
        min-width: 0;
        height: 36px;
        padding: 0 11px;
        border: 1px solid light-dark(rgba(0,0,0,.14), rgba(255,255,255,.15));
        border-radius: 4px;
        color: inherit;
        background: light-dark(rgba(255,255,255,.65), rgba(255,255,255,.07));
      }
      form button { min-width: 48px; height: 36px; padding: 0 13px; border-radius: 4px; color: white; background: #4169e1; }
      .message { min-height: 14px; margin: 8px 4px 0; color: light-dark(#626268, #b7b7be); font-size: 11px; font-weight: 500; }
      @media (prefers-reduced-motion: reduce) { .wrap { transition: none; } }
    </style>
    <div class="wrap">
      <div class="popover" id="page-popover" hidden>
        <div class="grid" id="page-grid" aria-label="Nearby pages"></div>
        <form id="page-form">
          <input id="page-input" type="number" min="1" step="1" inputmode="numeric" aria-label="Page number" placeholder="Type a page">
          <button type="submit">Go</button>
        </form>
        <div class="message" id="page-message" role="status" aria-live="polite"></div>
      </div>
      <div class="pill" role="toolbar" aria-label="Page navigation">
        <button id="previous" type="button" aria-label="Previous page" title="Previous page">‹</button>
        <button class="page" id="page" type="button" aria-expanded="false" aria-controls="page-popover">Page ?</button>
        <button id="next" type="button" aria-label="Next page" title="Next page">›</button>
        <button class="move" id="move" type="button" aria-label="Move controls" title="Move controls. Double click to reset">⠿</button>
      </div>
    </div>
  `;

  const wrap = shadow.querySelector(".wrap");
  const previousButton = shadow.querySelector("#previous");
  const nextButton = shadow.querySelector("#next");
  const pageButton = shadow.querySelector("#page");
  const popover = shadow.querySelector("#page-popover");
  const pageGrid = shadow.querySelector("#page-grid");
  const pageForm = shadow.querySelector("#page-form");
  const pageInput = shadow.querySelector("#page-input");
  const pageMessage = shadow.querySelector("#page-message");
  const moveButton = shadow.querySelector("#move");

  let model;
  let storedPosition = DEFAULT_POSITION;
  let refreshTimer;
  let bottomRevealTimer;
  let positionFrameId = 0;
  let controlsEnabled = false;
  let hideControlsOnScroll = false;
  let revealControlsAtBottom = true;
  let dragging = false;
  let lastScrollPosition = currentScrollPosition();
  let navigationRevealUntil = Date.now() + NAVIGATION_REVEAL_TIME;

  initialize().catch(() => host.remove());

  async function initialize() {
    document.documentElement.append(host);
    const stored = await chrome.storage.local.get(["settings", "floatingPosition"]);
    storedPosition = stored.floatingPosition ?? DEFAULT_POSITION;
    applyTheme(stored.settings?.controlsTheme);
    setAutoHide(Boolean(stored.settings?.hideControlsOnScroll));
    setBottomReveal(stored.settings?.revealControlsAtBottom !== false);
    setEnabled(Boolean(stored.settings?.floatingControls));
    refresh();

    previousButton.addEventListener("click", () => runDirection("previous-page"));
    nextButton.addEventListener("click", () => runDirection("next-page"));
    pageButton.addEventListener("click", togglePopover);
    pageForm.addEventListener("submit", submitPage);
    moveButton.addEventListener("pointerdown", startDrag);
    moveButton.addEventListener("dblclick", resetPosition);
    document.addEventListener("pointerdown", closeFromPageClick, true);
    window.addEventListener("resize", applyStoredPosition, { passive: true });
    window.addEventListener("scroll", handlePageScroll, { passive: true });

    chrome.storage.onChanged.addListener(changes => {
      if (changes.settings) {
        setEnabled(Boolean(changes.settings.newValue?.floatingControls));
        setAutoHide(Boolean(changes.settings.newValue?.hideControlsOnScroll));
        setBottomReveal(changes.settings.newValue?.revealControlsAtBottom !== false);
        applyTheme(changes.settings.newValue?.controlsTheme);
      }
      if (changes.floatingPosition) {
        storedPosition = changes.floatingPosition.newValue ?? DEFAULT_POSITION;
        if (!host.hidden) applyStoredPosition();
      }
    });

    new MutationObserver(scheduleRefresh).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function setEnabled(enabled) {
    controlsEnabled = enabled;
    if (!enabled) {
      cancelBottomReveal();
      setAutoHidden(false);
      updateVisibility(false);
    }
    else scheduleRefresh();
  }

  function setAutoHide(enabled) {
    hideControlsOnScroll = enabled;
    lastScrollPosition = currentScrollPosition();
    cancelBottomReveal();
    setAutoHidden(false);
  }

  function setBottomReveal(enabled) {
    revealControlsAtBottom = enabled;
    if (!enabled) cancelBottomReveal();
  }

  function handlePageScroll() {
    const position = currentScrollPosition();
    const movement = position - lastScrollPosition;
    lastScrollPosition = position;

    if (!hideControlsOnScroll || !controlsEnabled || host.hidden) {
      cancelBottomReveal();
      return;
    }
    if (!popover.hidden || dragging || nearPageTop(position) || Date.now() < navigationRevealUntil) {
      cancelBottomReveal();
      setAutoHidden(false);
      return;
    }
    if (revealControlsAtBottom && atPageBottom(position)) {
      scheduleBottomReveal();
      return;
    }

    cancelBottomReveal();

    if (movement > SCROLL_DIRECTION_THRESHOLD) setAutoHidden(true);
    else if (movement < -SCROLL_DIRECTION_THRESHOLD) setAutoHidden(false);
  }

  function currentScrollPosition() {
    return document.scrollingElement?.scrollTop ?? window.scrollY ?? 0;
  }

  function nearPageTop(position) {
    return position <= TOP_REVEAL_DISTANCE;
  }

  function atPageBottom(position) {
    const scroller = document.scrollingElement || document.documentElement;
    const maximum = Math.max(0, scroller.scrollHeight - (scroller.clientHeight || window.innerHeight));
    return maximum - position <= BOTTOM_REVEAL_DISTANCE;
  }

  function scheduleBottomReveal() {
    clearTimeout(bottomRevealTimer);
    bottomRevealTimer = setTimeout(() => {
      bottomRevealTimer = undefined;
      const position = currentScrollPosition();
      if (hideControlsOnScroll && controlsEnabled && !host.hidden &&
          popover.hidden && !dragging && atPageBottom(position)) {
        setAutoHidden(false);
      }
    }, BOTTOM_REVEAL_DELAY);
  }

  function cancelBottomReveal() {
    clearTimeout(bottomRevealTimer);
    bottomRevealTimer = undefined;
  }

  function setAutoHidden(hidden) {
    wrap.classList.toggle("auto-hidden", Boolean(hidden));
  }

  function revealAfterNavigation() {
    cancelBottomReveal();
    navigationRevealUntil = Date.now() + NAVIGATION_REVEAL_TIME;
    setAutoHidden(false);
  }

  function applyTheme(theme) {
    const selected = ["light", "dark"].includes(theme) ? theme : "auto";
    host.style.colorScheme = selected === "auto" ? "light dark" : selected;
  }

  function updateVisibility(hasPages) {
    const visible = controlsEnabled && hasPages;
    const becomingVisible = visible && host.hidden;
    host.hidden = !visible;
    host.style.display = visible ? "block" : "none";
    if (becomingVisible) applyStoredPosition();
  }

  function refresh() {
    model = NextPageNavigation.getPageModel();
    const previous = NextPageNavigation.findNavigationLink("previous");
    const next = NextPageNavigation.findNavigationLink("next");
    updateVisibility(Boolean(previous || next || model.availablePages.length));
    previousButton.disabled = !previous;
    nextButton.disabled = !next;
    pageButton.textContent = model.currentPage ? `Page ${model.currentPage}` : "Page ?";
    pageInput.value = model.currentPage ?? "";
    renderGrid();
  }

  function scheduleRefresh() {
    if (!controlsEnabled) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 350);
  }

  async function runDirection(action) {
    revealAfterNavigation();
    closePopover();
    const result = await NextPageContent.runAction(action);
    if (!result.ok) showMessage(result.message);
  }

  function togglePopover() {
    if (popover.hidden) {
      setAutoHidden(false);
      refresh();
      popover.hidden = false;
      pageButton.setAttribute("aria-expanded", "true");
      wrap.classList.toggle("below", host.getBoundingClientRect().top < 250);
      pageInput.focus();
      pageInput.select();
    } else {
      closePopover();
    }
  }

  function closePopover() {
    popover.hidden = true;
    pageButton.setAttribute("aria-expanded", "false");
    pageMessage.textContent = "";
  }

  function closeFromPageClick(event) {
    if (!event.composedPath().includes(host)) closePopover();
  }

  function renderGrid() {
    pageGrid.replaceChildren();
    const pages = nearbyPages(model);

    for (const page of pages) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(page);
      button.classList.toggle("current", page === model.currentPage);
      button.setAttribute("aria-label", `Page ${page}`);
      button.addEventListener("click", () => goToPage(page));
      pageGrid.append(button);
    }
  }

  function nearbyPages(pageModel) {
    const pages = new Set(pageModel.availablePages);
    if (pageModel.currentPage) pages.add(pageModel.currentPage);
    const sorted = [...pages].sort((left, right) => left - right);
    if (sorted.length <= MAX_GRID_PAGES) return sorted;

    const currentIndex = Math.max(0, sorted.indexOf(pageModel.currentPage));
    const firstIndex = Math.max(
      0,
      Math.min(currentIndex - Math.floor(MAX_GRID_PAGES / 2), sorted.length - MAX_GRID_PAGES)
    );
    return sorted.slice(firstIndex, firstIndex + MAX_GRID_PAGES);
  }

  function submitPage(event) {
    event.preventDefault();
    goToPage(Number(pageInput.value));
  }

  async function goToPage(page) {
    if (!Number.isInteger(page) || page < 1) {
      showMessage("Enter a valid page number");
      return;
    }
    if (!model.lastPage && page > MAX_UNVERIFIED_PAGE) {
      showMessage("That page number is too large to verify safely");
      return;
    }
    const safePage = model.lastPage ? Math.min(page, model.lastPage) : page;
    if (safePage === model.currentPage) {
      closePopover();
      return;
    }

    const element = model.elementForPage(safePage);
    const url = element?.href || model.urlForPage(safePage);
    if (!url) {
      showMessage("This page cannot be determined safely");
      return;
    }
    revealAfterNavigation();
    await NextPageContent.navigateToURL(url);
  }

  function showMessage(message) {
    if (popover.hidden) togglePopover();
    pageMessage.textContent = message;
  }

  function startDrag(event) {
    event.preventDefault();
    dragging = true;
    setAutoHidden(false);
    closePopover();
    const rect = host.getBoundingClientRect();
    const origin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    moveButton.setPointerCapture(event.pointerId);

    function move(moveEvent) {
      placeAt(
        origin.left + moveEvent.clientX - origin.x,
        origin.top + moveEvent.clientY - origin.y
      );
    }

    function finish(finishEvent) {
      dragging = false;
      moveButton.releasePointerCapture(finishEvent.pointerId);
      moveButton.removeEventListener("pointermove", move);
      moveButton.removeEventListener("pointerup", finish);
      moveButton.removeEventListener("pointercancel", finish);
      savePosition();
    }

    moveButton.addEventListener("pointermove", move);
    moveButton.addEventListener("pointerup", finish);
    moveButton.addEventListener("pointercancel", finish);
  }

  function placeAt(left, top) {
    const maxLeft = Math.max(0, window.innerWidth - host.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - host.offsetHeight);
    const clampedLeft = Math.max(0, Math.min(left, maxLeft));
    const clampedTop = Math.max(0, Math.min(top, maxTop));
    host.style.left = `${clampedLeft}px`;
    host.style.top = `${clampedTop}px`;
    host.style.bottom = "auto";
    host.style.transform = "none";
  }

  function savePosition() {
    const rect = host.getBoundingClientRect();
    const horizontalSpace = Math.max(1, window.innerWidth - rect.width);
    const verticalSpace = Math.max(1, window.innerHeight - rect.height);
    storedPosition = {
      x: Math.max(0, Math.min(1, rect.left / horizontalSpace)),
      y: Math.max(0, Math.min(1, rect.top / verticalSpace))
    };
    chrome.storage.local.set({ floatingPosition: storedPosition }).catch(() => {});
  }

  async function resetPosition(event) {
    event?.preventDefault();
    storedPosition = DEFAULT_POSITION;
    applyStoredPosition();
    try {
      await chrome.storage.local.remove("floatingPosition");
    } catch {
      // A reloaded extension cannot update storage from an older page context.
    }
  }

  function applyStoredPosition() {
    const position = storedPosition;
    const frameId = ++positionFrameId;

    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      host.style.left = "50%";
      host.style.top = "auto";
      host.style.bottom = "24px";
      host.style.transform = "translateX(-50%)";
      return;
    }

    requestAnimationFrame(() => {
      if (frameId !== positionFrameId) return;
      const left = position.x * Math.max(0, window.innerWidth - host.offsetWidth);
      const top = position.y * Math.max(0, window.innerHeight - host.offsetHeight);
      placeAt(left, top);
    });
  }
})();
