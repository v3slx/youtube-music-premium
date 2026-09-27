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

  function iconButton(className, icon, label, title) {
    const button = element("button", className);
    button.type = "button";
    if (title) button.title = title;
    button.append(element("span", "icon", icon));
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
  // The player's progress event only comes about four times a second. The <video> element knows the exact
  // position at any moment, so the lyrics read it on every frame instead.
  let video = null;
  function getVideo() {
    if (!video || !video.isConnected) {
      const found = document.querySelector("#movie_player video") ?? document.querySelector("video");
      if (found && found !== video) {
        video = found;
        for (const type of ["play", "playing", "pause", "seeked", "seeking", "ratechange", "loadedmetadata"]) video.addEventListener(type, onVideoEvent);
      }
    }
    return video;
  }

  function adShowing() {
    return !!document.querySelector("#movie_player.ad-showing");
  }

  function songTimeMs() {
    const current = getVideo();
    const seconds = current ? current.currentTime : typeof playerApi.getCurrentTime === "function" ? playerApi.getCurrentTime() : 0;
    return seconds * 1000 + options.offsetMs;
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
    if (fullscreenOpen) renderFullscreen();
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
    .backdrop {
      position: absolute; left: 50%; top: 50%; width: 170vmax; height: 170vmax; margin: -85vmax 0 0 -85vmax;
      image-rendering: auto; animation: drift 80s linear infinite; opacity: 0; transition: opacity 900ms ease;
    }
    .backdrop.ready { opacity: 1; }
    .backdrop.second { animation-duration: 110s; animation-direction: reverse; mix-blend-mode: screen; }
    .backdrop.second.ready { opacity: 0.55; }
    @keyframes drift { from { transform: rotate(0deg) scale(1.1); } 50% { transform: rotate(180deg) scale(1.25); } to { transform: rotate(360deg) scale(1.1); } }
    .shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 45%, rgba(0,0,0,0.05), rgba(0,0,0,0.55)); }
    header { position: relative; z-index: 2; display: flex; align-items: center; gap: 18px; padding: 26px 40px 6px; }
    .cover { width: 72px; height: 72px; flex-shrink: 0; border-radius: 10px; object-fit: cover; box-shadow: 0 14px 34px rgba(0,0,0,0.5); }
    .meta { min-width: 0; flex: 1; }
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
    .icon {
      font-family: "Material Symbols Outlined"; font-size: 22px; line-height: 1; font-weight: normal; font-style: normal;
      letter-spacing: normal; text-transform: none; white-space: nowrap; direction: ltr; -webkit-font-smoothing: antialiased;
    }
    .close { width: 46px; height: 46px; padding: 0; justify-content: center; }
    .viewport {
      position: relative; z-index: 1; flex: 1; overflow: hidden; outline: none;
      -webkit-mask-image: linear-gradient(transparent, #000 13%, #000 80%, transparent);
    }
    .track { position: absolute; left: 0; right: 0; top: 0; padding: 0 max(40px, calc((100% - 1080px) / 2)); --y: 0px; }
    .item {
      transform: translateY(var(--y)); transition: transform 820ms cubic-bezier(0.2, 0.9, 0.25, 1), opacity 420ms ease, filter 520ms ease;
      transition-delay: var(--delay, 0ms);
    }
    .line {
      margin: 0 0 30px; font-size: clamp(28px, 3.5vw, 52px); font-weight: 800; line-height: 1.22; letter-spacing: -0.01em;
      cursor: pointer; opacity: 0.36; filter: blur(var(--blur, 0px)); transform-origin: left center;
    }
    .line p { margin: 0; }
    .line.alternate { text-align: right; transform-origin: right center; }
    .line .ytmd-line-background { font-size: 0.6em; font-weight: 700; margin-top: 6px; }
    .line:hover { opacity: 0.6; filter: none; }
    .line.active { opacity: 1; filter: none; }
    .interlude { height: 0; margin: 0; opacity: 0; font-size: clamp(28px, 3.5vw, 52px); transition-property: transform, opacity, height, margin; }
    .interlude.active { height: 0.6em; margin: 0 0 34px; opacity: 1; }
    ${interludeCss(".track")}
    .track.manual .item { transition: none; filter: none; }
    .empty { position: absolute; z-index: 1; top: 50%; left: 0; right: 0; margin: 0; text-align: center; font-size: 20px; color: rgba(255,255,255,0.78); }
    .resume { position: absolute; z-index: 2; left: 50%; bottom: 28px; transform: translateX(-50%); background: rgba(20,20,24,0.72); backdrop-filter: blur(12px); }
    .hidden { display: none !important; }
    @media (prefers-reduced-motion: reduce) {
      .overlay, .item, .backdrop { transition: none; animation: none; }
      .interlude.active .ytmd-interlude-dots { animation: none; }
    }
  `;
  const fsOverlay = element("div", "overlay");
  fsOverlay.setAttribute("role", "dialog");
  fsOverlay.setAttribute("aria-label", "Fullscreen lyrics");
  const fsBackdrop = element("canvas", "backdrop");
  const fsBackdropSecond = element("canvas", "backdrop second");
  const fsHeader = element("header");
  const fsCover = element("img", "cover");
  fsCover.alt = "";
  const fsMeta = element("div", "meta");
  const fsTitle = element("p", "title");
  const fsArtist = element("p", "artist");
  fsMeta.append(fsTitle, fsArtist);
  const fsSources = element("div", "sources");
  const fsCloseButton = iconButton("close", "close", null, "Close (Esc)");
  fsCloseButton.setAttribute("aria-label", "Close fullscreen lyrics");
  fsHeader.append(fsCover, fsMeta, fsSources, fsCloseButton);
  const fsViewport = element("div", "viewport");
  fsViewport.tabIndex = -1;
  const fsTrack = element("div", "track");
  fsViewport.append(fsTrack);
  const fsEmpty = element("p", "empty hidden", "No synced lyrics for this song");
  const fsResume = iconButton("resume hidden", "sync", "Back to the current line");
  fsOverlay.append(fsBackdrop, fsBackdropSecond, element("div", "shade"), fsHeader, fsViewport, fsEmpty, fsResume);
  fullscreenRoot.append(fsStyle, fsOverlay);

  let fullscreenOpen = false;
  let manualOffset = 0;
  let manualUntil = 0;
  let manualTimer = 0;
  let backdropUrl = "";

  function largestThumbnail() {
    const thumbnails = playerApi.getPlayerResponse()?.videoDetails?.thumbnail?.thumbnails;
    if (!Array.isArray(thumbnails) || !thumbnails.length) return "";
    return [...thumbnails].sort((a, b) => b.width - a.width)[0].url;
  }

  /** The album art, blurred on a tiny canvas and scaled up: a soft moving background that costs almost nothing */
  function paintBackdrop(url) {
    if (url === backdropUrl) return;
    backdropUrl = url;
    fsBackdrop.classList.remove("ready");
    fsBackdropSecond.classList.remove("ready");
    if (!url) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (backdropUrl !== url) return;
      const paint = (canvas, flip) => {
        canvas.width = 40;
        canvas.height = 40;
        const context = canvas.getContext("2d");
        context.filter = "blur(3px) saturate(1.6) brightness(0.62)";
        context.save();
        if (flip) {
          context.translate(40, 0);
          context.scale(-1, 1);
        }
        context.drawImage(image, -6, -6, 52, 52);
        context.restore();
        canvas.classList.add("ready");
      };
      paint(fsBackdrop, false);
      paint(fsBackdropSecond, true);
    };
    image.src = url;
  }

  function renderFullscreenHeader() {
    const details = playerApi.getPlayerResponse()?.videoDetails;
    fsTitle.textContent = details?.title ?? "";
    fsArtist.textContent = details?.author ?? "";
    const art = largestThumbnail();
    fsCover.src = art;
    fsCover.hidden = !art;
    paintBackdrop(art);
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

  function renderFullscreen() {
    renderFullscreenHeader();
    manualOffset = 0;
    fsTrack.classList.remove("manual");
    fsResume.classList.add("hidden");
    if (!current) {
      fsTrack.replaceChildren();
      fsEmpty.classList.remove("hidden");
      renderFullscreenSources([]);
      return;
    }
    fsEmpty.classList.add("hidden");
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
    requestAnimationFrame(() => tick(true));
  }

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

  function onFullscreenKeydown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeFullscreen();
  }

  const resizeObserver = new ResizeObserver(() => layoutFullscreen(true));

  function openFullscreen() {
    if (fullscreenOpen) return;
    fullscreenOpen = true;
    if (!fullscreenHost.isConnected) document.body.appendChild(fullscreenHost);
    renderFullscreen();
    resizeObserver.observe(fsViewport);
    window.addEventListener("keydown", onFullscreenKeydown, true);
    requestAnimationFrame(() => fsOverlay.classList.add("visible"));
    fsViewport.focus({ preventScroll: true });
    kick();
  }

  function closeFullscreen() {
    if (!fullscreenOpen) return;
    fullscreenOpen = false;
    fsOverlay.classList.remove("visible");
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
    if (fullscreenOpen) renderFullscreen();
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
      if (fullscreenOpen) renderFullscreenHeader();
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
