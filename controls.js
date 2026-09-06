(() => {
  const DEFAULT_POSITION = null;
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
        user-select: none;
      }
      .pill {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 5px;
        border: 1px solid light-dark(rgba(255,255,255,.78), rgba(255,255,255,.18));
        border-radius: 999px;
        background: light-dark(rgba(240,240,244,.62), rgba(30,30,34,.58));
        box-shadow: 0 12px 34px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.5);
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
        border: 1px solid light-dark(rgba(255,255,255,.8), rgba(255,255,255,.18));
        border-radius: 20px;
        background: light-dark(rgba(242,242,246,.78), rgba(29,29,33,.76));
        box-shadow: 0 16px 42px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.5);
        backdrop-filter: blur(22px) saturate(165%);
        -webkit-backdrop-filter: blur(22px) saturate(165%);
        transform: translateX(-50%);
      }
      .wrap.below .popover { top: calc(100% + 10px); bottom: auto; }
      .popover[hidden] { display: none; }
      .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
      .grid button { min-width: 0; height: 34px; background: light-dark(rgba(255,255,255,.48), rgba(255,255,255,.07)); }
      .grid button.current { color: white; background: #4169e1; }
      form { display: grid; grid-template-columns: 1fr auto; gap: 7px; margin-top: 9px; }
      input {
        min-width: 0;
        height: 36px;
        padding: 0 11px;
        border: 1px solid light-dark(rgba(0,0,0,.14), rgba(255,255,255,.15));
        border-radius: 999px;
        color: inherit;
        background: light-dark(rgba(255,255,255,.65), rgba(255,255,255,.07));
      }
      form button { min-width: 48px; height: 36px; padding: 0 13px; color: white; background: #4169e1; }
      .message { min-height: 14px; margin: 8px 4px 0; color: light-dark(#626268, #b7b7be); font-size: 11px; font-weight: 500; }
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
        <button class="move" id="move" type="button" aria-label="Move controls" title="Move controls">⠿</button>
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

  initialize();

  async function initialize() {
    document.documentElement.append(host);
    const stored = await chrome.storage.local.get(["settings", "floatingPosition"]);
    storedPosition = stored.floatingPosition ?? DEFAULT_POSITION;
    setVisible(Boolean(stored.settings?.floatingControls));
    applyStoredPosition();
    refresh();

    previousButton.addEventListener("click", () => runDirection("previous-page"));
    nextButton.addEventListener("click", () => runDirection("next-page"));
    pageButton.addEventListener("click", togglePopover);
    pageForm.addEventListener("submit", submitPage);
    moveButton.addEventListener("pointerdown", startDrag);
    document.addEventListener("pointerdown", closeFromPageClick, true);
    window.addEventListener("resize", applyStoredPosition, { passive: true });

    chrome.storage.onChanged.addListener(changes => {
      if (changes.settings) setVisible(Boolean(changes.settings.newValue?.floatingControls));
      if (changes.floatingPosition) {
        storedPosition = changes.floatingPosition.newValue ?? DEFAULT_POSITION;
        applyStoredPosition();
      }
    });

    new MutationObserver(scheduleRefresh).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function setVisible(visible) {
    host.hidden = !visible;
    host.style.display = visible ? "block" : "none";
    if (visible) scheduleRefresh();
  }

  function refresh() {
    model = NextPageNavigation.getPageModel();
    const previous = NextPageNavigation.findNavigationLink("previous");
    const next = NextPageNavigation.findNavigationLink("next");
    previousButton.disabled = !previous;
    nextButton.disabled = !next;
    pageButton.textContent = model.currentPage ? `Page ${model.currentPage}` : "Page ?";
    pageInput.value = model.currentPage ?? "";
    renderGrid();
  }

  function scheduleRefresh() {
    if (host.hidden) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 350);
  }

  async function runDirection(action) {
    closePopover();
    const result = await NextPageContent.runAction(action);
    if (!result.ok) showMessage(result.message);
  }

  function togglePopover() {
    if (popover.hidden) {
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
    if (!pageModel.currentPage) return pageModel.availablePages.slice(0, 8);
    const pages = [];
    const first = Math.max(1, pageModel.currentPage - 3);
    for (let page = first; page < first + 8; page += 1) {
      if (page === pageModel.currentPage || pageModel.elementForPage(page) || pageModel.urlForPage(page)) {
        pages.push(page);
      }
    }
    return pages;
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
    if (page === model.currentPage) {
      closePopover();
      return;
    }

    const element = model.elementForPage(page);
    const url = element?.href || model.urlForPage(page);
    if (!url) {
      showMessage("This page cannot be determined safely");
      return;
    }
    await NextPageContent.navigateToURL(url);
  }

  function showMessage(message) {
    if (popover.hidden) togglePopover();
    pageMessage.textContent = message;
  }

  function startDrag(event) {
    event.preventDefault();
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
    chrome.storage.local.set({ floatingPosition: storedPosition });
  }

  function applyStoredPosition() {
    if (!storedPosition || !Number.isFinite(storedPosition.x) || !Number.isFinite(storedPosition.y)) {
      host.style.left = "50%";
      host.style.top = "auto";
      host.style.bottom = "24px";
      host.style.transform = "translateX(-50%)";
      return;
    }

    requestAnimationFrame(() => {
      const left = storedPosition.x * Math.max(0, window.innerWidth - host.offsetWidth);
      const top = storedPosition.y * Math.max(0, window.innerHeight - host.offsetHeight);
      placeAt(left, top);
    });
  }
})();
