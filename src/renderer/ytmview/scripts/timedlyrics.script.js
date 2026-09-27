/* eslint-disable @typescript-eslint/no-unused-expressions */
(function () {
  const ytmStore = window.__YTMD_HOOK__.ytmStore;

  const LYRICS_CONTENTS_SELECTOR = ".ytmusic-tab-renderer[page-type='MUSIC_PAGE_TYPE_TRACK_LYRICS'] > #contents";

  const lyricsContainer = document.createElement("div");
  lyricsContainer.classList.add("ytmd-lyrics");

  const lyricsSource = document.createElement("p");
  lyricsSource.classList.add("ytmd-lyrics-source");

  const lyricsNote = document.createElement("p");
  lyricsNote.classList.add("ytmd-lyrics-note");
  lyricsNote.innerText = "Synced lyrics";

  const returnToLiveContainer = document.createElement("div");
  returnToLiveContainer.classList.add("ytmd-lyrics-return-live-container");
  const returnToLive = document.createElement("yt-button-renderer");
  returnToLive.classList.add("ytmd-lyrics-return-live");
  returnToLive.data = {
    text: {
      runs: [
        {
          text: "Sync to video time"
        }
      ]
    },
    style: "STYLE_OVERLAY"
  };
  returnToLiveContainer.appendChild(returnToLive);

  let tabRenderer = null;
  let currentBrowseId = "";
  let fetchedBrowseId = "";
  let fetching = false;
  let currentLyrics = null;
  // YTM's own lyrics elements while ours are taking their place
  let ytmLyricsContents = null;
  // A scroll we triggered ourselves, so the scroll handler doesn't mistake it for the user scrolling away
  let autoScrolling = false;
  let autoScrollPaused = false;
  let viewingLyricsTab = false;
  let currentVideoId = null;
  // The song the current lyrics were fetched for
  let lyricsVideoId = null;
  const playerApi = window.__YTMD_HOOK__.ytmPlayerBar.playerApi;

  // The line being sung goes to the app (mini player). Between two lines the last one stays.
  let lastSentLine;
  function sendLine(text) {
    if (text === lastSentLine) return;
    lastSentLine = text;
    if (typeof window.ytmd?.sendLyricsLine === "function") window.ytmd.sendLyricsLine(text);
  }

  // ── Fullscreen lyrics ────────────────────────────────────────────────────────────────────────────────
  // A layer over YouTube Music, in a shadow root so the page's own styles can't reach it.
  const fullscreenHost = document.createElement("div");
  fullscreenHost.id = "ytmd-lyrics-fullscreen";
  const fullscreenRoot = fullscreenHost.attachShadow({ mode: "open" });
  // YouTube Music enforces Trusted Types: no HTML strings, the layer is built from elements
  const fsStyle = document.createElement("style");
  fsStyle.textContent = `
      :host { all: initial; }
      .overlay {
        position: fixed; inset: 0; z-index: 2147483000; display: flex; flex-direction: column; overflow: hidden;
        color: #fff; background: #000; font-family: "YouTube Sans", Roboto, "Segoe UI", sans-serif;
        opacity: 0; transition: opacity 220ms ease;
      }
      .overlay.visible { opacity: 1; }
      .backdrop {
        position: absolute; inset: -120px; background-size: cover; background-position: center;
        filter: blur(80px) saturate(1.5) brightness(0.5); transform: scale(1.15);
      }
      .shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.1), rgba(0,0,0,0.7)); }
      header { position: relative; display: flex; align-items: center; gap: 18px; padding: 28px 40px 8px; }
      .cover { width: 76px; height: 76px; flex-shrink: 0; border-radius: 10px; object-fit: cover; box-shadow: 0 12px 32px rgba(0,0,0,0.55); }
      .meta { min-width: 0; flex: 1; }
      .title, .artist { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .title { font-size: 22px; font-weight: 700; }
      .artist { margin-top: 4px; font-size: 15px; color: rgba(255,255,255,0.72); }
      button {
        font: inherit; color: inherit; border: 0; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
        padding: 9px 16px; border-radius: 999px; background: rgba(255,255,255,0.12); transition: background-color 150ms ease;
      }
      button:hover { background: rgba(255,255,255,0.22); }
      button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
      .icon {
        font-family: "Material Symbols Outlined"; font-size: 22px; line-height: 1; font-weight: normal; font-style: normal;
        letter-spacing: normal; text-transform: none; white-space: nowrap; direction: ltr; -webkit-font-smoothing: antialiased;
      }
      .close { width: 46px; height: 46px; padding: 0; justify-content: center; }
      .lines {
        position: relative; flex: 1; overflow-y: auto; padding: 36vh 40px; scrollbar-width: none; outline: none;
        -webkit-mask-image: linear-gradient(transparent, #000 16%, #000 84%, transparent);
      }
      .lines::-webkit-scrollbar { display: none; }
      .line {
        margin: 0 auto 28px; max-width: 1040px; font-size: clamp(26px, 3.4vw, 50px); font-weight: 700; line-height: 1.25;
        color: rgba(255,255,255,0.3); cursor: pointer; transform-origin: left center;
        transition: color 260ms ease, transform 260ms ease;
      }
      .line:hover { color: rgba(255,255,255,0.62); }
      .line.past { color: rgba(255,255,255,0.48); }
      .line.active { color: #fff; transform: scale(1.03); }
      .empty { position: absolute; top: 50%; left: 0; right: 0; margin: 0; text-align: center; font-size: 20px; color: rgba(255,255,255,0.78); }
      .resume { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); }
      .hidden { display: none !important; }
      @media (prefers-reduced-motion: reduce) { .overlay, .line { transition: none; } }
    `;
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function iconButton(className, icon, label, title) {
    const button = element("button", className);
    button.type = "button";
    if (title) button.title = title;
    button.append(element("span", "icon", icon));
    if (label) button.append(label);
    return button;
  }
  const fsOverlayElement = element("div", "overlay");
  fsOverlayElement.setAttribute("role", "dialog");
  fsOverlayElement.setAttribute("aria-label", "Fullscreen lyrics");
  const fsHeader = element("header");
  const fsCoverElement = element("img", "cover");
  fsCoverElement.alt = "";
  const fsMeta = element("div", "meta");
  fsMeta.append(element("p", "title"), element("p", "artist"));
  const fsCloseButton = iconButton("close", "close", null, "Close (Esc)");
  fsCloseButton.setAttribute("aria-label", "Close fullscreen lyrics");
  fsHeader.append(fsCoverElement, fsMeta, fsCloseButton);
  const fsLinesElement = element("div", "lines");
  fsLinesElement.tabIndex = -1;
  fsOverlayElement.append(
    element("div", "backdrop"),
    element("div", "shade"),
    fsHeader,
    fsLinesElement,
    element("p", "empty hidden", "No synced lyrics for this song"),
    iconButton("resume hidden", "sync", "Back to the current line")
  );
  fullscreenRoot.append(fsStyle, fsOverlayElement);

  const fsOverlay = fullscreenRoot.querySelector(".overlay");
  const fsBackdrop = fullscreenRoot.querySelector(".backdrop");
  const fsCover = fullscreenRoot.querySelector(".cover");
  const fsTitle = fullscreenRoot.querySelector(".title");
  const fsArtist = fullscreenRoot.querySelector(".artist");
  const fsLines = fullscreenRoot.querySelector(".lines");
  const fsEmpty = fullscreenRoot.querySelector(".empty");
  const fsResume = fullscreenRoot.querySelector(".resume");
  let fullscreenOpen = false;
  // Scrolling yourself pauses following the song for a moment
  let fsFollowPausedUntil = 0;
  let fsActiveIndex = -1;

  function largestThumbnail() {
    const thumbnails = playerApi.getPlayerResponse()?.videoDetails?.thumbnail?.thumbnails;
    if (!Array.isArray(thumbnails) || !thumbnails.length) return "";
    return [...thumbnails].sort((a, b) => b.width - a.width)[0].url;
  }

  function renderFullscreenHeader() {
    const details = playerApi.getPlayerResponse()?.videoDetails;
    fsTitle.textContent = details?.title ?? "";
    fsArtist.textContent = details?.author ?? "";
    const art = largestThumbnail();
    fsCover.src = art;
    fsCover.hidden = !art;
    fsBackdrop.style.backgroundImage = art ? `url("${art.replace(/"/g, "%22")}")` : "none";
  }

  function renderFullscreenLines() {
    fsActiveIndex = -1;
    if (!currentLyrics) {
      fsLines.replaceChildren();
      fsEmpty.classList.remove("hidden");
      fsResume.classList.add("hidden");
      return;
    }
    fsEmpty.classList.add("hidden");
    fsLines.replaceChildren(
      ...currentLyrics.lines.map(line => {
        const element = document.createElement("p");
        element.className = "line";
        element.textContent = line.lyricLine || "♪";
        element.dataset.start = line.cueRange.startTimeMilliseconds;
        element.dataset.end = line.cueRange.endTimeMilliseconds;
        element.onclick = () => {
          fsFollowPausedUntil = 0;
          fsResume.classList.add("hidden");
          playerApi.seekTo(parseInt(line.cueRange.startTimeMilliseconds, 10) / 1000);
        };
        return element;
      })
    );
    if (typeof playerApi.getCurrentTime === "function") syncFullscreen(playerApi.getCurrentTime() * 1000 + (window.__YTMD_TIMED_LYRICS_OFFSET_MS__ ?? 0), true);
  }

  function syncFullscreen(progressMs, instant) {
    const lines = fsLines.children;
    let active = -1;
    for (let index = 0; index < lines.length; index++) {
      const start = parseInt(lines[index].dataset.start, 10);
      const end = parseInt(lines[index].dataset.end, 10);
      if (progressMs >= start && progressMs < end) active = index;
      lines[index].classList.toggle("past", progressMs >= end);
      lines[index].classList.toggle("active", progressMs >= start && progressMs < end);
    }
    if (active === -1 || (active === fsActiveIndex && !instant)) return;
    fsActiveIndex = active;
    if (Date.now() < fsFollowPausedUntil) return;
    // Only the list scrolls - scrollIntoView would also move the layer itself and the page behind it
    const line = lines[active];
    fsLines.scrollTo({ top: line.offsetTop - fsLines.clientHeight / 2 + line.offsetHeight / 2, behavior: instant ? "instant" : "smooth" });
  }

  function pauseFollowing() {
    fsFollowPausedUntil = Date.now() + 6000;
    if (currentLyrics) fsResume.classList.remove("hidden");
  }
  fsLines.addEventListener("wheel", pauseFollowing, { passive: true });
  fsLines.addEventListener("touchmove", pauseFollowing, { passive: true });
  fsResume.onclick = () => {
    fsFollowPausedUntil = 0;
    fsResume.classList.add("hidden");
    fsActiveIndex = -1;
    if (typeof playerApi.getCurrentTime === "function") syncFullscreen(playerApi.getCurrentTime() * 1000 + (window.__YTMD_TIMED_LYRICS_OFFSET_MS__ ?? 0), true);
  };

  function onFullscreenKeydown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeFullscreen();
  }

  function openFullscreen() {
    if (fullscreenOpen) return;
    fullscreenOpen = true;
    if (!fullscreenHost.isConnected) document.body.appendChild(fullscreenHost);
    renderFullscreenHeader();
    renderFullscreenLines();
    window.addEventListener("keydown", onFullscreenKeydown, true);
    requestAnimationFrame(() => fsOverlay.classList.add("visible"));
    fsLines.focus({ preventScroll: true });
  }

  function closeFullscreen() {
    if (!fullscreenOpen) return;
    fullscreenOpen = false;
    fsOverlay.classList.remove("visible");
    window.removeEventListener("keydown", onFullscreenKeydown, true);
    setTimeout(() => {
      if (!fullscreenOpen) fullscreenHost.remove();
    }, 250);
  }

  fullscreenRoot.querySelector(".close").onclick = closeFullscreen;

  // A button for it in the player bar, next to the sleep timer
  const fullscreenButton = document.createElement("button");
  fullscreenButton.type = "button";
  fullscreenButton.classList.add("ytmd-player-bar-control", "ytmd-lyrics-fullscreen-button");
  fullscreenButton.title = "Fullscreen lyrics";
  fullscreenButton.setAttribute("aria-label", "Fullscreen lyrics");
  const fullscreenButtonIcon = document.createElement("span");
  fullscreenButtonIcon.classList.add("material-symbols-outlined");
  fullscreenButtonIcon.textContent = "lyrics";
  fullscreenButton.appendChild(fullscreenButtonIcon);
  fullscreenButton.onclick = () => (fullscreenOpen ? closeFullscreen() : openFullscreen());
  const rightControls = document.querySelector("ytmusic-app-layout>ytmusic-player-bar")?.querySelector(".right-controls-buttons");
  const anchor = rightControls?.querySelector(".sleep-timer-button") ?? rightControls?.querySelector(".shuffle");
  if (anchor) anchor.insertAdjacentElement("afterend", fullscreenButton);

  function enableAutoScroll() {
    autoScrollPaused = false;
    returnToLive.hidden = true;
  }

  function disableAutoScroll() {
    autoScrollPaused = true;
    returnToLive.hidden = false;
  }

  enableAutoScroll();

  function waitForElement(root, selector, timeoutMs) {
    return new Promise(resolve => {
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const element = root.querySelector(selector);
        if (!element) return;
        observer.disconnect();
        clearTimeout(timeout);
        resolve(element);
      });
      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);

      observer.observe(root, { childList: true, subtree: true });
    });
  }

  async function getTabRenderer() {
    if (tabRenderer && tabRenderer.isConnected) return tabRenderer;

    tabRenderer = await waitForElement(document.body, "#player-page #tab-renderer", 30000);
    if (tabRenderer && !tabRenderer.dataset.ytmdLyricsHooked) {
      tabRenderer.dataset.ytmdLyricsHooked = "true";
      tabRenderer.addEventListener("scroll", () => {
        if (!viewingLyricsTab || autoScrolling) return;
        disableAutoScroll();
      });
      tabRenderer.addEventListener("scrollend", () => {
        autoScrolling = false;
      });
    }
    return tabRenderer;
  }

  function scrollToActiveLine(behavior) {
    const activeLine = lyricsContainer.querySelector(".active");
    if (!activeLine) return;
    autoScrolling = true;
    activeLine.scrollIntoView({ behavior, block: "center", inline: "center" });
  }

  returnToLive.onClick = () => {
    enableAutoScroll();
    scrollToActiveLine("instant");
  };

  async function fetchTimedLyrics(browseId) {
    try {
      // This is an anonymous request to the same source the YouTube Music mobile app uses and could be broken by Google at any time
      const response = await fetch("/youtubei/v1/browse", {
        method: "POST",
        body: JSON.stringify({
          browseId,
          context: {
            client: {
              clientName: "ANDROID_MUSIC",
              clientVersion: "7.12.5"
            }
          }
        })
      });
      const json = await response.json();
      const lyricsData = json?.contents?.elementRenderer?.newElement?.type?.componentType?.model?.timedLyricsModel?.lyricsData;
      const lines = lyricsData?.timedLyricsData;
      if (!Array.isArray(lines) || lines.length === 0) return null;

      return { lines, source: lyricsData.sourceMessage ?? "" };
    } catch {
      return null;
    }
  }

  function renderLyrics(lyrics) {
    lyricsSource.innerText = lyrics.source;
    lyricsContainer.replaceChildren(
      ...lyrics.lines.map(line => {
        const lineElement = document.createElement("p");
        lineElement.innerText = line.lyricLine;
        lineElement.classList.add("ytmd-lyric-line");
        lineElement.setAttribute("data-start-ms", line.cueRange.startTimeMilliseconds);
        lineElement.setAttribute("data-end-ms", line.cueRange.endTimeMilliseconds);
        lineElement.onclick = () => {
          enableAutoScroll();
          window.__YTMD_HOOK__.ytmPlayerBar.playerApi.seekTo(parseInt(line.cueRange.startTimeMilliseconds, 10) / 1000);
        };
        return lineElement;
      })
    );
  }

  async function showTimedLyrics() {
    const renderer = await getTabRenderer();
    if (!renderer) return;

    const contents = await waitForElement(renderer, LYRICS_CONTENTS_SELECTOR, 10000);
    if (!contents || contents.firstChild === lyricsContainer) return;

    if (!ytmLyricsContents) ytmLyricsContents = Array.from(contents.children);
    contents.replaceChildren(lyricsContainer, lyricsSource, lyricsNote, returnToLiveContainer);
  }

  function restoreYtmLyrics() {
    if (!ytmLyricsContents) return;

    const contents = tabRenderer?.querySelector(LYRICS_CONTENTS_SELECTOR);
    if (contents) contents.replaceChildren(...ytmLyricsContents);
    ytmLyricsContents = null;
  }

  function updateActiveLine(progress) {
    if (!currentLyrics) return;

    // A positive offset highlights each line earlier, for when the lyrics run behind the song
    const progressMs = progress * 1000 + (window.__YTMD_TIMED_LYRICS_OFFSET_MS__ ?? 0);

    if (window.__YTMD_TIMED_LYRICS_ENABLED__ !== false) {
      const line = currentLyrics.lines.find(
        entry => progressMs >= parseInt(entry.cueRange.startTimeMilliseconds, 10) && progressMs < parseInt(entry.cueRange.endTimeMilliseconds, 10)
      );
      if (line && line.lyricLine) sendLine(line.lyricLine);
    }
    if (fullscreenOpen) syncFullscreen(progressMs, false);
    for (const lineElement of lyricsContainer.children) {
      const start = parseInt(lineElement.getAttribute("data-start-ms"), 10);
      const end = parseInt(lineElement.getAttribute("data-end-ms"), 10);
      const active = progressMs >= start && progressMs < end;
      if (active === lineElement.classList.contains("active")) continue;

      lineElement.classList.toggle("active", active);
      if (active && viewingLyricsTab && !autoScrollPaused) scrollToActiveLine("smooth");
    }
  }

  // The store changes constantly; lyrics only care about the player page, the song and the setting
  let lastApplied = null;

  async function applyCurrentState(force) {
    const state = ytmStore.getState();
    const playerPage = state.playerPage;
    if (!playerPage || !playerPage.playerPageTabs) return;

    const enabledNow = window.__YTMD_TIMED_LYRICS_ENABLED__ !== false;
    const playerResponse = state.player?.playerResponse;
    if (
      !force &&
      lastApplied &&
      lastApplied.playerPage === playerPage &&
      lastApplied.playerResponse === playerResponse &&
      lastApplied.enabled === enabledNow &&
      !fetching
    ) {
      return;
    }
    lastApplied = { playerPage, playerResponse, enabled: enabledNow };

    const playingVideoId = playerResponse?.videoDetails?.videoId ?? null;
    // The player page (with its lyrics tab) and the player load separately: for a moment one of them can
    // still belong to the previous song
    const pageVideoId = playerPage.playerPageWatchNextResponse?.currentVideoEndpoint?.watchEndpoint?.videoId ?? playingVideoId;

    // Lyrics of another song must never run against this one - also when this song has no lyrics tab at all
    if (currentLyrics && lyricsVideoId !== playingVideoId) {
      currentLyrics = null;
      lyricsContainer.replaceChildren();
      restoreYtmLyrics();
      if (fullscreenOpen) renderFullscreenLines();
    }
    if (playingVideoId !== currentVideoId) {
      currentVideoId = playingVideoId;
      sendLine(null);
      if (fullscreenOpen) {
        renderFullscreenHeader();
        renderFullscreenLines();
      }
    }
    if (!enabledNow) sendLine(null);
    if (pageVideoId !== playingVideoId) return;

    const lyricsTabIndex = playerPage.playerPageTabs.findIndex(tab => tab.tabRenderer?.endpoint?.browseEndpoint?.browseId?.startsWith("MPLY"));
    if (lyricsTabIndex === -1) return;

    const enabled = window.__YTMD_TIMED_LYRICS_ENABLED__ !== false;
    const browseId = playerPage.playerPageTabs[lyricsTabIndex].tabRenderer.endpoint.browseEndpoint.browseId;
    // Music videos keep YTM's own lyrics, their timing doesn't match the video
    const isMusicVideo = state.player?.playerResponse?.videoDetails?.musicVideoType === "MUSIC_VIDEO_TYPE_OMV";

    if (browseId !== currentBrowseId) {
      currentBrowseId = browseId;
      currentLyrics = null;
      restoreYtmLyrics();
      enableAutoScroll();
    }

    if (enabled && !isMusicVideo && !fetching && fetchedBrowseId !== browseId) {
      fetching = true;
      fetchedBrowseId = browseId;
      lyricsVideoId = playingVideoId;
      currentLyrics = await fetchTimedLyrics(browseId);
      fetching = false;
      if (currentLyrics) renderLyrics(currentLyrics);
      if (fullscreenOpen) renderFullscreenLines();
      // The page may have changed while the request ran
      void applyCurrentState(true);
      return;
    }

    viewingLyricsTab = playerPage.playerPageTabSelectedIndex === lyricsTabIndex;
    if (!viewingLyricsTab) return;

    if (enabled && currentLyrics && !isMusicVideo) {
      await showTimedLyrics();
      scrollToActiveLine("instant");
    } else {
      restoreYtmLyrics();
    }
  }

  window.__YTMD_TIMED_LYRICS__ = {
    toggleFullscreen: () => (fullscreenOpen ? closeFullscreen() : openFullscreen()),
    setEnabled: enabled => {
      window.__YTMD_TIMED_LYRICS_ENABLED__ = enabled;
      // Allow a fetch for the current song again when the user turns the setting back on
      if (enabled) fetchedBrowseId = "";
      void applyCurrentState(true);
    },
    setOffsetMs: offsetMs => {
      window.__YTMD_TIMED_LYRICS_OFFSET_MS__ = offsetMs;
      // Re-evaluate right away instead of waiting for the next progress event
      const playerApi = window.__YTMD_HOOK__.ytmPlayerBar.playerApi;
      if (typeof playerApi.getCurrentTime === "function") updateActiveLine(playerApi.getCurrentTime());
    }
  };

  ytmStore.subscribe(() => {
    void applyCurrentState();
  });

  window.__YTMD_HOOK__.ytmPlayerBar.playerApi.addEventListener("onVideoProgress", updateActiveLine);

  void applyCurrentState();
});
