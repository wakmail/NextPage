const DEFAULT_SETTINGS = {
  arrivalBehavior: "restore",
  rememberPositions: true,
  smoothScroll: true,
  scrollDuration: 250,
  floatingControls: false,
  controlsTheme: "auto"
};

const arrivalBehavior = document.querySelector("#arrival-behavior");
const rememberPositions = document.querySelector("#remember-positions");
const rememberSetting = document.querySelector("#remember-setting");
const smoothScroll = document.querySelector("#smooth-scroll");
const scrollDuration = document.querySelector("#scroll-duration");
const scrollDurationValue = document.querySelector("#scroll-duration-value");
const resetDuration = document.querySelector("#reset-duration");
const durationSetting = document.querySelector("#duration-setting");
const floatingControls = document.querySelector("#floating-controls");
const controlsTheme = document.querySelector("#controls-theme");
const controlsThemeSetting = document.querySelector("#controls-theme-setting");
const resetFloatingPosition = document.querySelector("#reset-floating-position");
const controlsPositionSetting = document.querySelector("#controls-position-setting");
const status = document.querySelector("#status");

initialize();

async function initialize() {
  const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
  const merged = { ...DEFAULT_SETTINGS, ...settings };

  arrivalBehavior.value = merged.arrivalBehavior;
  rememberPositions.checked = merged.rememberPositions;
  smoothScroll.checked = merged.smoothScroll;
  scrollDuration.value = merged.scrollDuration;
  floatingControls.checked = merged.floatingControls;
  controlsTheme.value = merged.controlsTheme;
  updateDurationDisplay();
  updateRelevance();

  document.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => runAction(button.dataset.action));
  });

  arrivalBehavior.addEventListener("change", () => {
    updateRelevance();
    saveSettings();
  });
  rememberPositions.addEventListener("change", saveSettings);
  smoothScroll.addEventListener("change", () => {
    updateDurationDisplay();
    saveSettings();
  });
  scrollDuration.addEventListener("input", updateDurationDisplay);
  scrollDuration.addEventListener("change", saveSettings);
  resetDuration.addEventListener("click", resetScrollDuration);
  floatingControls.addEventListener("change", () => {
    updateRelevance();
    saveSettings();
  });
  controlsTheme.addEventListener("change", saveSettings);
  resetFloatingPosition.addEventListener("click", resetControlsPosition);

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
      scrollDuration: Number(scrollDuration.value),
      floatingControls: floatingControls.checked,
      controlsTheme: controlsTheme.value
    }
  });
  setStatus("Saved");
}

function updateDurationDisplay() {
  scrollDuration.disabled = !smoothScroll.checked;
  resetDuration.disabled = !smoothScroll.checked;
  durationSetting.classList.toggle("is-disabled", !smoothScroll.checked);

  if (!smoothScroll.checked) {
    scrollDurationValue.textContent = "Off";
  } else if (Number(scrollDuration.value) === 0) {
    scrollDurationValue.textContent = "Instant";
  } else {
    scrollDurationValue.textContent = `${(Number(scrollDuration.value) / 1000).toFixed(2)} s`;
  }
}

function updateRelevance() {
  const restoringPosition = arrivalBehavior.value === "restore";
  rememberPositions.disabled = !restoringPosition;
  rememberSetting.classList.toggle("is-disabled", !restoringPosition);

  const showingBar = floatingControls.checked;
  controlsTheme.disabled = !showingBar;
  resetFloatingPosition.disabled = !showingBar;
  controlsThemeSetting.classList.toggle("is-disabled", !showingBar);
  controlsPositionSetting.classList.toggle("is-disabled", !showingBar);
}

function resetScrollDuration() {
  scrollDuration.value = DEFAULT_SETTINGS.scrollDuration;
  updateDurationDisplay();
  saveSettings();
}

async function resetControlsPosition() {
  await chrome.storage.local.remove("floatingPosition");
  setStatus("Position reset");
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}
