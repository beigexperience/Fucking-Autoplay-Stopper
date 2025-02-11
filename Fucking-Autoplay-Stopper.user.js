// ==UserScript==
// @name         Fucking Autoplay Stopper
// @namespace    Violentmonkey Scripts
// @version      0.1
// @description  This script force-pauses your shitty autoplay at night so you don’t wake up to garbage
// @match        https://www.youtube.com/watch?*
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @require      https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/moment.min.js
// ==/UserScript==

"use strict";

// --- Insert Custom CSS for In-Page Notifications and Modals ---
const style = document.createElement('style');
style.textContent = `
  .custom-notification {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: #fff;
    padding: 20px 30px;
    border-radius: 5px;
    z-index: 9999;
    cursor: default;
    opacity: 0.95;
    white-space: pre-line;
    text-align: center;
    font-size: 20px;
  }
  .custom-notification button {
    margin-top: 15px;
    padding: 8px 16px;
    font-size: 18px;
    cursor: pointer;
  }
  .custom-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .custom-modal {
    background: #fff;
    padding: 20px;
    border-radius: 5px;
    max-width: 90%;
    box-shadow: 0 0 10px rgba(0,0,0,0.5);
  }
  .custom-modal input[type="text"] {
    width: 100%;
    padding: 8px;
    margin: 10px 0;
    box-sizing: border-box;
  }
  .custom-modal button {
    padding: 8px 16px;
    margin: 5px;
  }
`;
document.head.appendChild(style);

// --- In-Browser Notification Function ---
function showNotification(title, message, onClick) {
  const notif = document.createElement('div');
  notif.className = 'custom-notification';
  notif.innerText = title + "\n" + message;

  const okButton = document.createElement('button');
  okButton.innerText = 'OK';
  okButton.addEventListener('click', () => {
    if (onClick) onClick();
    notif.remove();
  });
  notif.appendChild(document.createElement('br'));
  notif.appendChild(okButton);

  document.body.appendChild(notif);

  setTimeout(() => {
    okButton.focus();
  }, 800);
}

// --- In-Browser Modal Input Dialog ---
function showInputModal(title, promptText, defaultValue, callback) {
  const overlay = document.createElement('div');
  overlay.className = 'custom-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'custom-modal';

  const h3 = document.createElement('h3');
  h3.innerText = title;
  modal.appendChild(h3);

  const p = document.createElement('p');
  p.innerText = promptText;
  modal.appendChild(p);

  const input = document.createElement('input');
  input.type = 'text';
  input.value = defaultValue;
  modal.appendChild(input);

  const btnContainer = document.createElement('div');

  const okBtn = document.createElement('button');
  okBtn.innerText = 'OK';
  okBtn.addEventListener('click', () => {
    const value = input.value;
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    callback(value);
  });
  btnContainer.appendChild(okBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.innerText = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  });
  btnContainer.appendChild(cancelBtn);

  modal.appendChild(btnContainer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// --- Configuration Settings ---
const CHECK_INTERVAL = 10 * 1000;           // Check every 10 seconds.
let inactivityThreshold = 5 * 60 * 1000;      // Default inactivity threshold: 5 minutes.
let nightStartHour = 22;                      // Default night start: 10 PM.
let nightEndHour = 9;                         // Default night end: 9 AM;

// Override durations (in milliseconds)
const DEFAULT_OVERRIDE_DURATION = 60 * 60 * 1000;
const TEST_OVERRIDE_DURATION = 30 * 1000;     // 30 seconds in test mode.
let overrideDuration = DEFAULT_OVERRIDE_DURATION;

// Global variable to suppress re-pausing.
let temporaryOverrideUntil = 0;

// --- Test Mode Variables ---
let testModeEnabled = false;
let originalNightStart = null;
let originalNightEnd = null;
let originalInactivityThreshold = null;
let originalOverrideDuration = null;

// --- Activity Tracking ---
let lastActivityTime = moment();
function updateActivity() {
  lastActivityTime = moment();
}
['mousemove', 'keydown', 'click', 'scroll'].forEach(event => {
  window.addEventListener(event, updateActivity, false);
});

// --- Helper Function: Is it Night? ---
function isNight() {
  const now = moment();
  const start = moment().hour(nightStartHour).minute(0).second(0).millisecond(0);
  const end = moment().hour(nightEndHour).minute(0).second(0).millisecond(0);
  if (nightStartHour < nightEndHour) {
    return now.isBetween(start, end, null, '[)');
  } else {
    return now.isSameOrAfter(start) || now.isBefore(end);
  }
}

// --- Menu Command Management ---
let menuTestModeId, menuNightStartId, menuNightEndId, menuInactivityThresholdId, menuOverrideDurationId;

function updateMenuCommands() {
  if (typeof GM_unregisterMenuCommand === 'function') {
    if (menuTestModeId) GM_unregisterMenuCommand(menuTestModeId);
    if (menuNightStartId) GM_unregisterMenuCommand(menuNightStartId);
    if (menuNightEndId) GM_unregisterMenuCommand(menuNightEndId);
    if (menuInactivityThresholdId) GM_unregisterMenuCommand(menuInactivityThresholdId);
    if (menuOverrideDurationId) GM_unregisterMenuCommand(menuOverrideDurationId);
  }

  menuTestModeId = GM_registerMenuCommand(
    `Toggle Test Mode (Currently ${testModeEnabled ? "ON" : "OFF"})`,
    () => {
      testModeEnabled = !testModeEnabled;
      if (testModeEnabled) {
        if (originalNightStart === null) originalNightStart = nightStartHour;
        if (originalNightEnd === null) originalNightEnd = nightEndHour;
        if (originalInactivityThreshold === null) originalInactivityThreshold = inactivityThreshold;
        if (originalOverrideDuration === null) originalOverrideDuration = overrideDuration;

        nightStartHour = 0;
        nightEndHour = 24;
        inactivityThreshold = 10 * 1000; // 10 seconds
        overrideDuration = TEST_OVERRIDE_DURATION;
        showNotification("Test Mode", "Test mode enabled.\nNight forced (0-24), inactivity threshold set to 10 sec,\nand override duration set to 30 sec.\nVideo will pause if no activity is detected for 10 sec.");
      } else {
        if (originalNightStart !== null && originalNightEnd !== null && originalInactivityThreshold !== null && originalOverrideDuration !== null) {
          nightStartHour = originalNightStart;
          nightEndHour = originalNightEnd;
          inactivityThreshold = originalInactivityThreshold;
          overrideDuration = originalOverrideDuration;
        }
        showNotification("Test Mode", "Test mode disabled.");
      }
      updateMenuCommands();
    }
  );

  menuNightStartId = GM_registerMenuCommand(
    `Set Night Start Hour (Current: ${nightStartHour})`,
    () => {
      showInputModal("Night Start Hour", "Enter night start hour (0-23):", nightStartHour.toString(), (value) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num >= 0 && num < 24) {
          nightStartHour = num;
          showNotification("Configuration", "Night start hour set to " + num + ".");
        } else {
          showNotification("Configuration", "Invalid input for night start hour.");
        }
        updateMenuCommands();
      });
    }
  );

  menuNightEndId = GM_registerMenuCommand(
    `Set Night End Hour (Current: ${nightEndHour})`,
    () => {
      showInputModal("Night End Hour", "Enter night end hour (0-23):", nightEndHour.toString(), (value) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num >= 0 && num < 24) {
          nightEndHour = num;
          showNotification("Configuration", "Night end hour set to " + num + ".");
        } else {
          showNotification("Configuration", "Invalid input for night end hour.");
        }
        updateMenuCommands();
      });
    }
  );

  menuInactivityThresholdId = GM_registerMenuCommand(
    `Set Inactivity Threshold (Current: ${inactivityThreshold/60000} min)`,
    () => {
      showInputModal("Inactivity Threshold", "Enter threshold in minutes:", (inactivityThreshold / 60000).toString(), (value) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num > 0) {
          inactivityThreshold = num * 60000;
          showNotification("Configuration", "Inactivity threshold set to " + num + " minutes.");
        } else {
          showNotification("Configuration", "Invalid input for threshold.");
        }
        updateMenuCommands();
      });
    }
  );

  // --- New: Menu Command for Override Duration ---
  menuOverrideDurationId = GM_registerMenuCommand(
    `Set Override Duration (Current: ${overrideDuration/60000} min)`,
    () => {
      showInputModal("Override Duration", "Enter override duration in minutes:", (overrideDuration / 60000).toString(), (value) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num > 0) {
          overrideDuration = num * 60000;
          showNotification("Configuration", "Override duration set to " + num + " minutes.");
        } else {
          showNotification("Configuration", "Invalid input for override duration.");
        }
        updateMenuCommands();
      });
    }
  );
}
updateMenuCommands();

// --- Main Check Loop ---
function runMainLoop() {
  setInterval(() => {
    const video = document.querySelector('video');
    if (!video) return;

    if (Date.now() < temporaryOverrideUntil) return;

    const now = moment();
    const inactivityDuration = now.diff(lastActivityTime);

    const commentsDisabled = document.body.innerText.includes("Comments are turned off");

    let inactiveAtNight = false;
    if (isNight() && inactivityDuration >= inactivityThreshold) {
      inactiveAtNight = true;
    }

    if (!video.paused && (commentsDisabled || inactiveAtNight)) {
      video.pause();
      let notificationText = "";
      let notificationTitle = "";
      if (commentsDisabled) {
        notificationText = "Video paused because comments are disabled.\nClick OK to resume playback.";
        notificationTitle = "Paused: Disabled Comments";
      } else if (inactiveAtNight) {
        notificationText = "Video paused due to inactivity.\nClick OK to resume playback.";
        notificationTitle = "Paused: Inactivity";
      }
      showNotification(notificationTitle, notificationText, () => {
        temporaryOverrideUntil = Date.now() + overrideDuration;
        video.play();
      });
    }
  }, CHECK_INTERVAL);
}

if (document.body) {
  runMainLoop();
} else {
  document.addEventListener("DOMContentLoaded", runMainLoop);
}
