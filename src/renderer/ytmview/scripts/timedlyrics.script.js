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
  lyricsNote.innerText = "Synced lyrics provided by YTMDesktop";

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

    const progressMs = progress * 1000;
    for (const lineElement of lyricsContainer.children) {
      const start = parseInt(lineElement.getAttribute("data-start-ms"), 10);
      const end = parseInt(lineElement.getAttribute("data-end-ms"), 10);
      const active = progressMs >= start && progressMs < end;
      if (active === lineElement.classList.contains("active")) continue;

      lineElement.classList.toggle("active", active);
      if (active && viewingLyricsTab && !autoScrollPaused) scrollToActiveLine("smooth");
    }
  }

  async function applyCurrentState() {
    const state = ytmStore.getState();
    const playerPage = state.playerPage;
    if (!playerPage || !playerPage.playerPageTabs) return;

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
      currentLyrics = await fetchTimedLyrics(browseId);
      fetching = false;
      if (currentLyrics) renderLyrics(currentLyrics);
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
    setEnabled: enabled => {
      window.__YTMD_TIMED_LYRICS_ENABLED__ = enabled;
      // Allow a fetch for the current song again when the user turns the setting back on
      if (enabled) fetchedBrowseId = "";
      void applyCurrentState();
    }
  };

  ytmStore.subscribe(() => {
    void applyCurrentState();
  });

  window.__YTMD_HOOK__.ytmPlayerBar.playerApi.addEventListener("onVideoProgress", updateActiveLine);

  void applyCurrentState();
});
