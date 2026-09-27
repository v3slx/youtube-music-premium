/* eslint-disable @typescript-eslint/no-unused-expressions */
(function () {
  // Ten band equalizer and volume leveling on YouTube Music's own media element (Web Audio).
  //
  // Once a media element is connected to an AudioContext its sound only comes out through that context, for
  // good. So the chain is only built while the context is actually running (a suspended context would mean
  // silence), and switching the equalizer off afterwards makes the chain neutral instead of removing it.

  if (window.__YTMD_EQUALIZER__) return;

  const FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  let settings = { enabled: false, bands: FREQUENCIES.map(() => 0), leveling: false };
  let sinkId = "default";

  let context = null;
  let media = null;
  let source = null;
  let preamp = null;
  let filters = [];
  let compressor = null;
  let makeup = null;
  let analyser = null;

  const dbToGain = db => Math.pow(10, db / 20);

  function buildChain() {
    context = new AudioContext({ latencyHint: "playback" });
    preamp = context.createGain();
    filters = FREQUENCIES.map((frequency, index) => {
      const filter = context.createBiquadFilter();
      filter.type = index === 0 ? "lowshelf" : index === FREQUENCIES.length - 1 ? "highshelf" : "peaking";
      filter.frequency.value = frequency;
      filter.Q.value = 1.1;
      return filter;
    });
    compressor = context.createDynamicsCompressor();
    makeup = context.createGain();

    let node = preamp;
    for (const filter of filters) {
      node.connect(filter);
      node = filter;
    }
    node.connect(compressor);
    compressor.connect(makeup);
    makeup.connect(context.destination);
    // A tap next to the output for diagnostics, it doesn't change the sound
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    makeup.connect(analyser);
    void applySinkId();
  }

  function applyParameters() {
    if (!context) return;
    const time = context.currentTime;
    const bands = settings.enabled ? settings.bands : FREQUENCIES.map(() => 0);
    filters.forEach((filter, index) => filter.gain.setTargetAtTime(bands[index] ?? 0, time, 0.05));
    // Boosted bands would clip: the loudest boost is partly taken back before the filters
    const maxBoost = Math.max(0, ...bands);
    preamp.gain.setTargetAtTime(dbToGain(-maxBoost * 0.6), time, 0.05);

    if (settings.leveling) {
      // Gentle, slow compression evens out quiet and loud passages and songs
      compressor.threshold.setTargetAtTime(-30, time, 0.05);
      compressor.knee.setTargetAtTime(20, time, 0.05);
      compressor.ratio.setTargetAtTime(3.5, time, 0.05);
      compressor.attack.setTargetAtTime(0.02, time, 0.05);
      compressor.release.setTargetAtTime(0.4, time, 0.05);
      makeup.gain.setTargetAtTime(dbToGain(6), time, 0.05);
    } else {
      // Neutral: no compression, no gain
      compressor.threshold.setTargetAtTime(0, time, 0.05);
      compressor.knee.setTargetAtTime(0, time, 0.05);
      compressor.ratio.setTargetAtTime(1, time, 0.05);
      makeup.gain.setTargetAtTime(1, time, 0.05);
    }
  }

  async function applySinkId() {
    if (!context || typeof context.setSinkId !== "function") return;
    try {
      // The AudioContext uses "" for the system default
      await context.setSinkId(sinkId === "default" ? "" : sinkId);
    } catch (error) {
      console.warn("YTMD equalizer could not switch the audio output device", error);
    }
  }

  /** Connects the media element - only when the chain is wanted and the context really runs. */
  async function connect() {
    const wanted = settings.enabled || settings.leveling;
    const element = document.querySelector("video");
    if (!wanted || !element || element === media) return;

    if (!context) buildChain();
    if (context.state !== "running") {
      try {
        await context.resume();
      } catch {
        /* resumed on the next interaction */
      }
    }
    if (context.state !== "running" || element === media) return;

    try {
      source = context.createMediaElementSource(element);
      source.connect(preamp);
      media = element;
      applyParameters();
    } catch (error) {
      console.warn("YTMD equalizer could not attach to the player", error);
    }
  }

  // A context created without a user interaction starts suspended: try again on the next one and on play
  for (const eventName of ["pointerdown", "keydown"]) {
    window.addEventListener(eventName, () => void connect(), { capture: true, passive: true });
  }
  document.addEventListener("playing", () => void connect(), true);

  window.__YTMD_EQUALIZER__ = {
    update(newSettings) {
      settings = {
        enabled: !!newSettings.enabled,
        leveling: !!newSettings.leveling,
        bands: FREQUENCIES.map((_, index) => {
          const value = Number(newSettings.bands?.[index]);
          return Number.isFinite(value) ? Math.max(-12, Math.min(12, value)) : 0;
        })
      };
      applyParameters();
      void connect();
    },
    setSinkId(newSinkId) {
      sinkId = newSinkId || "default";
      void applySinkId();
    },
    // For the settings search / diagnostics: is the chain in the sound path?
    isActive() {
      return !!media && context?.state === "running";
    },
    // RMS level at the output (0 = silence), to check that sound really flows through the chain
    level() {
      if (!analyser) return 0;
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    }
  };
});
