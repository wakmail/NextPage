const DEFAULT_SETTINGS = {
  arrivalBehavior: "restore",
  rememberPositions: true,
  smoothScroll: true,
  scrollDuration: 1250
};

const arrivalBehavior = document.querySelector("#arrival-behavior");
const rememberPositions = document.querySelector("#remember-positions");
const smoothScroll = document.querySelector("#smooth-scroll");
const scrollDuration = document.querySelector("#scroll-duration");
const scrollDurationValue = document.querySelector("#scroll-duration-value");
const status = document.querySelector("#status");

initialize();

async function initialize() {
  const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
  const merged = { ...DEFAULT_SETTINGS, ...settings };

  arrivalBehavior.value = merged.arrivalBehavior;
  rememberPositions.checked = merged.rememberPositions;
  smoothScroll.checked = merged.smoothScroll;
  scrollDuration.value = merged.scrollDuration;
  updateDurationDisplay();

  document.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => runAction(button.dataset.action));
  });

  arrivalBehavior.addEventListener("change", saveSettings);
  rememberPositions.addEventListener("change", saveSettings);
  smoothScroll.addEventListener("change", () => {
    updateDurationDisplay();
    saveSettings();
  });
  scrollDuration.addEventListener("input", updateDurationDisplay);
  scrollDuration.addEventListener("change", saveSettings);

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
      smoothScroll: smoothScroll.checked,
      scrollDuration: Number(scrollDuration.value)
    }
  });
  setStatus("Saved");
}

function updateDurationDisplay() {
  scrollDuration.disabled = !smoothScroll.checked;
  scrollDurationValue.textContent = smoothScroll.checked
    ? `${(Number(scrollDuration.value) / 1000).toFixed(2)} s`
    : "Off";
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}
