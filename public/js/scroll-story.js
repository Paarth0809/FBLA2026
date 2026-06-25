// Drives the cinematic 480-frame scrollytelling hero. The canvas owns the image
// sequence while DOM text layers stay accessible and are mirrored by the lens shader.
(function () {
  const story = document.querySelector('[data-scroll-story]');
  if (!story) return;

  const canvas = story.querySelector('[data-story-canvas]');
  const loader = story.querySelector('[data-story-loader]');
  const progressText = story.querySelector('[data-story-progress]');
  const layers = {
    intro: story.querySelector('[data-story-layer="intro"]'),
    catalog: story.querySelector('[data-story-layer="catalog"]'),
    verify: story.querySelector('[data-story-layer="verify"]'),
    final: story.querySelector('[data-story-layer="final"]')
  };

  if (!canvas) return;

  const context = canvas.getContext('2d', { alpha: false });
  const frameCount = Number(story.dataset.frameCount || 0);
  const framePath = story.dataset.framePath || '/frames/topaztable/frame_';
  const frameExt = story.dataset.frameExt || 'webp';
  // In-memory cache maps scroll progress directly to frames once preloading completes.
  const frames = new Array(frameCount);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const compactLayout = window.matchMedia('(max-width: 1024px)');
  const deviceMemory = navigator.deviceMemory || 8;
  const concurrency = Math.max(6, Math.min(deviceMemory >= 8 ? 14 : 10, 16));

  let loadedCount = 0;
  let lastDrawn = -1;
  let lastKnownProgress = 0;
  let rafId = 0;
  let loaded = false;

  document.body.classList.add('has-scroll-story', 'scrolly-nav-armed', 'scrolly-nav-visible');

  function frameUrl(index) {
    return `${framePath}${String(index).padStart(4, '0')}.${frameExt}`;
  }

  function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
  }

  function smoothstep(edge0, edge1, value) {
    const x = clamp((value - edge0) / (edge1 - edge0));
    return x * x * (3 - 2 * x);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      lastDrawn = -1;
    }
  }

  function drawCover(image) {
    if (!image) return;

    // Match CSS background-size: cover so generated frames fill all devices.
    resizeCanvas();
    const canvasRatio = canvas.width / canvas.height;
    const imageRatio = image.naturalWidth / image.naturalHeight;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;

    if (imageRatio > canvasRatio) {
      sourceWidth = image.naturalHeight * canvasRatio;
      sourceX = (image.naturalWidth - sourceWidth) / 2;
    } else {
      sourceHeight = image.naturalWidth / canvasRatio;
      sourceY = (image.naturalHeight - sourceHeight) / 2;
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );
  }

  function nearestLoadedFrame(targetIndex) {
    if (frames[targetIndex]) return frames[targetIndex];

    // During preload, show the closest cached frame to avoid blank flashes.
    for (let offset = 1; offset < frameCount; offset += 1) {
      const before = targetIndex - offset;
      const after = targetIndex + offset;
      if (before >= 0 && frames[before]) return frames[before];
      if (after < frameCount && frames[after]) return frames[after];
    }

    return null;
  }

  function setLayer(layer, opacity, transform, blur = 0) {
    if (!layer) return;
    layer.style.opacity = String(clamp(opacity));
    layer.style.transform = transform;
    layer.style.filter = `blur(${Math.max(0, blur).toFixed(2)}px)`;
    layer.style.pointerEvents = opacity > 0.85 ? 'auto' : 'none';
  }

  function updateLayers(progress) {
    // Text layers fade over the canvas; the GLB lens consumes the same progress separately.
    const compact = compactLayout.matches;
    const intro = 1 - smoothstep(0.14, 0.22, progress);
    const catalog = smoothstep(0.2, 0.3, progress) * (1 - smoothstep(0.48, 0.58, progress));
    const verify = smoothstep(0.5, 0.6, progress) * (1 - smoothstep(0.78, 0.88, progress));
    const final = smoothstep(0.84, 0.95, progress);

    setLayer(
      layers.intro,
      intro,
      `translate3d(-50%, calc(-50% + ${(1 - intro) * -22}px), 0) scale(${1 - (1 - intro) * 0.018})`,
      (1 - intro) * 8
    );
    setLayer(
      layers.catalog,
      catalog,
      compact
        ? `translate3d(0, ${(1 - catalog) * 18}px, 0)`
        : `translate3d(${(1 - catalog) * -28}px, calc(-50% + ${(1 - catalog) * 18}px), 0)`,
      (1 - catalog) * 7
    );
    setLayer(
      layers.verify,
      verify,
      compact
        ? `translate3d(0, ${(1 - verify) * 18}px, 0)`
        : `translate3d(${(1 - verify) * 28}px, calc(-50% + ${(1 - verify) * 18}px), 0)`,
      (1 - verify) * 7
    );
    setLayer(
      layers.final,
      final,
      `translate3d(-50%, calc(-50% + ${(1 - final) * 24}px), 0) scale(${0.985 + final * 0.015})`,
      (1 - final) * 8
    );

    document.body.classList.add('scrolly-nav-visible');
    document.body.classList.toggle('scrolly-nav-enhanced', window.scrollY > 40 || progress > 0.025);
  }

  function publishProgress(progress, frameIndex) {
    // Other modules, especially the WebGL lens, subscribe to this lightweight state.
    window.__scrollStory = {
      progress,
      frameIndex,
      loaded
    };
    window.dispatchEvent(new CustomEvent('scroll-story:progress', {
      detail: {
        progress,
        frameIndex,
        loaded
      }
    }));
  }

  function currentProgress() {
    const rect = story.getBoundingClientRect();
    const scrollable = Math.max(1, story.offsetHeight - window.innerHeight);
    return clamp(-rect.top / scrollable);
  }

  function render() {
    rafId = 0;
    // Scroll progress is the single source of truth: progress -> frame -> text layer.
    const progress = reduceMotion ? 0 : currentProgress();
    lastKnownProgress = progress;
    const frameIndex = Math.round(progress * (frameCount - 1));

    if (frameIndex !== lastDrawn || !loaded) {
      const image = nearestLoadedFrame(frameIndex);
      if (image) {
        drawCover(image);
        lastDrawn = frameIndex;
      }
    }

    updateLayers(progress);
    publishProgress(progress, frameIndex);
  }

  function requestRender() {
    if (!rafId) rafId = window.requestAnimationFrame(render);
  }

  function updateProgress() {
    if (!progressText || !frameCount) return;
    const percent = Math.round((loadedCount / frameCount) * 100);
    progressText.textContent = `${percent}%`;
  }

  function loadFrame(index) {
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        frames[index - 1] = image;
        loadedCount += 1;
        updateProgress();
        requestRender();
        resolve();
      };
      image.onerror = () => {
        loadedCount += 1;
        updateProgress();
        resolve();
      };
      image.src = frameUrl(index);
    });
  }

  async function preloadFrames() {
    // Parallel preloading keeps the 480-frame sequence responsive without flooding slower machines.
    updateProgress();

    if (reduceMotion) {
      await loadFrame(1);
      loaded = true;
      story.classList.add('story-loaded');
      loader?.setAttribute('aria-hidden', 'true');
      requestRender();
      return;
    }

    await loadFrame(1);

    let nextIndex = 2;
    async function worker() {
      while (nextIndex <= frameCount) {
        const index = nextIndex;
        nextIndex += 1;
        await loadFrame(index);
      }
    }

    const workers = Array.from({ length: concurrency }, worker);
    await Promise.all(workers);
    loaded = true;
    story.classList.add('story-loaded');
    loader?.setAttribute('aria-hidden', 'true');
    requestRender();
  }

  window.addEventListener('scroll', requestRender, { passive: true });
  window.addEventListener('resize', () => {
    lastDrawn = -1;
    requestRender();
  }, { passive: true });
  window.addEventListener('orientationchange', () => {
    lastDrawn = -1;
    requestRender();
  }, { passive: true });

  preloadFrames();
  requestRender();
})();
