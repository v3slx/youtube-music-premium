/* eslint-disable @typescript-eslint/no-unused-expressions */
(function () {
  const ytmStore = window.__YTMD_HOOK__.ytmStore;
  const playerApi = window.__YTMD_HOOK__.ytmPlayerBar.playerApi;

  const LYRICS_CONTENTS_SELECTOR = ".ytmusic-tab-renderer[page-type='MUSIC_PAGE_TYPE_TRACK_LYRICS'] > #contents";
  // A pause between two lines this long shows the three dots
  const INTERLUDE_MIN_MS = 4500;
  // Estimated singing speed for lines that have no times per word
  const ESTIMATE_MS_PER_SYLLABLE = 270;
  // How long the other sources may take before the first lyrics show
  const COMMUNITY_WAIT_MS = 1800;
  // A better source that arrives later only takes over near the start of the song
  const LATE_SWITCH_BEFORE_MS = 20000;
  const REMEMBERED_SOURCES_KEY = "ytmd-lyrics-sources";

  const options = Object.assign(
    { enabled: true, offsetMs: 0, communitySources: true, wordAnimation: true },
    window.__YTMD_LYRICS_OPTIONS__ ?? {}
  );

  // ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────
  // YouTube Music enforces Trusted Types: no HTML strings anywhere, everything is built from elements
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Filled icons drawn as SVG: YouTube Music only loads its icon font in the thinnest weight
  const ICONS = {
    close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    sync: "M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z",
    play_arrow: "M8 5.14v13.72a1 1 0 0 0 1.52.85l10.29-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z",
    pause: "M7 5h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm7 0h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
    skip_previous: "M7 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1zm11 .87v10.26a1 1 0 0 1-1.55.83L9.2 12.83a1 1 0 0 1 0-1.66l7.25-5.13A1 1 0 0 1 18 6.87z",
    skip_next: "M17 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1zM6 6.87v10.26a1 1 0 0 0 1.55.83l7.25-5.13a1 1 0 0 0 0-1.66L7.55 6.04A1 1 0 0 0 6 6.87z",
    volume_up: "M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
    volume_down: "M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z",
    volume_off: "M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z",
    fullscreen: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
    fullscreen_exit: "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
  };

  function svgIcon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICONS[name]);
    svg.append(path);
    return svg;
  }

  function iconButton(className, icon, label, title) {
    const button = element("button", className);
    button.type = "button";
    if (title) button.title = title;
    if (title && !label) button.setAttribute("aria-label", title.replace(/\s*\([^)]*\)$/, ""));
    button.append(svgIcon(icon));
    if (label) button.append(element("span", "label", label));
    return button;
  }

  function clamp01(value) {
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  const sourceLabels = { AMLL: "AMLL", LRCLIB: "LRCLIB", YouTube: "YouTube" };
  const sourceNames = { AMLL: "AMLL TTML DB", LRCLIB: "LRCLIB", YouTube: "YouTube Music" };

  function readRememberedSources() {
    try {
      return JSON.parse(localStorage.getItem(REMEMBERED_SOURCES_KEY) ?? "{}") ?? {};
    } catch {
      return {};
    }
  }

  function rememberSource(videoId, source) {
    try {
      const remembered = readRememberedSources();
      delete remembered[videoId];
      remembered[videoId] = source;
      const keys = Object.keys(remembered);
      for (const key of keys.slice(0, Math.max(0, keys.length - 300))) delete remembered[key];
      localStorage.setItem(REMEMBERED_SOURCES_KEY, JSON.stringify(remembered));
    } catch {
      // Storage full or blocked: the choice only lasts until the song changes
    }
  }

  // ── The clock ────────────────────────────────────────────────────────────────────────────────────────
  // The player's progress event only comes about four times a second, so the lyrics ask the player for the
  // exact position on every frame instead. Not the <video> element: with gapless playback YouTube Music keeps
  // one element running across songs, and its currentTime can be minutes ahead of the song.
  let video = null;
  function getVideo() {
    if (!video || !video.isConnected) {
      const found = document.querySelector("#movie_player video") ?? document.querySelector("video");
      if (found && found !== video) {
        video = found;
        for (const type of ["play", "playing", "pause", "seeked", "seeking", "ratechange", "loadedmetadata", "volumechange", "durationchange"]) video.addEventListener(type, onVideoEvent);
      }
    }
    return video;
  }

  function adShowing() {
    return !!document.querySelector("#movie_player.ad-showing");
  }

  function songPosition() {
    const seconds = typeof playerApi.getCurrentTime === "function" ? playerApi.getCurrentTime() : NaN;
    return Number.isFinite(seconds) ? seconds : (getVideo()?.currentTime ?? 0);
  }

  function songTimeMs() {
    return songPosition() * 1000 + options.offsetMs;
  }

  function isPlaying() {
    const current = getVideo();
    return !!current && !current.paused && !current.ended && !adShowing();
  }

  // ── Lyrics data ──────────────────────────────────────────────────────────────────────────────────────
  function countSyllables(word) {
    const groups = word.toLowerCase().match(/[aeiouyäöüàáâãåèéêëìíîïòóôõùúûüæœøı]+/g);
    return Math.max(1, groups ? groups.length : Math.ceil(word.trim().length / 4));
  }

  /** Spreads a line over its words by their syllables when the source only times whole lines */
  function estimateWords(line, nextStart) {
    const parts = line.text.match(/\S+\s*/g) ?? [line.text];
    const weights = parts.map(part => countSyllables(part) + 0.35);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const available = Math.max(400, Math.min(line.end, nextStart ?? line.end) - line.start);
    const sung = Math.min(available, total * ESTIMATE_MS_PER_SYLLABLE + 300);
    let time = line.start;
    return parts.map((text, index) => {
      const duration = (sung * weights[index]) / total;
      const word = { text, start: time, end: time + duration };
      time += duration;
      return word;
    });
  }

  /** Lines ready to show: words for every line (timed or estimated) and the pauses in between */
  function prepare(lyrics) {
    const lines = lyrics.lines
      .filter(line => line.text || line.background)
      .map(line => ({ ...line, words: line.words?.map(word => ({ ...word })) ?? null, background: line.background?.map(word => ({ ...word })) ?? null }))
      .sort((a, b) => a.start - b.start);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      line.estimated = !line.words;
      if (!line.words) line.words = line.text ? estimateWords(line, lines[index + 1]?.start) : [];
      line.index = index;
    }

    // The items of the list: lines, and three dots for every long pause (also before the first line)
    const items = [];
    let previousEnd = 0;
    for (const line of lines) {
      if (line.start - previousEnd >= INTERLUDE_MIN_MS) items.push({ type: "interlude", start: previousEnd + (items.length ? 400 : 0), end: line.start - 250 });
      line.itemIndex = items.length;
      items.push({ type: "line", line, start: line.start, end: line.end });
      previousEnd = Math.max(previousEnd, line.end);
    }
    return { source: lyrics.source, wordSynced: lyrics.wordSynced, lines, items };
  }

  function fromYouTube(lyricsData) {
    const lines = [];
    for (const entry of lyricsData.timedLyricsData ?? []) {
      const text = (entry.lyricLine ?? "").trim();
      if (!text || text === "♪") continue;
      const start = parseInt(entry.cueRange?.startTimeMilliseconds, 10);
      const end = parseInt(entry.cueRange?.endTimeMilliseconds, 10);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      lines.push({ start, end: Math.max(end, start + 200), text, words: null, background: null, alternate: false });
    }
    return lines.length ? { source: "YouTube", wordSynced: false, lines, sourceMessage: lyricsData.sourceMessage ?? "" } : null;
  }

  async function fetchYouTubeLyrics(browseId) {
    try {
      // An anonymous request to the same source the YouTube Music mobile app uses; Google could change it any time
      const response = await fetch("/youtubei/v1/browse", {
        method: "POST",
        body: JSON.stringify({ browseId, context: { client: { clientName: "ANDROID_MUSIC", clientVersion: "7.12.5" } } })
      });
      const json = await response.json();
      const lyricsData = json?.contents?.elementRenderer?.newElement?.type?.componentType?.model?.timedLyricsModel?.lyricsData;
      return lyricsData ? fromYouTube(lyricsData) : null;
    } catch {
      return null;
    }
  }

  async function fetchCommunityLyrics(query) {
    if (!options.communitySources || typeof window.ytmd?.fetchLyrics !== "function") return [];
    try {
      const result = await window.ytmd.fetchLyrics(query);
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  }

  // ── The song ─────────────────────────────────────────────────────────────────────────────────────────
  const song = {
    videoId: null,
    isMusicVideo: false,
    title: "",
    artist: "",
    thumbnail: "",
    browseId: null,
    // undefined while loading, null when the source has nothing
    youtube: undefined,
    community: undefined,
    communityRequested: false,
    // What is shown
    lyrics: null,
    chosenByUser: false,
    shownAt: 0
  };

  function availableSources() {
    const list = [];
    if (song.community) list.push(...song.community.filter(entry => !song.isMusicVideo || entry.source === "LRCLIB"));
    if (song.youtube && !song.isMusicVideo) list.push(song.youtube);
    const order = { AMLL: 0, LRCLIB: 1, YouTube: 2 };
    // Word synced first, then the sources whose timing matched the songs best in tests
    return list.sort((a, b) => Number(b.wordSynced) - Number(a.wordSynced) || order[a.source] - order[b.source]);
  }

  function chooseLyrics() {
    if (!options.enabled) return setLyrics(null);
    const available = availableSources();
    const stillLoading = (song.youtube === undefined && song.browseId) || song.community === undefined;
    if (!available.length) {
      if (!stillLoading) setLyrics(null);
      return;
    }

    const remembered = readRememberedSources()[song.videoId];
    const showing = song.lyrics ? available.find(entry => entry.source === song.lyrics.source) : null;
    let pick = (remembered && available.find(entry => entry.source === remembered)) || available[0];
    if (remembered && pick.source === remembered) song.chosenByUser = true;

    if (showing && pick.source !== showing.source) {
      // Something is on screen already: only a user's choice or a clearly better source near the start replaces it
      const early = songTimeMs() < LATE_SWITCH_BEFORE_MS;
      const better = pick.wordSynced && !showing.wordSynced;
      if (!song.chosenByUser && !(early || better)) pick = showing;
    }
    // Wait a moment for the other sources before showing the first lyrics, so they don't swap right away
    if (!song.lyrics && stillLoading && !pick.wordSynced && Date.now() - song.shownAt < COMMUNITY_WAIT_MS) {
      setTimeout(chooseLyrics, COMMUNITY_WAIT_MS - (Date.now() - song.shownAt) + 20);
      return;
    }
    if (song.lyrics && song.lyrics.source === pick.source && song.lyrics.raw === pick) {
      renderSourceChoices();
      return;
    }
    setLyrics(pick);
  }

  function selectSource(source) {
    const pick = availableSources().find(entry => entry.source === source);
    if (!pick || song.lyrics?.source === source) return;
    song.chosenByUser = true;
    rememberSource(song.videoId, source);
    if (fullscreenOpen) beginSwitch();
    setLyrics(pick);
  }

  let current = null; // prepared lyrics on screen
  function setLyrics(lyrics) {
    song.lyrics = lyrics ? { source: lyrics.source, raw: lyrics } : null;
    current = lyrics ? prepare(lyrics) : null;
    if (current) current.sourceMessage = lyrics.sourceMessage ?? "";
    focusIndex = -2;
    activeLines.clear();
    activeItem = null;
    renderTab();
    if (fullscreenOpen) {
      // Lyrics that replace others on screen (a better source came in) swap with the same animation as a new song
      if (fsTrack.childElementCount && !fsOverlay.classList.contains("switching")) beginSwitch();
      renderFullscreen();
    }
    updateTabVisibility();
    tick(true);
    kick();
  }

  // ── Timing loop ──────────────────────────────────────────────────────────────────────────────────────
  let focusIndex = -2;
  const activeLines = new Set();
  let activeItem = null;
  let rafId = 0;
  let boundaryTimer = 0;

  function wordsVisible() {
    return fullscreenOpen || (viewingLyricsTab && tabShown && document.visibilityState === "visible");
  }

  function needsFrames() {
    return !!current && isPlaying() && wordsVisible();
  }

  function frame() {
    rafId = 0;
    tick(false);
    if (needsFrames()) rafId = requestAnimationFrame(frame);
  }

  function kick() {
    if (!rafId && needsFrames()) rafId = requestAnimationFrame(frame);
  }

  function onVideoEvent() {
    tick(false);
    kick();
    if (fullscreenOpen) {
      updatePlayState();
      updateVolume();
      updateProgress(true);
    }
  }

  /** Finds the last line that has started (binary search, the lines are sorted by start) */
  function lastStartedLine(time) {
    const lines = current.lines;
    let low = 0;
    let high = lines.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (lines[middle].start <= time) {
        found = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    return found;
  }

  function setWordProgress(word, progress) {
    const value = Math.round(progress * 1000) / 1000;
    if (word.progress === value) return;
    word.progress = value;
    for (const node of word.nodes ?? []) node.style.setProperty("--ytmd-p", value);
    if (word.long) {
      const glow = Math.round(Math.sin(Math.PI * value) * 1000) / 1000;
      for (const node of word.nodes ?? []) node.style.setProperty("--ytmd-g", glow);
    }
  }

  function tick(force) {
    clearTimeout(boundaryTimer);
    if (!current || adShowing()) return;
    const time = songTimeMs();
    const lines = current.lines;
    const started = lastStartedLine(time);

    // Lines being sung right now (duets and background vocals can overlap)
    const nowActive = new Set();
    for (let index = Math.max(0, started - 4); index <= started; index++) {
      if (time >= lines[index].start && time < lines[index].end) nowActive.add(index);
    }
    // Between two lines of a line-synced source the last one stays lit until the next starts
    if (!nowActive.size && started >= 0 && current.lines[started].estimated) {
      const next = lines[started + 1];
      if (!next || time < next.start) {
        const gap = (next ? next.start : Infinity) - lines[started].end;
        if (gap < INTERLUDE_MIN_MS) nowActive.add(started);
      }
    }

    for (const index of activeLines) {
      if (nowActive.has(index)) continue;
      activeLines.delete(index);
      const line = lines[index];
      for (const node of line.nodes ?? []) node.classList.remove("active");
      for (const word of line.words.concat(line.background ?? [])) setWordProgress(word, 1);
    }
    for (const index of nowActive) {
      if (activeLines.has(index)) continue;
      activeLines.add(index);
      for (const node of lines[index].nodes ?? []) node.classList.add("active");
    }

    // The words of the lines being sung fill up as they are sung
    if (wordsVisible() || force) {
      for (const index of activeLines) {
        const line = lines[index];
        for (const word of line.words.concat(line.background ?? [])) {
          const progress = options.wordAnimation ? clamp01((time - word.start) / Math.max(1, word.end - word.start)) : 1;
          setWordProgress(word, progress);
        }
      }
    }

    // The pause (three dots) that is running, if any
    let interlude = null;
    for (const item of current.items) {
      if (item.type === "interlude" && time >= item.start && time < item.end) interlude = item;
    }
    if (interlude !== activeItem) {
      if (activeItem?.nodes) for (const node of activeItem.nodes) node.classList.remove("active");
      activeItem = interlude;
      if (interlude?.nodes) for (const node of interlude.nodes) node.classList.add("active");
    }
    if (interlude?.dots) {
      const progress = clamp01((time - interlude.start) / (interlude.end - interlude.start));
      // Three dots per view (lyrics tab and fullscreen), filling one after the other
      interlude.dots.forEach((dot, index) => dot.style.setProperty("--ytmd-p", clamp01(progress * 3 - (index % 3)).toFixed(3)));
    }

    const focus = interlude ? current.items.indexOf(interlude) : itemIndexOfLine(Math.max(started, 0));
    if (focus !== focusIndex || force) {
      focusIndex = focus;
      onFocusChanged(force);
    }

    if (options.enabled) {
      const line = started >= 0 ? lines[started] : null;
      sendLine(interlude || !line ? (started >= 0 ? null : undefined) : line.text);
    }

    // Without frames (lyrics hidden, e.g. only the mini player open) the next line still starts on time
    if (!needsFrames() && isPlaying()) {
      const next = lines[started + 1];
      const boundaries = [next?.start, ...[...activeLines].map(index => lines[index].end)].filter(value => value > time);
      if (boundaries.length) {
        const rate = getVideo()?.playbackRate || 1;
        const wait = (Math.min(...boundaries) - time) / rate + 5;
        if (wait < 1500) boundaryTimer = setTimeout(() => tick(false), wait);
      }
    }
  }

  /** The elements of a list item: a line has them on the line, a pause on the item */
  function nodesOf(item) {
    return (item?.type === "line" ? item.line.nodes : item?.nodes) ?? [];
  }

  function resetActive() {
    if (current) {
      for (const index of activeLines) {
        const line = current.lines[index];
        for (const node of line?.nodes ?? []) node.classList.remove("active");
        for (const word of line ? line.words.concat(line.background ?? []) : []) setWordProgress(word, 1);
      }
    }
    for (const node of activeItem?.nodes ?? []) node.classList.remove("active");
    activeLines.clear();
    activeItem = null;
    focusIndex = -2;
  }

  function itemIndexOfLine(lineIndex) {
    return current?.lines[lineIndex]?.itemIndex ?? -1;
  }

  // The line being sung, for the mini player. Between two lines the last one stays, a pause clears it.
  let lastSentLine;
  function sendLine(text) {
    if (text === undefined || text === lastSentLine) return;
    lastSentLine = text;
    if (typeof window.ytmd?.sendLyricsLine === "function") window.ytmd.sendLyricsLine(text);
  }

  // ── Rendering a line ─────────────────────────────────────────────────────────────────────────────────
  /** Words that belong together (syllables of one word) stay on one row */
  function renderWords(container, words) {
    let group = null;
    for (const word of words) {
      if (!group) group = element("span", "ytmd-word-group");
      const text = word.text.replace(/\s+$/, "");
      const node = element("span", "ytmd-word", text);
      if (!word.nodes) word.nodes = [];
      word.nodes.push(node);
      word.long = word.end - word.start >= 1100 && text.length <= 14;
      if (word.long) node.classList.add("long");
      node.style.setProperty("--ytmd-p", "1");
      word.progress = 1;
      group.append(node);
      if (/\s$/.test(word.text)) {
        container.append(group, " ");
        group = null;
      }
    }
    if (group) container.append(group);
  }

  function renderLine(line, className, onClick) {
    const node = element("div", className);
    if (line.alternate) node.classList.add("alternate");
    const main = element("p", "ytmd-line-main");
    renderWords(main, line.words);
    node.append(main);
    if (line.background) {
      const background = element("p", "ytmd-line-background");
      renderWords(background, line.background);
      node.append(background);
    }
    node.onclick = onClick;
    if (!line.nodes) line.nodes = [];
    line.nodes.push(node);
    return node;
  }

  function seekToLine(line) {
    // Land just before the line starts, so its first word is heard
    playerApi.seekTo(Math.max(0, (line.start - options.offsetMs - 150) / 1000));
  }

  /** Drops the fullscreen elements from the lyrics, the lyrics tab keeps its own */
  function dropFullscreenNodes() {
    if (!current) return;
    const keep = node => !fsTrack.contains(node);
    for (const line of current.lines) {
      line.nodes = (line.nodes ?? []).filter(keep);
      for (const word of line.words.concat(line.background ?? [])) word.nodes = (word.nodes ?? []).filter(keep);
    }
    for (const item of current.items) {
      item.nodes = (item.nodes ?? []).filter(keep);
      item.dots = item.dots ? item.dots.filter(keep) : null;
    }
  }

  // Word fill styles shared by the lyrics tab and the fullscreen view
  const WORD_CSS = `
    .ytmd-word-group { white-space: nowrap; }
    .ytmd-word {
      display: inline-block;
      color: transparent;
      background-image: linear-gradient(90deg, var(--ytmd-lit) calc(var(--ytmd-p) * 135% - 35%), var(--ytmd-dim) calc(var(--ytmd-p) * 135%));
      -webkit-background-clip: text;
      background-clip: text;
      padding: 0.12em 0;
      margin: -0.12em 0;
      transform: translateY(calc((1 - var(--ytmd-p)) * 0.045em));
    }
    .ytmd-word.long {
      text-shadow: 0 0 calc(var(--ytmd-g, 0) * 0.45em) rgba(255, 255, 255, calc(var(--ytmd-g, 0) * 0.5));
      transform: translateY(calc((1 - var(--ytmd-p)) * 0.045em)) scale(calc(1 + var(--ytmd-g, 0) * 0.05));
    }
  `;

  // ── Lyrics tab (next to the player) ──────────────────────────────────────────────────────────────────
  const tabStyle = element("style");
  tabStyle.textContent = `
    ${WORD_CSS}
    .ytmd-lyrics { --ytmd-lit: #fff; --ytmd-dim: rgba(255, 255, 255, 0.4); margin-top: 16px; }
    .ytmd-lyrics .ytmd-lyric-line {
      margin-bottom: 18px; font-size: var(--ytmd-lyrics-font-size, 24px); font-weight: 700; line-height: 1.3; cursor: pointer;
      opacity: 0.4; transition: opacity 280ms ease;
    }
    .ytmd-lyrics .ytmd-lyric-line p { margin: 0; }
    .ytmd-lyrics .ytmd-lyric-line:hover { opacity: 0.7; }
    .ytmd-lyrics .ytmd-lyric-line.active { opacity: 1; }
    .ytmd-lyrics .ytmd-lyric-line.alternate { text-align: right; }
    .ytmd-lyrics .ytmd-line-background { font-size: 0.62em; margin-top: 4px !important; }
    .ytmd-lyrics .ytmd-interlude { height: 0; overflow: hidden; margin: 0; transition: height 300ms ease, margin 300ms ease; }
    .ytmd-lyrics .ytmd-interlude.active { height: 1.2em; margin-bottom: 18px; }
    .ytmd-lyrics-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 128px; color: rgba(255, 255, 255, 0.7); font-size: 14px; }
    .ytmd-lyrics-meta p { margin: 0; flex-basis: 100%; }
    .ytmd-lyrics-source-button {
      padding: 5px 12px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 999px; color: rgba(255, 255, 255, 0.8);
      background: transparent; font: inherit; font-size: 13px; cursor: pointer;
    }
    .ytmd-lyrics-source-button:hover { background: rgba(255, 255, 255, 0.1); }
    .ytmd-lyrics-source-button.selected { color: #000; background: #fff; border-color: #fff; }
    ${interludeCss(".ytmd-lyrics")}
    @media (prefers-reduced-motion: reduce) { .ytmd-lyrics .ytmd-lyric-line { transition: none; } }
  `;
  document.head.append(tabStyle);

  function interludeCss(scope) {
    return `
      ${scope} .ytmd-interlude { display: flex; gap: 0.35em; align-items: center; }
      ${scope} .ytmd-interlude-dots { display: inline-flex; gap: 0.32em; transform-origin: left center; }
      ${scope} .ytmd-interlude.active .ytmd-interlude-dots { animation: ytmd-breathe 2.4s ease-in-out infinite; }
      ${scope} .ytmd-dot {
        width: 0.34em; height: 0.34em; border-radius: 50%; background: #fff;
        opacity: calc(0.28 + var(--ytmd-p, 0) * 0.72); transform: scale(calc(0.78 + var(--ytmd-p, 0) * 0.22));
      }
      @keyframes ytmd-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.14); } }
    `;
  }

  const lyricsContainer = element("div", "ytmd-lyrics");
  const lyricsMeta = element("div", "ytmd-lyrics-meta");
  const returnToLiveContainer = element("div", "ytmd-lyrics-return-live-container");
  const returnToLive = document.createElement("yt-button-renderer");
  returnToLive.classList.add("ytmd-lyrics-return-live");
  returnToLive.data = { text: { runs: [{ text: "Sync to video time" }] }, style: "STYLE_OVERLAY" };
  returnToLiveContainer.appendChild(returnToLive);

  let tabRenderer = null;
  let ytmLyricsContents = null;
  let autoScrolling = false;
  let autoScrollPaused = false;
  let viewingLyricsTab = false;
  let tabShown = false;

  function enableAutoScroll() {
    autoScrollPaused = false;
    returnToLive.hidden = true;
  }

  function disableAutoScroll() {
    autoScrollPaused = true;
    returnToLive.hidden = false;
  }
  enableAutoScroll();

  returnToLive.onClick = () => {
    enableAutoScroll();
    scrollTabToFocus("instant");
  };

  function interludeNode(item, className) {
    const node = element("div", className);
    const dots = element("span", "ytmd-interlude-dots");
    const dotNodes = [element("span", "ytmd-dot"), element("span", "ytmd-dot"), element("span", "ytmd-dot")];
    dots.append(...dotNodes);
    node.append(dots);
    if (!item.nodes) item.nodes = [];
    item.nodes.push(node);
    item.dots = (item.dots ?? []).concat(dotNodes);
    return node;
  }

  function renderSourceChoices() {
    const sources = current ? availableSources() : [];
    const buttons = [];
    if (sources.length > 1) {
      for (const entry of sources) {
        const button = element("button", "ytmd-lyrics-source-button", sourceLabels[entry.source]);
        button.type = "button";
        button.title = `${sourceNames[entry.source]}${entry.wordSynced ? ", synced word by word" : ", synced line by line"}`;
        if (entry.source === current.source) button.classList.add("selected");
        button.onclick = () => selectSource(entry.source);
        buttons.push(button);
      }
    }
    const note = current
      ? current.source === "YouTube"
        ? current.sourceMessage || "Lyrics from YouTube Music"
        : `Lyrics from ${sourceNames[current.source]}${current.wordSynced ? ", synced word by word" : ""}`
      : "";
    lyricsMeta.replaceChildren(element("p", null, note), ...buttons);
    if (fullscreenOpen) renderFullscreenSources(sources);
  }

  function renderTab() {
    if (!current) {
      lyricsContainer.replaceChildren();
      lyricsMeta.replaceChildren();
      return;
    }
    const nodes = [];
    for (const item of current.items) {
      if (item.type === "interlude") nodes.push(interludeNode(item, "ytmd-lyric-line ytmd-interlude"));
      else
        nodes.push(
          renderLine(item.line, "ytmd-lyric-line", () => {
            enableAutoScroll();
            seekToLine(item.line);
          })
        );
    }
    lyricsContainer.replaceChildren(...nodes);
    renderSourceChoices();
  }

  function waitForElement(root, selector, timeoutMs) {
    return new Promise(resolve => {
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);
      const observer = new MutationObserver(() => {
        const found = root.querySelector(selector);
        if (!found) return;
        observer.disconnect();
        clearTimeout(timeout);
        resolve(found);
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

  function scrollTabToFocus(behavior) {
    if (!viewingLyricsTab || !tabShown || autoScrollPaused || !current) return;
    const node = nodesOf(current.items[focusIndex]).find(candidate => lyricsContainer.contains(candidate));
    if (!node) return;
    autoScrolling = true;
    node.scrollIntoView({ behavior, block: "center", inline: "center" });
  }

  async function showTabLyrics() {
    const renderer = await getTabRenderer();
    if (!renderer) return;
    const contents = await waitForElement(renderer, LYRICS_CONTENTS_SELECTOR, 10000);
    if (!contents) return;
    const inserted = contents.firstChild !== lyricsContainer;
    if (inserted) {
      if (!ytmLyricsContents) ytmLyricsContents = Array.from(contents.children);
      contents.replaceChildren(lyricsContainer, lyricsMeta, returnToLiveContainer);
    }
    const wasShown = tabShown;
    tabShown = true;
    if (inserted || !wasShown) scrollTabToFocus("instant");
    kick();
  }

  function restoreYtmLyrics() {
    tabShown = false;
    if (!ytmLyricsContents) return;
    const contents = tabRenderer?.querySelector(LYRICS_CONTENTS_SELECTOR);
    if (contents) contents.replaceChildren(...ytmLyricsContents);
    ytmLyricsContents = null;
  }

  function updateTabVisibility() {
    if (!viewingLyricsTab) return;
    if (current && options.enabled) void showTabLyrics();
    else restoreYtmLyrics();
  }

  // ── Fullscreen lyrics ────────────────────────────────────────────────────────────────────────────────
  // A layer over YouTube Music, in a shadow root so the page's own styles can't reach it
  const fullscreenHost = element("div");
  fullscreenHost.id = "ytmd-lyrics-fullscreen";
  const fullscreenRoot = fullscreenHost.attachShadow({ mode: "open" });
  const fsStyle = element("style");
  fsStyle.textContent = `
    :host { all: initial; }
    ${WORD_CSS}
    .overlay {
      --ytmd-lit: #fff; --ytmd-dim: rgba(255, 255, 255, 0.36);
      position: fixed; inset: 0; z-index: 2147483000; display: flex; flex-direction: column; overflow: hidden;
      color: #fff; background: #07070a; font-family: "YouTube Sans", Roboto, "Segoe UI", sans-serif;
      opacity: 0; transition: opacity 260ms ease;
    }
    .overlay.visible { opacity: 1; }
    /* Every song paints a new layer that fades in over the last one */
    .backdrops { position: absolute; inset: 0; overflow: hidden; }
    .backdrop-layer { position: absolute; inset: 0; opacity: 0; transition: opacity 1400ms ease; }
    .backdrop-layer.ready { opacity: 1; }
    .backdrop {
      position: absolute; left: 50%; top: 50%; width: 170vmax; height: 170vmax; margin: -85vmax 0 0 -85vmax;
      image-rendering: auto; animation: drift 80s linear infinite;
    }
    .backdrop.second { animation-duration: 110s; animation-direction: reverse; mix-blend-mode: screen; opacity: 0.55; }
    @keyframes drift { from { transform: rotate(0deg) scale(1.1); } 50% { transform: rotate(180deg) scale(1.25); } to { transform: rotate(360deg) scale(1.1); } }
    .shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 45%, rgba(0,0,0,0.05), rgba(0,0,0,0.55)); }
    header { position: relative; z-index: 2; display: flex; align-items: center; gap: 18px; padding: 26px 40px 6px; }
    .cover {
      width: 72px; height: 72px; flex-shrink: 0; border-radius: 10px; object-fit: cover; box-shadow: 0 14px 34px rgba(0,0,0,0.5);
      cursor: pointer; transition: transform 220ms ease, opacity 320ms ease;
    }
    .cover:hover { transform: scale(1.06); }
    .meta { min-width: 0; flex: 1; transition: opacity 320ms ease; }
    .overlay.cover-view header .cover, .overlay.cover-view header .meta,
    .overlay.no-lyrics header .cover, .overlay.no-lyrics header .meta { opacity: 0; pointer-events: none; }
    @keyframes swap-in { from { opacity: 0; transform: translateY(10px) scale(0.97); filter: blur(8px); } }
    .swap-in { animation: swap-in 720ms cubic-bezier(0.2, 0.9, 0.25, 1) backwards; }

    /* The large cover: left half next to the lyrics, or in the middle when a song has none */
    .stage {
      position: absolute; z-index: 1; left: 0; top: 0; bottom: 0; width: 50%; box-sizing: border-box;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 30px; padding: 100px 48px 150px;
      opacity: 0; pointer-events: none; transform: scale(0.94);
      transition: opacity 520ms ease, transform 760ms cubic-bezier(0.2, 0.9, 0.25, 1);
    }
    .overlay.cover-view .stage, .overlay.no-lyrics .stage { opacity: 1; pointer-events: auto; transform: none; }
    .overlay.no-lyrics .stage { width: 100%; }
    .art-box { position: relative; width: min(100%, 58vh, 580px); aspect-ratio: 1; transition: transform 700ms cubic-bezier(0.34, 1.35, 0.64, 1); }
    .overlay.paused .art-box { transform: scale(0.9); }
    .art-glow {
      position: absolute; left: -4%; top: 2%; width: 108%; height: 108%; border-radius: 50%;
      opacity: 0.55; filter: blur(56px); pointer-events: none;
    }
    .art {
      position: relative; display: block; width: 100%; height: 100%; border-radius: 14px; object-fit: cover; cursor: pointer;
      box-shadow: 0 30px 70px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.07); animation: float 10s ease-in-out infinite;
    }
    .overlay.paused .art { animation-play-state: paused; }
    @keyframes float { 0%, 100% { transform: translateY(0) rotate(-0.6deg); } 50% { transform: translateY(-12px) rotate(0.6deg) scale(1.012); } }
    .stage-text { max-width: 100%; text-align: center; }
    .stage-title, .stage-artist { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stage-title { margin: 0; font-size: clamp(20px, 2.1vw, 32px); font-weight: 800; line-height: 1.25; }
    .stage-artist { margin: 6px 0 0; font-size: clamp(15px, 1.35vw, 20px); color: rgba(255, 255, 255, 0.72); }
    .stage-note { display: none; margin: 16px 0 0; font-size: 14px; color: rgba(255, 255, 255, 0.55); }
    .overlay.no-lyrics .stage-note { display: block; }
    .overlay.cover-view .viewport { margin-left: 46%; }
    .overlay.cover-view .track { padding: 0 56px 0 16px; }
    .overlay.cover-view .line, .overlay.cover-view .interlude { font-size: clamp(24px, 2.6vw, 50px); }
    .overlay.no-lyrics .viewport { visibility: hidden; }

    /* Between two songs: the old lyrics drift up and away, the new ones come in from below */
    .overlay.switching .track {
      opacity: 0; transform: translateY(-36px); filter: blur(6px);
      transition: opacity 380ms ease, transform 480ms cubic-bezier(0.4, 0, 0.2, 1), filter 380ms ease;
    }
    .track.relayout { opacity: 0; transition: opacity 180ms ease; }
    @keyframes line-in { from { opacity: 0; translate: 0 46px; filter: blur(8px); } }
    .track.entering .item { animation: line-in 780ms cubic-bezier(0.2, 0.9, 0.25, 1) backwards; animation-delay: calc(var(--i, 0) * 55ms); }
    .loading {
      position: absolute; z-index: 1; left: 50%; top: 46%; display: flex; gap: 10px; transform: translateX(-50%);
      opacity: 0; pointer-events: none; transition: opacity 300ms ease;
    }
    .overlay.cover-view .loading { left: 73%; }
    .overlay.switching .loading { opacity: 1; transition-delay: 700ms; }
    .loading span { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.75); animation: pulse 1.2s ease-in-out infinite; }
    .loading span:nth-child(2) { animation-delay: 0.15s; }
    .loading span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes pulse { 0%, 100% { opacity: 0.25; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
    .title, .artist { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .title { font-size: 21px; font-weight: 700; }
    .artist { margin-top: 3px; font-size: 15px; color: rgba(255,255,255,0.72); }
    .sources { display: flex; gap: 6px; align-items: center; }
    .source {
      padding: 6px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 600; letter-spacing: 0.01em;
      background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.78);
    }
    .source.selected { background: rgba(255,255,255,0.92); color: #111; }
    .source-note { font-size: 12px; color: rgba(255,255,255,0.6); margin-right: 4px; white-space: nowrap; }
    button {
      font: inherit; color: inherit; border: 0; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
      padding: 9px 16px; border-radius: 999px; background: rgba(255,255,255,0.12); transition: background-color 150ms ease, color 150ms ease;
    }
    button:hover { background: rgba(255,255,255,0.22); }
    button.selected:hover { background: #fff; }
    button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    .icon { display: block; flex-shrink: 0; width: 1em; height: 1em; font-size: 22px; fill: currentColor; }
    .close { width: 46px; height: 46px; padding: 0; justify-content: center; }
    .viewport {
      position: relative; z-index: 1; flex: 1; overflow: hidden; outline: none;
      -webkit-mask-image: linear-gradient(transparent, #000 13%, #000 74%, transparent 97%);
    }
    .track { position: absolute; left: 0; right: 0; top: 0; padding: 0 max(40px, calc((100% - 1180px) / 2)); --y: 0px; }
    .item {
      transform: translateY(var(--y)); transition: transform 820ms cubic-bezier(0.2, 0.9, 0.25, 1), opacity 420ms ease, filter 520ms ease;
      transition-delay: var(--delay, 0ms);
    }
    .line {
      margin: 0 0 30px; font-size: clamp(28px, 3.4vw, 60px); font-weight: 800; line-height: 1.22; letter-spacing: -0.01em;
      cursor: pointer; opacity: 0.36; filter: blur(var(--blur, 0px)); transform-origin: left center;
    }
    .line p { margin: 0; }
    .line.alternate { text-align: right; transform-origin: right center; }
    .line .ytmd-line-background { font-size: 0.6em; font-weight: 700; margin-top: 6px; }
    .overlay:not(.idle) .line:hover { opacity: 0.6; filter: none; }
    .line.active { opacity: 1; filter: none; }
    .interlude { height: 0; margin: 0; opacity: 0; font-size: clamp(28px, 3.4vw, 60px); transition-property: transform, opacity, height, margin; }
    .interlude.active { height: 0.6em; margin: 0 0 34px; opacity: 1; }
    ${interludeCss(".track")}
    .track.manual .item { transition: none; filter: none; }
    .resume { position: absolute; z-index: 3; left: 50%; bottom: 150px; transform: translateX(-50%); background: rgba(20,20,24,0.72); backdrop-filter: blur(12px); }
    /* Everything you can click fades out while the mouse rests, is outside the app or the app is in the background */
    .hideable { transition: opacity 320ms ease, transform 320ms ease; }
    .overlay.idle, .overlay.idle .line { cursor: none; }
    .overlay.idle .hideable { opacity: 0; pointer-events: none; }
    .overlay.idle .controls { transform: translateY(14px); }
    .controls {
      position: absolute; z-index: 2; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; gap: 8px;
      padding: 0 max(40px, calc((100% - 1180px) / 2)) 24px;
    }
    .progress-row { display: flex; align-items: center; gap: 14px; }
    .time { min-width: 44px; font-size: 12.5px; font-variant-numeric: tabular-nums; color: rgba(255,255,255,0.8); text-shadow: 0 1px 10px rgba(0,0,0,0.55); }
    .transport button:not(.play), .right button { filter: drop-shadow(0 2px 10px rgba(0,0,0,0.35)); }
    .time.total { text-align: right; }
    .buttons-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; }
    .transport { display: flex; align-items: center; gap: 18px; }
    .transport button, .right button { width: 44px; height: 44px; padding: 0; justify-content: center; background: transparent; }
    .transport button:hover, .right button:hover { background: rgba(255,255,255,0.14); }
    .transport button:active, .right button:active { transform: scale(0.94); }
    .transport .icon { font-size: 30px; }
    .transport .play { width: 60px; height: 60px; color: #111; background: #fff; box-shadow: 0 8px 26px rgba(0,0,0,0.35); transition: transform 150ms ease; }
    .transport .play:hover { background: #fff; transform: scale(1.06); }
    .transport .play .icon { font-size: 30px; }
    .right { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
    .right .icon { font-size: 24px; }
    input[type="range"] { -webkit-appearance: none; appearance: none; height: 20px; margin: 0; background: transparent; cursor: pointer; --fill: 0%; }
    input[type="range"]::-webkit-slider-runnable-track {
      height: 4px; border-radius: 999px; background: linear-gradient(90deg, #fff var(--fill), rgba(255,255,255,0.26) var(--fill));
    }
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: #fff;
      box-shadow: 0 1px 6px rgba(0,0,0,0.45); opacity: 0; transition: opacity 150ms ease;
    }
    input[type="range"]:hover::-webkit-slider-thumb, input[type="range"]:active::-webkit-slider-thumb, input[type="range"]:focus-visible::-webkit-slider-thumb { opacity: 1; }
    input[type="range"]:focus-visible { outline: none; }
    input[type="range"]:focus-visible::-webkit-slider-runnable-track { box-shadow: 0 0 0 2px rgba(255,255,255,0.55); }
    .seek { flex: 1; }
    .volume { width: 112px; margin: 0 8px 0 2px; }
    .hidden { display: none !important; }
    @media (prefers-reduced-motion: reduce) {
      .overlay, .item, .backdrop, .backdrop-layer, .hideable, .stage, .art, .art-box, .swap-in, .track, .loading span { transition: none; animation: none; }
      .track.entering .item { animation: none; }
      .interlude.active .ytmd-interlude-dots { animation: none; }
    }
  `;
  const fsOverlay = element("div", "overlay");
  fsOverlay.setAttribute("role", "dialog");
  fsOverlay.setAttribute("aria-label", "Fullscreen lyrics");
  const fsBackdrops = element("div", "backdrops");
  const fsHeader = element("header");
  const fsCover = element("img", "cover");
  fsCover.alt = "";
  fsCover.title = "Show the cover (C)";
  // The large cover
  const fsStage = element("div", "stage");
  const fsArtBox = element("div", "art-box");
  const fsArtGlow = element("canvas", "art-glow");
  const fsArt = element("img", "art");
  fsArt.alt = "";
  fsArt.title = "Back to the lyrics (C)";
  fsArtBox.append(fsArtGlow, fsArt);
  const fsStageText = element("div", "stage-text");
  const fsStageTitle = element("p", "stage-title");
  const fsStageArtist = element("p", "stage-artist");
  const fsStageNote = element("p", "stage-note", "No synced lyrics for this song");
  fsStageText.append(fsStageTitle, fsStageArtist, fsStageNote);
  fsStage.append(fsArtBox, fsStageText);
  const fsLoading = element("div", "loading");
  fsLoading.append(element("span"), element("span"), element("span"));
  const fsMeta = element("div", "meta");
  const fsTitle = element("p", "title");
  const fsArtist = element("p", "artist");
  fsMeta.append(fsTitle, fsArtist);
  const fsSources = element("div", "sources hideable");
  const fsCloseButton = iconButton("close hideable", "close", null, "Close (Esc)");
  fsCloseButton.setAttribute("aria-label", "Close fullscreen lyrics");
  fsHeader.append(fsCover, fsMeta, fsSources, fsCloseButton);
  const fsViewport = element("div", "viewport");
  fsViewport.tabIndex = -1;
  const fsTrack = element("div", "track");
  fsViewport.append(fsTrack);
  const fsResume = iconButton("resume hidden", "sync", "Back to the current line");
  // Player controls at the bottom
  const fsControls = element("div", "controls hideable");
  const fsCurrentTime = element("span", "time", "0:00");
  const fsSeek = element("input", "seek");
  Object.assign(fsSeek, { type: "range", min: "0", max: "1000", step: "1", value: "0" });
  fsSeek.setAttribute("aria-label", "Song position");
  const fsTotalTime = element("span", "time total", "0:00");
  const fsProgressRow = element("div", "progress-row");
  fsProgressRow.append(fsCurrentTime, fsSeek, fsTotalTime);
  const fsPrevious = iconButton("previous", "skip_previous", null, "Previous");
  const fsPlay = iconButton("play", "play_arrow", null, "Play (Space)");
  const fsNext = iconButton("next", "skip_next", null, "Next");
  const fsTransport = element("div", "transport");
  fsTransport.append(fsPrevious, fsPlay, fsNext);
  const fsMute = iconButton("mute", "volume_up", null, "Mute (M)");
  const fsVolume = element("input", "volume");
  Object.assign(fsVolume, { type: "range", min: "0", max: "100", step: "1", value: "100" });
  fsVolume.setAttribute("aria-label", "Volume");
  const fsWindowFullscreen = iconButton("window-fullscreen", "fullscreen", null, "Full screen (F11)");
  const fsRight = element("div", "right");
  fsRight.append(fsMute, fsVolume, fsWindowFullscreen);
  const fsButtonsRow = element("div", "buttons-row");
  fsButtonsRow.append(element("div"), fsTransport, fsRight);
  fsControls.append(fsProgressRow, fsButtonsRow);

  fsOverlay.append(fsBackdrops, element("div", "shade"), fsStage, fsHeader, fsViewport, fsLoading, fsResume, fsControls);
  fullscreenRoot.append(fsStyle, fsOverlay);

  let fullscreenOpen = false;
  let manualOffset = 0;
  let manualUntil = 0;
  let manualTimer = 0;

  function currentDetails() {
    return ytmStore.getState().player?.playerResponse?.videoDetails ?? playerApi.getPlayerResponse()?.videoDetails;
  }

  function largestThumbnail(details) {
    const thumbnails = details?.thumbnail?.thumbnails;
    if (!Array.isArray(thumbnails) || !thumbnails.length) return "";
    // Google's album art comes in any size: ask for one sharp enough for the large cover
    return [...thumbnails].sort((a, b) => b.width - a.width)[0].url.replace(/=w\d+-h\d+/, "=w1200-h1200");
  }

  function restartAnimation(node) {
    node.classList.remove("swap-in");
    void node.offsetWidth;
    node.classList.add("swap-in");
  }

  /** The album art, blurred on a tiny canvas and scaled up: a soft moving background that costs almost nothing */
  function paintBackdrop(image) {
    const seconds = performance.now() / 1000;
    const paint = (className, flip, filter, period) => {
      const canvas = element("canvas", className);
      canvas.width = 40;
      canvas.height = 40;
      const context = canvas.getContext("2d");
      context.filter = filter;
      if (flip) {
        context.translate(40, 0);
        context.scale(-1, 1);
      }
      context.drawImage(image, -6, -6, 52, 52);
      // The slow rotation carries on where the previous layer was
      if (period) canvas.style.animationDelay = `-${(seconds % period).toFixed(2)}s`;
      return canvas;
    };
    const layer = element("div", "backdrop-layer");
    layer.append(paint("backdrop", false, "blur(3px) saturate(1.6) brightness(0.62)", 80), paint("backdrop second", true, "blur(3px) saturate(1.6) brightness(0.62)", 110));
    fsBackdrops.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("ready")));
    setTimeout(() => {
      while (layer.previousElementSibling) layer.previousElementSibling.remove();
    }, 1500);

    // The glow behind the large cover, in the cover's own colours
    const glow = fsArtGlow.getContext("2d");
    fsArtGlow.width = 40;
    fsArtGlow.height = 40;
    glow.filter = "saturate(1.8)";
    glow.drawImage(image, 0, 0, 40, 40);
  }

  let headerVideoId;
  let artUrl = "";
  function setArt(url, animate) {
    if (url === artUrl) return;
    artUrl = url;
    if (!url) {
      fsCover.hidden = true;
      fsArt.removeAttribute("src");
      return;
    }
    // Swap once the new picture is there, so nothing flashes empty in between
    const image = new Image();
    image.onload = image.onerror = () => {
      if (artUrl !== url) return;
      fsCover.hidden = false;
      fsCover.src = url;
      fsArt.src = url;
      if (animate) {
        restartAnimation(fsCover);
        restartAnimation(fsArtBox);
      }
      if (image.naturalWidth) paintBackdrop(image);
    };
    image.src = url;
  }

  function renderFullscreenHeader() {
    const details = currentDetails();
    const videoId = details?.videoId ?? null;
    const changed = videoId !== headerVideoId;
    headerVideoId = videoId;
    fsTitle.textContent = fsStageTitle.textContent = details?.title ?? "";
    fsArtist.textContent = fsStageArtist.textContent = details?.author ?? "";
    if (changed) {
      restartAnimation(fsMeta);
      restartAnimation(fsStageText);
    }
    setArt(largestThumbnail(details), changed);
  }

  function renderFullscreenSources(sources) {
    const nodes = [];
    if (current) {
      nodes.push(element("span", "source-note", current.wordSynced ? "Word sync" : current.lines.some(line => line.estimated) ? "Line sync" : ""));
    }
    if (sources.length > 1) {
      for (const entry of sources) {
        const button = element("button", "source", sourceLabels[entry.source]);
        button.type = "button";
        button.title = `${sourceNames[entry.source]}${entry.wordSynced ? ", synced word by word" : ", synced line by line"}`;
        if (entry.source === current?.source) button.classList.add("selected");
        button.onclick = () => selectSource(entry.source);
        nodes.push(button);
      }
    } else if (current) {
      nodes.push(element("span", "source-note", sourceNames[current.source]));
    }
    fsSources.replaceChildren(...nodes);
  }

  const SWITCH_OUT_MS = 380;
  let switchStartedAt = -Infinity;
  let renderTimer = 0;
  let switchFallback = 0;
  let enterTimer = 0;

  function lyricsLoading() {
    return options.enabled && !!song.videoId && (song.community === undefined || (song.youtube === undefined && !!song.browseId));
  }

  /** Lets the lyrics on screen drift away; the next render brings the new ones in */
  function beginSwitch() {
    switchStartedAt = performance.now();
    clearTimeout(renderTimer);
    fsOverlay.classList.add("switching");
    fsResume.classList.add("hidden");
    clearTimeout(switchFallback);
    // Should nothing come at all, stop waiting after a while
    switchFallback = setTimeout(() => {
      if (fsOverlay.classList.contains("switching")) renderFullscreen(false, true);
    }, 9000);
  }

  function animateLinesIn() {
    const focusItem = Math.max(0, itemIndexOfLine(Math.max(lastStartedLine(songTimeMs()), 0)) - 2);
    for (const [index, item] of current.items.entries()) {
      const node = fullscreenNodeOf(item);
      if (node) node.style.setProperty("--i", String(Math.min(Math.max(index - focusItem, 0), 12)));
    }
    fsTrack.classList.remove("entering");
    void fsTrack.offsetWidth;
    fsTrack.classList.add("entering");
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => fsTrack.classList.remove("entering"), 1700);
  }

  function renderFullscreen(opening, giveUp) {
    clearTimeout(renderTimer);
    // The old lyrics get to finish drifting away first
    const wait = SWITCH_OUT_MS - (performance.now() - switchStartedAt);
    if (wait > 0) {
      renderTimer = setTimeout(() => renderFullscreen(opening, giveUp), wait);
      return;
    }
    renderFullscreenHeader();
    manualOffset = 0;
    fsTrack.classList.remove("manual");
    fsResume.classList.add("hidden");
    if (!current && lyricsLoading() && !giveUp) {
      // Still looking: the three dots show until the lyrics are there
      if (!fsOverlay.classList.contains("switching")) beginSwitch();
      fsTrack.replaceChildren();
      renderFullscreenSources([]);
      return;
    }
    const animateIn = opening === true || fsOverlay.classList.contains("switching");
    clearTimeout(switchFallback);
    fsOverlay.classList.remove("switching");
    fsOverlay.classList.toggle("no-lyrics", !current);
    if (!current) {
      fsStageNote.textContent = options.enabled ? "No synced lyrics for this song" : "Synced lyrics are turned off in Settings";
      fsTrack.replaceChildren();
      renderFullscreenSources([]);
      return;
    }
    dropFullscreenNodes();
    const nodes = current.items.map(item => {
      const node =
        item.type === "interlude"
          ? interludeNode(item, "item interlude ytmd-interlude")
          : renderLine(item.line, "item line", () => {
              leaveManualScroll();
              seekToLine(item.line);
            });
      return node;
    });
    fsTrack.replaceChildren(...nodes);
    renderFullscreenSources(availableSources());
    // The new elements start out plain; the next tick marks the lines being sung again
    resetActive();
    tick(true);
    if (animateIn) animateLinesIn();
  }

  // ── Large cover ──
  const COVER_VIEW_KEY = "ytmd-lyrics-cover-view";
  let coverView = false;
  try {
    coverView = localStorage.getItem(COVER_VIEW_KEY) === "1";
  } catch {
    // Storage blocked: starts with the lyrics every time
  }
  let relayoutTimer = 0;

  function setCoverView(on) {
    if (on === coverView) return;
    coverView = on;
    try {
      localStorage.setItem(COVER_VIEW_KEY, on ? "1" : "0");
    } catch {
      // Only remembered until the app closes
    }
    if (!fullscreenOpen) return;
    // The lyrics fade out, move to their new place and come back in
    fsTrack.classList.add("relayout");
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(() => {
      fsOverlay.classList.toggle("cover-view", coverView);
      layoutFullscreen(true);
      fsTrack.classList.remove("relayout");
      if (current) animateLinesIn();
    }, 190);
  }

  fsCover.onclick = () => setCoverView(!coverView);
  fsArt.onclick = () => setCoverView(!coverView);

  function fullscreenNodeOf(item) {
    return nodesOf(item).find(node => fsTrack.contains(node)) ?? null;
  }

  /** Moves the list so the current line sits a little above the middle; the lines below follow in a wave */
  function layoutFullscreen(instant) {
    if (!fullscreenOpen || !current) return;
    const focusItem = current.items[focusIndex] ?? current.items[0];
    const focusNode = fullscreenNodeOf(focusItem);
    if (!focusNode) return;
    const anchor = fsViewport.clientHeight * 0.36;
    const y = Math.round(anchor - (focusNode.offsetTop + focusNode.offsetHeight / 2)) - manualOffset;
    const focus = current.items.indexOf(focusItem);
    for (const [index, item] of current.items.entries()) {
      const node = fullscreenNodeOf(item);
      if (!node) continue;
      const distance = index - focus;
      node.style.setProperty("--delay", instant || distance < 0 ? "0ms" : `${Math.min(distance, 8) * 42}ms`);
      node.style.setProperty("--blur", `${Math.min(Math.abs(distance), 4) * 0.8}px`);
    }
    if (instant) {
      fsTrack.classList.add("manual");
      fsTrack.style.setProperty("--y", `${y}px`);
      void fsTrack.offsetHeight;
      if (Date.now() >= manualUntil) fsTrack.classList.remove("manual");
    } else {
      fsTrack.style.setProperty("--y", `${y}px`);
    }
  }

  function onFocusChanged(force) {
    if (fullscreenOpen && Date.now() >= manualUntil) layoutFullscreen(force);
    if (viewingLyricsTab) scrollTabToFocus(force ? "instant" : "smooth");
  }

  function leaveManualScroll() {
    manualUntil = 0;
    manualOffset = 0;
    clearTimeout(manualTimer);
    fsTrack.classList.remove("manual");
    fsResume.classList.add("hidden");
    layoutFullscreen(false);
  }

  // Scrolling yourself holds the list for a few seconds, then it goes back to the song
  fsViewport.addEventListener(
    "wheel",
    event => {
      if (!current) return;
      event.preventDefault();
      manualOffset += event.deltaY;
      manualUntil = Date.now() + 5000;
      fsTrack.classList.add("manual");
      fsResume.classList.remove("hidden");
      const focusNode = fullscreenNodeOf(current.items[focusIndex] ?? current.items[0]);
      const anchor = fsViewport.clientHeight * 0.36;
      const base = focusNode ? anchor - (focusNode.offsetTop + focusNode.offsetHeight / 2) : 0;
      // Not further than the first or last line
      manualOffset = Math.max(base - anchor, Math.min(manualOffset, base + fsTrack.scrollHeight - anchor));
      fsTrack.style.setProperty("--y", `${Math.round(base - manualOffset)}px`);
      clearTimeout(manualTimer);
      manualTimer = setTimeout(leaveManualScroll, 5000);
    },
    { passive: false }
  );
  fsResume.onclick = leaveManualScroll;

  // ── Player controls ──
  let seekingWithSlider = false;
  let changingVolume = false;
  let lastProgressUpdate = 0;
  let progressTimer = 0;

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = String(total % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
  }

  function songDuration() {
    const duration = typeof playerApi.getDuration === "function" ? playerApi.getDuration() : 0;
    return duration || 0;
  }

  function setFill(input, fraction) {
    input.style.setProperty("--fill", `${(clamp01(fraction) * 100).toFixed(2)}%`);
  }

  function setIcon(button, icon, title) {
    button.querySelector("path").setAttribute("d", ICONS[icon]);
    button.title = title;
    button.setAttribute("aria-label", title.replace(/\s*\([^)]*\)$/, ""));
  }

  function updateProgress(force) {
    if (!fullscreenOpen || seekingWithSlider) return;
    const now = performance.now();
    if (!force && (now - lastProgressUpdate < 200 || fsOverlay.classList.contains("idle"))) return;
    lastProgressUpdate = now;
    const duration = songDuration();
    const position = songPosition();
    fsCurrentTime.textContent = formatTime(position);
    fsTotalTime.textContent = formatTime(duration);
    const fraction = duration ? position / duration : 0;
    fsSeek.value = String(Math.round(fraction * 1000));
    setFill(fsSeek, fraction);
  }

  function updatePlayState() {
    const paused = getVideo()?.paused ?? true;
    setIcon(fsPlay, paused ? "play_arrow" : "pause", paused ? "Play (Space)" : "Pause (Space)");
    fsOverlay.classList.toggle("paused", paused);
  }

  function currentVolume() {
    return typeof playerApi.getVolume === "function" ? playerApi.getVolume() : Math.round((getVideo()?.volume ?? 1) * 100);
  }

  function isMuted() {
    return typeof playerApi.isMuted === "function" ? playerApi.isMuted() : !!getVideo()?.muted;
  }

  function updateVolume() {
    const volume = currentVolume();
    const muted = isMuted();
    if (!changingVolume) {
      fsVolume.value = String(muted ? 0 : volume);
      setFill(fsVolume, muted ? 0 : volume / 100);
    }
    setIcon(fsMute, muted || volume === 0 ? "volume_off" : volume < 50 ? "volume_down" : "volume_up", muted ? "Unmute (M)" : "Mute (M)");
  }

  // The same way the app's own volume commands do it, so YouTube Music's slider follows
  function setVolume(volume) {
    const value = Math.max(0, Math.min(100, Math.round(volume)));
    playerApi.setVolume(value);
    ytmStore.dispatch({ type: "SET_VOLUME", payload: value });
    if (value > 0 && isMuted()) {
      playerApi.unMute();
      ytmStore.dispatch({ type: "SET_MUTED", payload: false });
    }
    updateVolume();
  }

  function toggleMute() {
    const muted = isMuted();
    if (muted) playerApi.unMute();
    else playerApi.mute();
    ytmStore.dispatch({ type: "SET_MUTED", payload: !muted });
    updateVolume();
  }

  function togglePlay() {
    if (getVideo()?.paused) playerApi.playVideo();
    else playerApi.pauseVideo();
  }

  function seekBy(seconds) {
    const position = songPosition();
    playerApi.seekTo(Math.max(0, Math.min(songDuration() || Infinity, position + seconds)));
  }

  fsSeek.addEventListener("input", () => {
    seekingWithSlider = true;
    const fraction = Number(fsSeek.value) / 1000;
    fsCurrentTime.textContent = formatTime(fraction * songDuration());
    setFill(fsSeek, fraction);
  });
  fsSeek.addEventListener("change", () => {
    playerApi.seekTo((Number(fsSeek.value) / 1000) * songDuration());
    seekingWithSlider = false;
    updateProgress(true);
  });
  fsVolume.addEventListener("input", () => {
    changingVolume = true;
    setFill(fsVolume, Number(fsVolume.value) / 100);
    setVolume(Number(fsVolume.value));
  });
  fsVolume.addEventListener("change", () => {
    changingVolume = false;
    updateVolume();
  });
  fsPlay.onclick = togglePlay;
  fsPrevious.onclick = () => playerApi.previousVideo();
  fsNext.onclick = () => playerApi.nextVideo();
  fsMute.onclick = toggleMute;

  // ── Real full screen (F11) ──
  // The app window fills the screen without its title bar. The page's own fullscreen API is left alone on purpose:
  // it would also put YouTube Music's player into its fullscreen mode underneath the lyrics.
  let windowFullscreen = false;
  function showWindowFullscreen(active) {
    windowFullscreen = active;
    setIcon(fsWindowFullscreen, active ? "fullscreen_exit" : "fullscreen", active ? "Exit full screen (F11)" : "Full screen (F11)");
  }
  function setWindowFullscreen(active) {
    if (typeof window.ytmd?.setWindowFullscreen === "function") window.ytmd.setWindowFullscreen(active);
  }
  function toggleWindowFullscreen() {
    setWindowFullscreen(!windowFullscreen);
  }
  fsWindowFullscreen.onclick = toggleWindowFullscreen;
  if (typeof window.ytmd?.onWindowFullscreenChanged === "function") window.ytmd.onWindowFullscreenChanged(showWindowFullscreen);
  if (typeof window.ytmd?.isWindowFullscreen === "function") void window.ytmd.isWindowFullscreen().then(showWindowFullscreen, () => {});

  // ── Controls that get out of the way ──
  const IDLE_AFTER_MS = 2600;
  let idleTimer = 0;
  let pointerOnControls = false;
  let pointerDown = false;
  let lastPointer = "";

  function controlsHaveKeyboardFocus() {
    const focused = fullscreenRoot.activeElement;
    return !!focused && focused.matches(":focus-visible") && (fsControls.contains(focused) || fsHeader.contains(focused));
  }

  function showControls() {
    if (!fullscreenOpen) return;
    if (fsOverlay.classList.contains("idle")) {
      fsOverlay.classList.remove("idle");
      updatePlayState();
      updateVolume();
      updateProgress(true);
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(hideControls, IDLE_AFTER_MS);
  }

  function hideControls(now) {
    clearTimeout(idleTimer);
    if (now !== true && (pointerOnControls || pointerDown || controlsHaveKeyboardFocus())) {
      idleTimer = setTimeout(hideControls, 1200);
      return;
    }
    fsOverlay.classList.add("idle");
  }

  fsOverlay.addEventListener("pointermove", event => {
    // Chromium also reports a "move" when the lyrics slide under a mouse that isn't moving
    const position = `${event.screenX},${event.screenY}`;
    if (position === lastPointer) return;
    lastPointer = position;
    showControls();
  });
  fsOverlay.addEventListener("pointerdown", () => {
    pointerDown = true;
    showControls();
  });
  window.addEventListener("pointerup", () => (pointerDown = false));
  fsOverlay.addEventListener("wheel", showControls, { passive: true });
  for (const area of [fsControls, fsHeader]) {
    area.addEventListener("pointerenter", () => (pointerOnControls = true));
    area.addEventListener("pointerleave", () => (pointerOnControls = false));
  }
  // The mouse left the app, or another window came to the front
  fsOverlay.addEventListener("pointerleave", () => {
    pointerOnControls = false;
    if (!pointerDown) hideControls(true);
  });
  window.addEventListener("blur", () => {
    pointerDown = false;
    if (fullscreenOpen) hideControls(true);
  });

  function onFullscreenKeydown(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    switch (event.key) {
      case "Escape":
        // Out of full screen first, a second Esc closes the lyrics
        if (windowFullscreen) setWindowFullscreen(false);
        else closeFullscreen();
        break;
      case "F11":
        toggleWindowFullscreen();
        break;
      case " ":
      case "k":
      case "K":
        togglePlay();
        showControls();
        break;
      case "ArrowLeft":
        seekBy(-5);
        showControls();
        break;
      case "ArrowRight":
        seekBy(5);
        showControls();
        break;
      case "ArrowUp":
        setVolume(currentVolume() + 5);
        showControls();
        break;
      case "ArrowDown":
        setVolume(currentVolume() - 5);
        showControls();
        break;
      case "m":
      case "M":
        toggleMute();
        showControls();
        break;
      case "c":
      case "C":
        setCoverView(!coverView);
        break;
      case "Tab":
        showControls();
        return;
      default:
        return;
    }
    // Handled here, so YouTube Music's own shortcuts don't act on it a second time
    event.preventDefault();
    event.stopPropagation();
  }

  const resizeObserver = new ResizeObserver(() => layoutFullscreen(true));

  function openFullscreen() {
    if (fullscreenOpen) return;
    fullscreenOpen = true;
    if (!fullscreenHost.isConnected) document.body.appendChild(fullscreenHost);
    fsOverlay.classList.toggle("cover-view", coverView);
    fsOverlay.classList.remove("switching", "no-lyrics");
    switchStartedAt = -Infinity;
    renderFullscreen(true);
    resizeObserver.observe(fsViewport);
    window.addEventListener("keydown", onFullscreenKeydown, true);
    requestAnimationFrame(() => fsOverlay.classList.add("visible"));
    fsViewport.focus({ preventScroll: true });
    updatePlayState();
    updateVolume();
    updateProgress(true);
    clearInterval(progressTimer);
    progressTimer = setInterval(() => updateProgress(false), 250);
    lastPointer = "";
    showControls();
    kick();
  }

  function closeFullscreen() {
    if (!fullscreenOpen) return;
    fullscreenOpen = false;
    fsOverlay.classList.remove("visible");
    clearInterval(progressTimer);
    clearTimeout(renderTimer);
    clearTimeout(switchFallback);
    clearTimeout(idleTimer);
    // Leave full screen with the lyrics, unless a music video put the window there (it uses the page's fullscreen)
    if (windowFullscreen && !document.fullscreenElement) setWindowFullscreen(false);
    resizeObserver.disconnect();
    window.removeEventListener("keydown", onFullscreenKeydown, true);
    setTimeout(() => {
      if (fullscreenOpen) return;
      dropFullscreenNodes();
      fsTrack.replaceChildren();
      fullscreenHost.remove();
    }, 280);
  }

  fsCloseButton.onclick = closeFullscreen;

  // A button for it in the player bar, next to the sleep timer
  const fullscreenButton = element("button");
  fullscreenButton.type = "button";
  fullscreenButton.classList.add("ytmd-player-bar-control", "ytmd-lyrics-fullscreen-button");
  fullscreenButton.title = "Fullscreen lyrics";
  fullscreenButton.setAttribute("aria-label", "Fullscreen lyrics");
  fullscreenButton.append(element("span", "material-symbols-outlined", "lyrics"));
  fullscreenButton.onclick = () => (fullscreenOpen ? closeFullscreen() : openFullscreen());
  const rightControls = document.querySelector("ytmusic-app-layout>ytmusic-player-bar")?.querySelector(".right-controls-buttons");
  const anchor = rightControls?.querySelector(".sleep-timer-button") ?? rightControls?.querySelector(".shuffle");
  if (anchor) anchor.insertAdjacentElement("afterend", fullscreenButton);

  // ── Following YouTube Music ──────────────────────────────────────────────────────────────────────────
  let lastApplied = null;

  function startSong(videoId, details) {
    song.videoId = videoId;
    song.isMusicVideo = details?.musicVideoType === "MUSIC_VIDEO_TYPE_OMV";
    song.title = details?.title ?? "";
    song.artist = details?.author ?? "";
    song.browseId = null;
    song.youtube = undefined;
    song.community = undefined;
    song.communityRequested = false;
    song.lyrics = null;
    song.chosenByUser = false;
    song.shownAt = Date.now();
    current = null;
    focusIndex = -2;
    activeLines.clear();
    activeItem = null;
    lastSentLine = undefined;
    sendLine(null);
    enableAutoScroll();
    restoreYtmLyrics();
    renderTab();
    if (fullscreenOpen) {
      beginSwitch();
      renderFullscreenHeader();
      renderFullscreenSources([]);
    }
  }

  function requestCommunity(details) {
    if (song.communityRequested || !details) return;
    song.communityRequested = true;
    const videoId = song.videoId;
    const duration = Number(details.lengthSeconds) || (typeof playerApi.getDuration === "function" ? playerApi.getDuration() : 0);
    void fetchCommunityLyrics({ videoId, title: details.title ?? "", artist: details.author ?? "", album: null, durationSeconds: duration }).then(result => {
      if (song.videoId !== videoId) return;
      song.community = result;
      chooseLyrics();
    });
  }

  function requestYouTube(browseId) {
    if (song.browseId === browseId) return;
    song.browseId = browseId;
    song.youtube = undefined;
    const videoId = song.videoId;
    void fetchYouTubeLyrics(browseId).then(result => {
      if (song.videoId !== videoId || song.browseId !== browseId) return;
      song.youtube = result;
      chooseLyrics();
    });
  }

  async function applyCurrentState(force) {
    const state = ytmStore.getState();
    const playerPage = state.playerPage;
    const playerResponse = state.player?.playerResponse;
    if (!force && lastApplied && lastApplied.playerPage === playerPage && lastApplied.playerResponse === playerResponse) return;
    lastApplied = { playerPage, playerResponse };
    getVideo();

    const details = playerResponse?.videoDetails;
    const playingVideoId = details?.videoId ?? null;
    if (playingVideoId !== song.videoId) {
      startSong(playingVideoId, details);
    }
    if (!playingVideoId || !options.enabled) return;

    requestCommunity(details);

    if (!playerPage?.playerPageTabs) return;
    // The player page (with its lyrics tab) and the player load separately: for a moment one of them can
    // still belong to the previous song
    const pageVideoId = playerPage.playerPageWatchNextResponse?.currentVideoEndpoint?.watchEndpoint?.videoId ?? playingVideoId;
    if (pageVideoId !== playingVideoId) return;

    const lyricsTabIndex = playerPage.playerPageTabs.findIndex(tab => tab.tabRenderer?.endpoint?.browseEndpoint?.browseId?.startsWith("MPLY"));
    if (lyricsTabIndex === -1) {
      if (song.youtube === undefined && !song.browseId) {
        song.youtube = null;
        chooseLyrics();
      }
      viewingLyricsTab = false;
      return;
    }
    requestYouTube(playerPage.playerPageTabs[lyricsTabIndex].tabRenderer.endpoint.browseEndpoint.browseId);

    const viewing = playerPage.playerPageTabSelectedIndex === lyricsTabIndex;
    if (viewing !== viewingLyricsTab) {
      viewingLyricsTab = viewing;
      if (!viewing) tabShown = false;
    }
    updateTabVisibility();
  }

  window.__YTMD_TIMED_LYRICS__ = {
    toggleFullscreen: () => (fullscreenOpen ? closeFullscreen() : openFullscreen()),
    configure: next => {
      const previous = { ...options };
      Object.assign(options, next);
      if (previous.enabled !== options.enabled || previous.communitySources !== options.communitySources) {
        if (!options.enabled) {
          sendLine(null);
          setLyrics(null);
          restoreYtmLyrics();
        } else {
          // Look again for the current song
          const details = playerApi.getPlayerResponse()?.videoDetails;
          song.videoId = null;
          lastApplied = null;
          if (details) void applyCurrentState(true);
        }
        return;
      }
      if (previous.offsetMs !== options.offsetMs || previous.wordAnimation !== options.wordAnimation) tick(true);
    }
  };

  ytmStore.subscribe(() => void applyCurrentState());
  // The progress event still drives the lyrics while nothing is drawn (the mini player's line)
  playerApi.addEventListener("onVideoProgress", () => {
    if (!rafId) tick(false);
    kick();
  });
  document.addEventListener("visibilitychange", kick);

  void applyCurrentState(true);
});
