/* eslint-disable @typescript-eslint/no-unused-expressions */
(function () {
  function isExperimentEnabled(experimentFlag) {
    const flag = window.ytcfg.data_.EXPERIMENT_FLAGS[experimentFlag];
    if (flag && typeof flag === "string") return flag === "false" ? false : true;
    return !!flag;
  }

  const ytmStore = window.__YTMD_HOOK__.ytmStore;

  let ytmdControlButtons = {};

  let currentVideoId = "";

  let libraryFeedbackDefaultToken = "";
  let libraryFeedbackToggledToken = "";

  let libraryButton = document.createElement("yt-button-shape");
  libraryButton.classList.add("ytmd-player-bar-control");
  libraryButton.classList.add("library-button");
  let libraryButtonData = {
    focused: false,
    iconPosition: "icon-only",
    onTap: function () {
      var closePopupEvent = {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail: {
          actionName: "yt-close-popups-action",
          args: [["ytmusic-menu-popup-renderer"]],
          optionalAction: false,
          returnValue: []
        }
      };
      var feedbackEvent = {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail: {
          actionName: "yt-service-request",
          args: [
            this,
            {
              feedbackEndpoint: {
                feedbackToken: libraryButtonData.toggled ? libraryFeedbackToggledToken : libraryFeedbackDefaultToken
              }
            }
          ],
          optionalAction: false,
          returnValue: []
        }
      };
      this.dispatchEvent(new CustomEvent("yt-action", closePopupEvent));
      this.dispatchEvent(new CustomEvent("yt-action", feedbackEvent));
      window.__YTMD_HOOK__.ytmStore.dispatch({
        type: "SET_FEEDBACK_TOGGLE_STATE",
        payload: { defaultEndpointFeedbackToken: libraryFeedbackDefaultToken, isToggled: !libraryButtonData.toggled }
      });
    }.bind(libraryButton),
    style: "mono",
    toggled: false,
    toggleable: true,
    type: "text"
  };
  libraryButton.rawProps = {
    iconName: "yt-sys-icons:library_add",
    data: libraryButtonData
  };
  document
    .querySelector("ytmusic-app-layout>ytmusic-player-bar")
    .querySelector("ytmusic-like-button-renderer")
    .insertAdjacentElement("afterend", libraryButton);

  let playlistButton = document.createElement("yt-button-shape");
  playlistButton.classList.add("ytmd-player-bar-control");
  playlistButton.classList.add("playlist-button");
  let playlistButtonData = {
    focused: false,
    iconPosition: "icon-only",
    onTap: function () {
      var closePopupEvent = {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail: {
          actionName: "yt-close-popups-action",
          args: [["ytmusic-menu-popup-renderer"]],
          optionalAction: false,
          returnValue: []
        }
      };
      var returnValue = [];
      var serviceRequestEvent = {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail: {
          actionName: "yt-service-request",
          args: [
            this,
            {
              addToPlaylistEndpoint: {
                videoId: currentVideoId
              }
            }
          ],
          optionalAction: false,
          returnValue
        }
      };
      this.dispatchEvent(new CustomEvent("yt-action", closePopupEvent));
      this.dispatchEvent(new CustomEvent("yt-action", serviceRequestEvent));
      // Without a sign-in (or when YouTube refuses) nothing would happen at all: say so instead
      var showFailure = () => {
        this.dispatchEvent(
          new CustomEvent("yt-action", {
            bubbles: true,
            cancelable: false,
            composed: true,
            detail: {
              actionName: "yt-open-popup-action",
              args: [
                {
                  openPopupAction: {
                    popup: { notificationActionRenderer: { responseText: { runs: [{ text: "Your playlists could not be loaded. Are you signed in?" }] } } },
                    popupType: "TOAST",
                    uniqueId: crypto.randomUUID()
                  }
                },
                this
              ],
              optionalAction: false,
              returnValue: []
            }
          })
        );
      };
      if (!returnValue[0] || !returnValue[0].ajaxPromise) {
        showFailure();
        return;
      }
      returnValue[0].ajaxPromise.then(
        response => {
          var addToPlaylistRenderer = response && response.data && response.data.contents && response.data.contents[0] && response.data.contents[0].addToPlaylistRenderer;
          if (!addToPlaylistRenderer) {
            showFailure();
            return;
          }
          var addToPlaylistEvent = {
            bubbles: true,
            cancelable: false,
            composed: true,
            detail: {
              actionName: "yt-open-popup-action",
              args: [
                {
                  openPopupAction: {
                    popup: {
                      addToPlaylistRenderer
                    },
                    popupType: "DIALOG"
                  }
                },
                this
              ],
              optionalAction: false,
              returnValue: []
            }
          };
          this.dispatchEvent(new CustomEvent("yt-action", addToPlaylistEvent));
          this.dispatchEvent(new CustomEvent("yt-action", closePopupEvent));
        },
        () => showFailure(),
        this
      );
    }.bind(playlistButton),
    style: "mono",
    toggled: false,
    type: "text"
  };
  playlistButton.rawProps = {
    iconName: "yt-sys-icons:playlist_add",
    data: playlistButtonData
  };
  libraryButton.insertAdjacentElement("afterend", playlistButton);

  window.__YTMD_HOOK__.ytmPlayerBar.playerApi.addEventListener("onVideoDataChange", event => {
    if (event.playertype === 1 && (event.type === "dataloaded" || event.type === "dataupdated")) {
      currentVideoId = window.__YTMD_HOOK__.ytmPlayerBar.playerApi.getPlayerResponse().videoDetails.videoId;
    }
  });

  let rightControls = document.querySelector("ytmusic-app-layout>ytmusic-player-bar").querySelector(".right-controls-buttons");
  let sleepTimerButton = document.createElement("yt-icon-button");

  let sleepTimerIcon = document.createElement("yt-icon");
  sleepTimerIcon.set("icon", "TIMER");
  sleepTimerButton.appendChild(sleepTimerIcon);

  sleepTimerButton.setAttribute("title", "Sleep timer off");
  sleepTimerButton.classList.add("ytmusic-player-bar");
  sleepTimerButton.classList.add("ytmd-player-bar-control");
  sleepTimerButton.classList.add("sleep-timer-button");
  rightControls.querySelector(".shuffle").insertAdjacentElement("afterend", sleepTimerButton);

  // ── Sleep timer ────────────────────────────────────────────────────────────────────────────────────────
  // Its own small panel above the button (YouTube Music's dropdown took the theme's colours and had no room for the
  // time that is left). At the end the music fades out over a few seconds instead of stopping hard.
  const playerApi = window.__YTMD_HOOK__.ytmPlayerBar.playerApi;
  const FADE_MS = 8000;
  const CHOICES = [5, 10, 15, 30, 45, 60, 90, 120];

  // { mode: "minutes", minutes, endsAt } or { mode: "song" }, null when off
  let sleepTimer = null;
  let sleepTimerCheck = null;
  let fading = null;

  function toast(text) {
    document.body.dispatchEvent(
      new CustomEvent("yt-action", {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail: {
          actionName: "yt-open-popup-action",
          args: [
            {
              openPopupAction: {
                popup: { notificationActionRenderer: { responseText: { runs: [{ text }] } } },
                popupType: "TOAST",
                uniqueId: crypto.randomUUID()
              }
            },
            document.querySelector("ytmusic-app")
          ],
          optionalAction: false,
          returnValue: []
        }
      })
    );
  }

  function pausedDialog() {
    document.body.dispatchEvent(
      new CustomEvent("yt-action", {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail: {
          actionName: "yt-open-popup-action",
          args: [
            {
              openPopupAction: {
                popup: {
                  dismissableDialogRenderer: {
                    title: { runs: [{ text: "Music paused" }] },
                    dialogMessages: [{ runs: [{ text: "The sleep timer ran out and your music has been paused. Good night." }] }]
                  }
                },
                popupType: "DIALOG"
              }
            },
            document.querySelector("ytmusic-app")
          ],
          optionalAction: false,
          returnValue: []
        }
      })
    );
  }

  function humanizeMinutes(minutes) {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = minutes / 60;
    return Number.isInteger(hours) ? `${hours} hour${hours === 1 ? "" : "s"}` : `${Math.floor(hours)} h ${minutes % 60} min`;
  }

  function formatCountdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
  }

  function isPlaying() {
    return !!document.querySelector("ytmusic-app-layout>ytmusic-player-bar")?.playing;
  }

  /** Pauses, and keeps it paused for a moment in case YouTube Music's autoplay starts the next song anyway */
  function pauseAndHold() {
    if (isPlaying()) playerApi.pauseVideo();
    const pausedAt = Date.now();
    const hold = setInterval(() => {
      if (Date.now() - pausedAt > 3000) clearInterval(hold);
      else if (isPlaying()) playerApi.pauseVideo();
    }, 150);
  }

  /** Lowers the volume step by step, pauses, then puts the volume back for next time */
  function fadeOutAndPause(duration) {
    if (fading) return;
    const startVolume = playerApi.getVolume();
    if (!isPlaying() || playerApi.isMuted() || startVolume === 0 || duration < 300) {
      pauseAndHold();
      return;
    }
    const steps = Math.max(1, Math.round(duration / 150));
    let step = 0;
    fading = setInterval(() => {
      step++;
      // Paused by hand in the meantime: stop fading, the volume goes back
      const done = step >= steps || !isPlaying();
      if (!done) {
        playerApi.setVolume(Math.round(startVolume * (1 - step / steps) ** 1.6));
        return;
      }
      clearInterval(fading);
      fading = null;
      const pausedByTimer = isPlaying();
      if (pausedByTimer) pauseAndHold();
      // The volume comes back once the music is surely paused
      setTimeout(() => playerApi.setVolume(startVolume), pausedByTimer ? 600 : 0);
    }, duration / steps);
  }

  function checkSleepTimer() {
    if (!sleepTimer) return;
    let remaining;
    if (sleepTimer.mode === "minutes") {
      remaining = sleepTimer.endsAt - Date.now();
    } else {
      const duration = playerApi.getDuration();
      remaining = duration > 0 ? (duration - playerApi.getCurrentTime()) * 1000 : Infinity;
    }
    if (remaining <= FADE_MS) {
      const song = sleepTimer.mode === "song";
      setSleepTimer(null, true);
      // At the end of a song it pauses a second early, before YouTube Music moves on to the next one
      fadeOutAndPause(Math.max(0, remaining - (song ? 1200 : 0)));
      setTimeout(pausedDialog, Math.max(0, remaining) + 400);
    }
    renderSleepTimer();
  }

  function setSleepTimer(timer, expired) {
    sleepTimer = timer;
    clearInterval(sleepTimerCheck);
    sleepTimerCheck = timer ? setInterval(checkSleepTimer, 250) : null;
    if (timer && fading) {
      // A new timer while fading out: stop the fade and bring the volume back
      clearInterval(fading);
      fading = null;
    }
    if (!expired) {
      if (!timer) toast("Sleep timer turned off");
      else if (timer.mode === "song") toast("Music pauses after this song");
      else toast(`Sleep timer set to ${humanizeMinutes(timer.minutes)}`);
    }
    renderSleepTimer();
  }

  // ── Panel ──
  const panelHost = document.createElement("div");
  panelHost.id = "ytmd-sleep-timer";
  const panelRoot = panelHost.attachShadow({ mode: "open" });
  const panelStyle = document.createElement("style");
  panelStyle.textContent = `
    :host { all: initial; }
    .panel {
      position: fixed; z-index: 2147483100; width: 312px; box-sizing: border-box; padding: 16px;
      border-radius: 18px; color: #fff; font-family: "YouTube Sans", Roboto, "Segoe UI", sans-serif;
      background: rgba(24, 24, 28, 0.86); backdrop-filter: blur(24px) saturate(1.5);
      border: 1px solid rgba(255, 255, 255, 0.09);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06);
      opacity: 0; transform: translateY(10px) scale(0.97); transform-origin: bottom center;
      transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.9, 0.25, 1);
      pointer-events: none;
    }
    .panel.open { opacity: 1; transform: none; pointer-events: auto; }
    .head { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
    .ring { position: relative; flex-shrink: 0; width: 52px; height: 52px; }
    .ring svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
    .ring circle { fill: none; stroke-width: 4; }
    .ring .track { stroke: rgba(255, 255, 255, 0.12); }
    .ring .left { stroke: #fff; stroke-linecap: round; transition: stroke-dashoffset 400ms linear; }
    .ring .moon { position: absolute; inset: 0; margin: auto; width: 24px; height: 24px; fill: #fff; transform: none; }
    .ring .count { position: absolute; inset: 0; display: grid; place-items: center; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .texts { min-width: 0; }
    .title { margin: 0; font-size: 16px; font-weight: 700; }
    .status { margin: 3px 0 0; font-size: 13px; color: rgba(255, 255, 255, 0.66); }
    .status b { color: #fff; font-weight: 600; font-variant-numeric: tabular-nums; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    button {
      font: inherit; color: inherit; border: 0; cursor: pointer; border-radius: 12px;
      background: rgba(255, 255, 255, 0.07); transition: background-color 140ms ease, color 140ms ease, transform 100ms ease;
    }
    button:hover { background: rgba(255, 255, 255, 0.14); }
    button:active { transform: scale(0.96); }
    button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    button.selected { color: #111; background: #fff; }
    .choice { padding: 10px 0 9px; font-size: 13.5px; font-weight: 600; line-height: 1.1; }
    .choice small { display: block; margin-top: 2px; font-size: 10.5px; font-weight: 500; opacity: 0.6; }
    .song { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; font-size: 13.5px; font-weight: 600; }
    .song svg { width: 18px; height: 18px; fill: currentColor; }
    .actions { display: flex; gap: 6px; margin-top: 10px; }
    .actions button { flex: 1; padding: 9px; font-size: 13px; font-weight: 600; }
    .actions .off { color: #ffb4ab; }
    .hidden { display: none !important; }
    @media (prefers-reduced-motion: reduce) { .panel, button, .ring .left { transition: none; } }
  `;
  const svgNs = "http://www.w3.org/2000/svg";
  function svg(className, viewBox, children) {
    const node = document.createElementNS(svgNs, "svg");
    node.setAttribute("viewBox", viewBox);
    if (className) node.setAttribute("class", className);
    node.setAttribute("aria-hidden", "true");
    for (const [tag, attributes] of children) {
      const child = document.createElementNS(svgNs, tag);
      for (const [name, value] of Object.entries(attributes)) child.setAttribute(name, value);
      node.append(child);
    }
    return node;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const RING_LENGTH = 2 * Math.PI * 22;
  const panel = element("div", "panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Sleep timer");
  const ring = element("div", "ring");
  const ringSvg = svg(null, "0 0 52 52", [
    ["circle", { class: "track", cx: "26", cy: "26", r: "22" }],
    ["circle", { class: "left", cx: "26", cy: "26", r: "22", "stroke-dasharray": String(RING_LENGTH), "stroke-dashoffset": String(RING_LENGTH) }]
  ]);
  const ringLeft = ringSvg.querySelector(".left");
  const moon = svg("moon", "0 0 24 24", [["path", { d: "M12.34 2.02C6.59 1.82 2 6.42 2 12c0 5.52 4.48 10 10 10 3.71 0 6.93-2.02 8.66-5.02-7.51-.25-12.09-8.43-8.32-14.96z" }]]);
  const ringCount = element("span", "count");
  ring.append(ringSvg, moon, ringCount);
  const texts = element("div", "texts");
  const title = element("p", "title", "Sleep timer");
  const status = element("p", "status");
  texts.append(title, status);
  const head = element("div", "head");
  head.append(ring, texts);

  const grid = element("div", "grid");
  const choiceButtons = CHOICES.map(minutes => {
    const button = element("button", "choice");
    button.type = "button";
    if (minutes < 60) {
      button.append(String(minutes), element("small", null, "min"));
    } else {
      button.append(String(minutes / 60).replace(".5", "½"), element("small", null, minutes === 60 ? "hour" : "hours"));
    }
    button.title = humanizeMinutes(minutes);
    button.onclick = () => setSleepTimer({ mode: "minutes", minutes, endsAt: Date.now() + minutes * 60 * 1000 });
    grid.append(button);
    return button;
  });
  const songButton = element("button", "song");
  songButton.type = "button";
  songButton.append(
    svg(null, "0 0 24 24", [["path", { d: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" }]]),
    "End of this song"
  );
  songButton.onclick = () => setSleepTimer({ mode: "song" });
  grid.append(songButton);

  const actions = element("div", "actions");
  const moreButton = element("button", "more", "+5 min");
  moreButton.type = "button";
  moreButton.onclick = () => {
    if (sleepTimer?.mode !== "minutes") return;
    sleepTimer.endsAt += 5 * 60 * 1000;
    sleepTimer.minutes += 5;
    renderSleepTimer();
  };
  const offButton = element("button", "off", "Turn off");
  offButton.type = "button";
  offButton.onclick = () => setSleepTimer(null);
  actions.append(moreButton, offButton);

  panel.append(head, grid, actions);
  panelRoot.append(panelStyle, panel);

  function renderSleepTimer() {
    const active = !!sleepTimer;
    sleepTimerButton.classList.toggle("active", active);
    let fraction = 0;
    status.replaceChildren();
    if (!sleepTimer) {
      status.append("Pause the music after a while");
      sleepTimerButton.setAttribute("title", "Sleep timer off");
    } else if (sleepTimer.mode === "minutes") {
      const remaining = sleepTimer.endsAt - Date.now();
      fraction = remaining / (sleepTimer.minutes * 60 * 1000);
      const at = new Date(sleepTimer.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      status.append(element("b", null, formatCountdown(remaining)), ` left · pauses at ${at}`);
      sleepTimerButton.setAttribute("title", `Sleep timer: ${formatCountdown(remaining)} left`);
    } else {
      const duration = playerApi.getDuration();
      const left = duration > 0 ? (duration - playerApi.getCurrentTime()) * 1000 : 0;
      fraction = duration > 0 ? left / (duration * 1000) : 1;
      status.append("Pauses after this song · ", element("b", null, formatCountdown(left)));
      sleepTimerButton.setAttribute("title", "Sleep timer: pauses after this song");
    }
    ringLeft.setAttribute("stroke-dashoffset", String(RING_LENGTH * (1 - Math.max(0, Math.min(1, fraction)))));
    moon.style.display = active ? "none" : "";
    // Minutes left in the ring (a note for "end of this song")
    ringCount.textContent = !sleepTimer ? "" : sleepTimer.mode === "song" ? "♪" : String(Math.max(1, Math.ceil((sleepTimer.endsAt - Date.now()) / 60000)));
    choiceButtons.forEach((button, index) => button.classList.toggle("selected", sleepTimer?.mode === "minutes" && sleepTimer.minutes === CHOICES[index]));
    songButton.classList.toggle("selected", sleepTimer?.mode === "song");
    actions.classList.toggle("hidden", !active);
    moreButton.classList.toggle("hidden", sleepTimer?.mode !== "minutes");
  }

  function placePanel() {
    const rect = sleepTimerButton.getBoundingClientRect();
    const width = 312;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.bottom = `${Math.round(window.innerHeight - rect.top + 10)}px`;
  }

  let panelOpen = false;
  let panelTimer = null;
  function openPanel() {
    if (!panelHost.isConnected) document.body.append(panelHost);
    panelOpen = true;
    placePanel();
    renderSleepTimer();
    clearInterval(panelTimer);
    panelTimer = setInterval(renderSleepTimer, 1000);
    requestAnimationFrame(() => panel.classList.add("open"));
    window.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("keydown", onPanelKey, true);
    window.addEventListener("resize", placePanel);
  }
  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    panel.classList.remove("open");
    clearInterval(panelTimer);
    window.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("keydown", onPanelKey, true);
    window.removeEventListener("resize", placePanel);
  }
  function onOutside(event) {
    const path = event.composedPath();
    if (path.includes(panelHost) || path.includes(sleepTimerButton)) return;
    closePanel();
  }
  function onPanelKey(event) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    closePanel();
  }
  for (const button of [...choiceButtons, songButton]) button.addEventListener("click", closePanel);
  offButton.addEventListener("click", closePanel);

  sleepTimerButton.onclick = () => (panelOpen ? closePanel() : openPanel());
  renderSleepTimer();

  // Only redraw the buttons when the song's menu or the library state changed, not on every store action
  let lastMenu;
  let lastToggleStates;

  ytmStore.subscribe(() => {
    let state = ytmStore.getState();

    // Update library button for current data
    const currentMenu = document.querySelector("ytmusic-app-layout>ytmusic-player-bar").getMenuRenderer();
    const toggleStates = state.toggleStates.feedbackToggleStates;
    if (currentMenu === lastMenu && toggleStates === lastToggleStates) return;
    lastMenu = currentMenu;
    lastToggleStates = toggleStates;
    if (currentMenu) {
      if (playlistButton.classList.contains("hidden")) {
        playlistButton.classList.remove("hidden");
      }

      let foundLibraryButton = false;
      for (let i = 0; i < currentMenu.items.length; i++) {
        const item = currentMenu.items[i];
        if (item.toggleMenuServiceItemRenderer) {
          if (
            item.toggleMenuServiceItemRenderer.defaultIcon.iconType === "BOOKMARK_BORDER" ||
            item.toggleMenuServiceItemRenderer.defaultIcon.iconType === "BOOKMARK"
          ) {
            foundLibraryButton = true;
            libraryFeedbackDefaultToken = item.toggleMenuServiceItemRenderer.defaultServiceEndpoint.feedbackEndpoint.feedbackToken;
            libraryFeedbackToggledToken = item.toggleMenuServiceItemRenderer.toggledServiceEndpoint.feedbackEndpoint.feedbackToken;

            if (
              state.toggleStates.feedbackToggleStates[libraryFeedbackDefaultToken] !== undefined &&
              state.toggleStates.feedbackToggleStates[libraryFeedbackDefaultToken] !== null
            ) {
              libraryButtonData.toggled = state.toggleStates.feedbackToggleStates[libraryFeedbackDefaultToken];
              libraryButton.setters.data(libraryButtonData); 
            } else {
              libraryButtonData.toggled = false;
              libraryButton.setters.data(libraryButtonData); 
            }

            // Dev note 2/12/26: I think this if check got reversed the comments are probably outdated. Didn't bother investigating further to update comments
            if (item.toggleMenuServiceItemRenderer.defaultIcon.iconType === "BOOKMARK_BORDER") {
              // Default value is saved to library (false == remove from library, true == add to library)
              if (libraryButtonData.toggled) {
                libraryButton.setters.iconName("yt-sys-icons:library_saved");
              } else {
                libraryButton.setters.iconName("yt-sys-icons:library_add");
              }
            } else if (item.toggleMenuServiceItemRenderer.defaultIcon.iconType === "BOOKMARK") {
              // Default value is add to library (false == add to library, true == remove from library)
              if (libraryButtonData.toggled) {
                libraryButton.setters.iconName("yt-sys-icons:library_add");
              } else {
                libraryButton.setters.iconName("yt-sys-icons:library_saved");
              }
            }
            break;
          }
        }
      }

      if (!foundLibraryButton) {
        if (!libraryButton.classList.contains("hidden")) {
          libraryButton.classList.add("hidden");
        }
      } else {
        if (libraryButton.classList.contains("hidden")) {
          libraryButton.classList.remove("hidden");
        }
      }
    } else {
      if (!libraryButton.classList.contains("hidden")) {
        libraryButton.classList.add("hidden");
      }
      if (!playlistButton.classList.contains("hidden")) {
        playlistButton.classList.add("hidden");
      }
    }
  });

  ytmdControlButtons.libraryButton = libraryButton;
});
