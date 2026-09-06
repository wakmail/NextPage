const DEFAULT_SETTINGS = {
  arrivalBehavior: "restore",
  rememberPositions: true,
  smoothScroll: true,
  scrollDuration: 250
};

const POSITION_LIMIT = 250;
let saveQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(async details => {
  const current = await chrome.storage.local.get("settings");
  const settings = { ...DEFAULT_SETTINGS, ...current.settings };

  if (details.reason === "update" && details.previousVersion === "0.2.0" &&
      current.settings?.scrollDuration === 1250) {
    settings.scrollDuration = 250;
  }

  await chrome.storage.local.set({
    settings
  });
});

chrome.commands.onCommand.addListener(async command => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await sendAction(tab.id, command);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => sendResponse({ ok: false, message: error.message }));
  return true;
});

async function handleMessage(message, sender) {
  if (message.type === "run-action") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return { ok: false, message: "No active page found" };
    return sendAction(tab.id, message.action);
  }

  if (message.type === "prepare-navigation") {
    if (!sender.tab?.id) return { ok: false };
    const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
    await chrome.storage.session.set({
      [`arrival:${sender.tab.id}`]: {
        behavior: settings.arrivalBehavior,
        createdAt: Date.now()
      }
    });
    return { ok: true };
  }

  if (message.type === "consume-arrival") {
    if (!sender.tab?.id) return { ok: true, behavior: null };
    const key = `arrival:${sender.tab.id}`;
    const result = await chrome.storage.session.get(key);
    await chrome.storage.session.remove(key);
    const pending = result[key];
    if (!pending || Date.now() - pending.createdAt > 15000) {
      return { ok: true, behavior: null };
    }
    return { ok: true, behavior: pending.behavior };
  }

  if (message.type === "save-position") {
    saveQueue = saveQueue.then(() => savePosition(message.url, message.x, message.y));
    await saveQueue;
    return { ok: true };
  }

  if (message.type === "get-position") {
    const { scrollPositions = {} } = await chrome.storage.local.get("scrollPositions");
    return { ok: true, position: scrollPositions[message.url] ?? null };
  }

  return { ok: false, message: "Unknown request" };
}

async function sendAction(tabId, action) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "action", action });
  } catch {
    return {
      ok: false,
      message: "NextPage cannot run on this browser page"
    };
  }
}

async function savePosition(url, x, y) {
  const { settings = DEFAULT_SETTINGS, scrollPositions = {} } =
    await chrome.storage.local.get(["settings", "scrollPositions"]);

  if (!settings.rememberPositions || !url) return;

  scrollPositions[url] = { x, y, updatedAt: Date.now() };
  const entries = Object.entries(scrollPositions);

  if (entries.length > POSITION_LIMIT) {
    entries
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
      .slice(POSITION_LIMIT)
      .forEach(([key]) => delete scrollPositions[key]);
  }

  await chrome.storage.local.set({ scrollPositions });
}
