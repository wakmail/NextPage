const DEFAULT_SETTINGS = {
  arrivalBehavior: "restore",
  rememberPositions: true,
  smoothScroll: true
};

const arrivalBehavior = document.querySelector("#arrival-behavior");
const rememberPositions = document.querySelector("#remember-positions");
const smoothScroll = document.querySelector("#smooth-scroll");
const status = document.querySelector("#status");

initialize();

async function initialize() {
  const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
  const merged = { ...DEFAULT_SETTINGS, ...settings };

  arrivalBehavior.value = merged.arrivalBehavior;
  rememberPositions.checked = merged.rememberPositions;
  smoothScroll.checked = merged.smoothScroll;

  document.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => runAction(button.dataset.action));
  });

  arrivalBehavior.addEventListener("change", saveSettings);
  rememberPositions.addEventListener("change", saveSettings);
  smoothScroll.addEventListener("change", saveSettings);

  document.querySelector("#shortcut-settings").addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
}

async function runAction(action) {
  setStatus("");
  const response = await chrome.runtime.sendMessage({ type: "run-action", action });
  setStatus(response?.message ?? "Action unavailable", !response?.ok);

  if (response?.ok && (action === "next-page" || action === "previous-page")) {
    window.close();
  }
}

async function saveSettings() {
  await chrome.storage.local.set({
    settings: {
      arrivalBehavior: arrivalBehavior.value,
      rememberPositions: rememberPositions.checked,
      smoothScroll: smoothScroll.checked
    }
  });
  setStatus("Saved");
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}
