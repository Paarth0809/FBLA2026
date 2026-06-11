import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const story = document.querySelector('[data-scroll-story]');
const sticky = story?.querySelector('.scroll-story-sticky');
const storyCanvas = story?.querySelector('[data-story-canvas]');
const lensCanvas = story?.querySelector('[data-lens-canvas]');
const refract = story?.querySelector('[data-lens-refract]');

if (story && sticky && storyCanvas && lensCanvas) {
  initScrollLens();
}

function initScrollLens() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !window.WebGLRenderingContext) {
    story.classList.add('scroll-lens-disabled');
    return;
  }

  refract?.setAttribute('aria-hidden', 'true');
  const debugMode = new URLSearchParams(window.location.search).has('lensDebug');
  const originalLayers = Array.from(story.querySelectorAll('[data-story-layer]'));
  const layerByName = new Map(originalLayers.map((layer) => [layer.dataset.storyLayer, layer]));

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: lensCanvas,
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
      powerPreference: 'high-performance'
    });
  } catch {
    story.classList.add('scroll-lens-webgl-fallback');
    return;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);

  const modelPivot = new THREE.Group();
  scene.add(modelPivot);

  const compositor = createStoryCompositor(storyCanvas, originalLayers);
  const compositeTexture = new THREE.CanvasTexture(compositor.canvas);
  compositeTexture.name = 'ScrollStoryComposite';
  compositeTexture.colorSpace = THREE.SRGBColorSpace;
  compositeTexture.minFilter = THREE.LinearFilter;
  compositeTexture.magFilter = THREE.LinearFilter;
  compositeTexture.generateMipmaps = false;
  compositeTexture.flipY = false;

  const glassMaterial = createAppleGlassMaterial(compositeTexture);
  const debugLayer = debugMode ? createDebugLayer(sticky) : null;

  scene.environmentRotation.set(0, 1.15, 0);
  const environmentFallback = createStudioEnvironment(renderer);
  scene.environment = environmentFallback;
  loadHdrEnvironment(renderer, scene, environmentFallback);

  scene.add(new THREE.HemisphereLight(0xf7fff9, 0x102017, 1.15));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
  keyLight.position.set(3.2, 3.8, 5.6);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x95ffd0, 1.45);
  rimLight.position.set(-3.4, 1.4, 4.3);
  scene.add(rimLight);

  const frontLight = new THREE.DirectionalLight(0xf8fffb, 0.62);
  frontLight.position.set(-0.2, 0.4, 5.8);
  scene.add(frontLight);

  const glintLight = new THREE.PointLight(0xffffff, 1.35, 8.5);
  glintLight.position.set(-1.6, 1.2, 3.2);
  scene.add(glintLight);

  let model = null;
  let glassMesh = null;
  let glassProjectionPoints = [];
  let viewport = measureViewport();
  let rafId = 0;
  let scrollTrigger = null;
  const progress = { current: currentProgress(), target: currentProgress() };
  const smoothToProgress = gsap.quickTo(progress, 'current', {
    duration: 0.18,
    ease: 'power3.out',
    onUpdate: requestRender
  });

  const loader = new GLTFLoader();
  loader.load(
    '/models/magnifying-glass.glb',
    (gltf) => {
      model = gltf.scene;

      model.traverse((node) => {
        if (!node.isMesh) return;
        if (/glass/i.test(node.material?.name || node.name || '')) {
          glassMesh = node;
        }
      });

      model.traverse((node) => {
        if (!node.isMesh) return;
        polishLensMaterial(node, glassMaterial);
      });

      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const normalizedModelScale = 1 / (Math.max(size.x, size.y, size.z) || 1);
      model.scale.setScalar(normalizedModelScale);
      model.updateMatrixWorld(true);

      const anchorBounds = new THREE.Box3().setFromObject(glassMesh || model);
      const anchor = anchorBounds.getCenter(new THREE.Vector3());
      model.position.sub(anchor);
      model.updateMatrixWorld(true);
      glassProjectionPoints = glassMesh ? cacheProjectionPoints(glassMesh) : [];

      modelPivot.add(model);
      story.classList.add('scroll-lens-ready');
      requestRender();
    },
    undefined,
    () => {
      story.classList.add('scroll-lens-webgl-fallback');
    }
  );

  try {
    scrollTrigger = ScrollTrigger.create({
      trigger: story,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        progress.target = self.progress;
        smoothToProgress(self.progress);
      }
    });
  } catch {
    scrollTrigger = null;
  }

  function measureViewport() {
    const rect = lensCanvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const aspect = width / height;
    const viewHeight = aspect > 1.35 ? 5.15 : 6.25;
    const viewWidth = viewHeight * aspect;
    return { width, height, aspect, viewWidth, viewHeight };
  }

  function resize() {
    viewport = measureViewport();
    renderer.setSize(viewport.width, viewport.height, false);
    camera.left = -viewport.viewWidth / 2;
    camera.right = viewport.viewWidth / 2;
    camera.top = viewport.viewHeight / 2;
    camera.bottom = -viewport.viewHeight / 2;
    camera.updateProjectionMatrix();
  }

  function currentProgress() {
    const scrollable = Math.max(1, story.offsetHeight - window.innerHeight);
    return clamp(-story.getBoundingClientRect().top / scrollable);
  }

  function requestRender() {
    if (!rafId) rafId = window.requestAnimationFrame(render);
  }

  function render() {
    rafId = 0;
    resize();

    if (!scrollTrigger) {
      progress.current = currentProgress();
      progress.target = progress.current;
    }

    const state = computeLensState(progress.current);
    updateModel(state);
    const optics = computeProjectedOptics(state);
    updateOriginalTextMasks(state, optics);
    compositor.draw(viewport);
    compositeTexture.needsUpdate = true;
    updateGlassUniforms(state, optics);
    updateDebugLayer(debugLayer, state, optics);
    renderer.render(scene, camera);
  }

  function computeLensState(scrollProgress) {
    const compact = viewport.width < 700;
    const frames = getMotionFrames(compact)
      .map((frame) => resolveMotionFrame(frame, compact))
      .filter(Boolean);

    if (!frames.length) {
      return emptyLensState(viewport.width, viewport.height);
    }

    if (scrollProgress <= frames[0].p) return { ...frames[0] };
    if (scrollProgress >= frames[frames.length - 1].p) return { ...frames[frames.length - 1] };

    for (let index = 0; index < frames.length - 1; index += 1) {
      const from = frames[index];
      const to = frames[index + 1];
      if (scrollProgress < from.p || scrollProgress > to.p) continue;
      const local = smoothstep(from.p, to.p, scrollProgress);
      return interpolateLensState(from, to, local);
    }

    return { ...frames[frames.length - 1] };
  }

  function resolveMotionFrame(frame, compact) {
    const targetRect = frame.target ? getLayerContentRect(frame.target, frame.includeKicker === true) : null;
    const fallbackX = frame.xRatio != null ? frame.xRatio * viewport.width : viewport.width / 2;
    const fallbackY = frame.yRatio != null ? frame.yRatio * viewport.height : viewport.height / 2;
    const rect = targetRect || { left: fallbackX - 120, top: fallbackY - 120, width: 240, height: 240 };
    const pad = compact ? 24 : 36;
    const minSize = compact ? 195 : 340;
    const maxSize = compact
      ? Math.min(viewport.width * 0.78, viewport.height * 0.46)
      : Math.min(viewport.width * 0.37, viewport.height * 0.57);
    const size = clamp((rect.height + pad * 2) * (frame.sizeBoost ?? 1), minSize, maxSize);
    const half = size / 2;
    const sweep = (frame.sweep ?? 0.5) - 0.5;
    const travel = Math.max(0, rect.width - size * 0.5);
    const yBias = frame.yBias ?? 0;

    return {
      p: frame.p,
      target: frame.target ?? null,
      x: clamp(rect.left + rect.width / 2 + sweep * travel, half * 0.62, viewport.width - half * 0.62),
      y: clamp(rect.top + rect.height / 2 + yBias * rect.height, half * 0.52, viewport.height - half * 0.38),
      size,
      radius: size * 0.45,
      modelOpacity: frame.modelOpacity ?? 1,
      glassOpacity: frame.glassOpacity ?? 1,
      maskScale: frame.maskScale ?? 0.92,
      magnification: frame.magnification ?? 1.22,
      distortion: frame.distortion ?? 1,
      angle: frame.angle ?? 0,
      faceX: frame.faceX ?? Math.PI / 2,
      faceY: frame.faceY ?? 0,
      faceZ: frame.faceZ ?? 0,
      modelOffsetX: frame.modelOffsetX ?? 0,
      modelOffsetY: frame.modelOffsetY ?? 0
    };
  }

  function getLayerContentRect(name, includeKicker = false) {
    const layer = layerByName.get(name);
    if (!layer) return null;

    const selectors = includeKicker
      ? ['.scroll-story-kicker', 'h1', 'h2', 'p:not(.scroll-story-kicker)']
      : ['h1', 'h2', 'p:not(.scroll-story-kicker)'];

    const rects = selectors
      .flatMap((selector) => Array.from(layer.querySelectorAll(selector)))
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);

    if (!rects.length) return null;

    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }

  function updateGlassUniforms(state, optics = fallbackProjectedOptics(state)) {
    const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    const scaleX = drawingBuffer.x / viewport.width;
    const scaleY = drawingBuffer.y / viewport.height;
    const scale = (scaleX + scaleY) * 0.5;
    const uniforms = glassMaterial.uniforms;
    const axisX = new THREE.Vector2(optics.axisX.x, -optics.axisX.y).normalize();
    const axisY = new THREE.Vector2(optics.axisY.x, -optics.axisY.y).normalize();

    uniforms.uResolution.value.set(drawingBuffer.x, drawingBuffer.y);
    uniforms.uLensCenter.value.set(optics.centerX * scaleX, drawingBuffer.y - optics.centerY * scaleY);
    uniforms.uLensAxisX.value.copy(axisX);
    uniforms.uLensAxisY.value.copy(axisY);
    uniforms.uLensRadius.value = Math.max(1, optics.radius * scale);
    uniforms.uLensRadiusX.value = Math.max(1, optics.radiusX * scale);
    uniforms.uLensRadiusY.value = Math.max(1, optics.radiusY * scale);
    uniforms.uOpticalStrength.value = optics.opticalStrength;
    uniforms.uMagnification.value = state.magnification;
    uniforms.uDistortion.value = state.distortion;
    uniforms.uOpacity.value = state.glassOpacity * state.modelOpacity;
    uniforms.uTime.value = performance.now() / 1000;
  }

  function updateOriginalTextMasks(state, optics = fallbackProjectedOptics(state)) {
    const maskScale = Number.isFinite(state.maskScale) ? state.maskScale : 0.92;
    const maskStrength = state.modelOpacity > 0.04 ? optics.maskStrength : 0;
    const radius = maskStrength > 0.12 ? Math.max(0, optics.maskRadius * maskScale * maskStrength) : 0;
    originalLayers.forEach((layer) => {
      const rect = layer.getBoundingClientRect();
      layer.style.setProperty('--lens-hole-x', `${optics.centerX - rect.left}px`);
      layer.style.setProperty('--lens-hole-y', `${optics.centerY - rect.top}px`);
      layer.style.setProperty('--lens-hole-r', `${radius}px`);
      layer.style.setProperty('--lens-hole-feather', `${radius > 0 ? Math.max(3, state.radius * 0.035 * maskStrength) : 0}px`);
    });
  }

  function updateModel(state) {
    lensCanvas.style.setProperty('--lens-render-opacity', String(state.modelOpacity));
    if (!model) return;

    const modelScreenX = state.x + state.size * state.modelOffsetX;
    const modelScreenY = state.y + state.size * state.modelOffsetY;
    const x = (modelScreenX / viewport.width - 0.5) * viewport.viewWidth;
    const y = (0.5 - modelScreenY / viewport.height) * viewport.viewHeight;
    const worldPerPixel = viewport.viewHeight / viewport.height;
    const responsiveScale = viewport.width < 700 ? 2.18 : 2.22;
    const modelScale = Math.max(0.42, state.size * worldPerPixel * responsiveScale);

    modelPivot.visible = state.modelOpacity > 0.02;
    modelPivot.position.set(x, y, 0);
    modelPivot.scale.setScalar(modelScale);
    modelPivot.rotation.set(state.faceX, state.faceY, state.angle + state.faceZ);

    model.rotation.set(0, 0, 0);
  }

  function createDebugLayer(parent) {
    const layer = document.createElement('div');
    layer.className = 'scroll-lens-debug';
    layer.innerHTML = '<span></span>';
    parent.appendChild(layer);
    return layer;
  }

  function updateDebugLayer(layer, state, optics = fallbackProjectedOptics(state)) {
    if (!layer) return;
    layer.style.width = `${optics.radiusX * 2}px`;
    layer.style.height = `${optics.radiusY * 2}px`;
    layer.style.transform = `translate3d(${optics.centerX - optics.radiusX}px, ${optics.centerY - optics.radiusY}px, 0) rotate(${optics.angle}rad)`;
    layer.title = `face ${optics.faceOnStrength.toFixed(2)} / optical ${optics.opticalStrength.toFixed(2)}`;
  }

  function cacheProjectionPoints(mesh) {
    const geometry = mesh.geometry;
    const position = geometry?.attributes?.position;
    if (!position?.count) return [];

    const points = [];
    const stride = Math.max(1, Math.ceil(position.count / 560));
    for (let index = 0; index < position.count; index += stride) {
      points.push(new THREE.Vector3(
        position.getX(index),
        position.getY(index),
        position.getZ(index)
      ));
    }

    if (geometry.boundingBox == null) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box) {
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            points.push(new THREE.Vector3(x, y, z));
          }
        }
      }
    }

    return points;
  }

  function computeProjectedOptics(state) {
    const fallback = fallbackProjectedOptics(state);
    if (!glassMesh || !glassProjectionPoints.length || !model) return fallback;

    modelPivot.updateMatrixWorld(true);
    glassMesh.updateWorldMatrix(true, false);

    const projected = [];
    const scratch = new THREE.Vector3();
    let meanX = 0;
    let meanY = 0;

    glassProjectionPoints.forEach((point) => {
      scratch.copy(point).applyMatrix4(glassMesh.matrixWorld).project(camera);
      if (!Number.isFinite(scratch.x) || !Number.isFinite(scratch.y) || !Number.isFinite(scratch.z)) return;
      const x = (scratch.x * 0.5 + 0.5) * viewport.width;
      const y = (0.5 - scratch.y * 0.5) * viewport.height;
      projected.push(x, y);
      meanX += x;
      meanY += y;
    });

    const count = projected.length / 2;
    if (count < 8) return fallback;

    meanX /= count;
    meanY /= count;

    let varianceX = 0;
    let varianceY = 0;
    let covariance = 0;
    for (let index = 0; index < projected.length; index += 2) {
      const dx = projected[index] - meanX;
      const dy = projected[index + 1] - meanY;
      varianceX += dx * dx;
      varianceY += dy * dy;
      covariance += dx * dy;
    }

    varianceX /= count;
    varianceY /= count;
    covariance /= count;

    let angle = 0.5 * Math.atan2(2 * covariance, varianceX - varianceY);
    const axisX = { x: Math.cos(angle), y: Math.sin(angle) };
    const axisY = { x: -Math.sin(angle), y: Math.cos(angle) };
    let radiusX = 0;
    let radiusY = 0;

    for (let index = 0; index < projected.length; index += 2) {
      const dx = projected[index] - meanX;
      const dy = projected[index + 1] - meanY;
      radiusX = Math.max(radiusX, Math.abs(dx * axisX.x + dy * axisX.y));
      radiusY = Math.max(radiusY, Math.abs(dx * axisY.x + dy * axisY.y));
    }

    radiusX = clamp(radiusX * 1.08, 4, Math.max(fallback.radius * 1.65, 16));
    radiusY = clamp(radiusY * 1.08, 4, Math.max(fallback.radius * 1.65, 16));

    if (radiusY > radiusX) {
      const swapRadius = radiusX;
      radiusX = radiusY;
      radiusY = swapRadius;
      const swapAxis = { ...axisX };
      axisX.x = axisY.x;
      axisX.y = axisY.y;
      axisY.x = swapAxis.x;
      axisY.y = swapAxis.y;
    }
    angle = Math.atan2(axisX.y, axisX.x);

    const ratio = clamp(radiusY / Math.max(radiusX, 1));
    const faceOnStrength = smoothstep(0.2, 0.58, ratio);
    const overlapStrength = getOpticTextOverlapStrength(meanX, meanY, radiusX, radiusY, axisX, axisY, state.target);
    const opticalStrength = clamp(state.modelOpacity * state.glassOpacity * faceOnStrength * overlapStrength);
    const maskStrength = clamp(state.modelOpacity * faceOnStrength * overlapStrength);
    const maskRadius = lerp(radiusY, Math.min(radiusX, fallback.radius), faceOnStrength);

    return {
      centerX: meanX,
      centerY: meanY,
      radius: Math.max(radiusX, radiusY),
      radiusX,
      radiusY,
      maskRadius,
      angle,
      axisX,
      axisY,
      faceOnStrength,
      overlapStrength,
      opticalStrength,
      maskStrength
    };
  }

  function fallbackProjectedOptics(state) {
    return {
      centerX: state.x,
      centerY: state.y,
      radius: state.radius,
      radiusX: state.radius,
      radiusY: state.radius,
      maskRadius: state.radius,
      angle: 0,
      axisX: { x: 1, y: 0 },
      axisY: { x: 0, y: 1 },
      faceOnStrength: 1,
      overlapStrength: 1,
      opticalStrength: state.modelOpacity * state.glassOpacity,
      maskStrength: state.modelOpacity
    };
  }

  function getOpticTextOverlapStrength(centerX, centerY, radiusX, radiusY, axisX, axisY, target) {
    const rect = target ? getLayerContentRect(target, false) : null;
    if (!rect) return 1;

    const boundsWidth = Math.abs(axisX.x) * radiusX + Math.abs(axisY.x) * radiusY;
    const boundsHeight = Math.abs(axisX.y) * radiusX + Math.abs(axisY.y) * radiusY;
    const left = centerX - boundsWidth;
    const right = centerX + boundsWidth;
    const top = centerY - boundsHeight;
    const bottom = centerY + boundsHeight;
    const overlapWidth = Math.max(0, Math.min(right, rect.right) - Math.max(left, rect.left));
    const overlapHeight = Math.max(0, Math.min(bottom, rect.bottom) - Math.max(top, rect.top));
    const overlapArea = overlapWidth * overlapHeight;
    if (overlapArea <= 0) return 0;

    const opticArea = Math.max(1, (right - left) * (bottom - top));
    const textArea = Math.max(1, rect.width * rect.height);
    return smoothstep(0.012, 0.14, overlapArea / Math.min(opticArea, textArea));
  }

  window.addEventListener('scroll-story:progress', requestRender);
  window.addEventListener('scroll', requestRender, { passive: true });
  window.addEventListener('resize', () => {
    resize();
    ScrollTrigger.refresh();
    requestRender();
  }, { passive: true });
  window.addEventListener('orientationchange', () => {
    resize();
    ScrollTrigger.refresh();
    requestRender();
  }, { passive: true });

  resize();
  requestRender();
}

function getMotionFrames(compact) {
  const flat = Math.PI / 2;
  return [
    { p: 0.02, target: 'intro', sweep: -0.08, yBias: -0.02, angle: -0.55, faceX: flat, modelOpacity: 0, glassOpacity: 0.75, magnification: 1.23 },
    { p: 0.055, target: 'intro', sweep: 0.04, yBias: -0.02, angle: -0.3, faceX: flat, modelOpacity: 1, glassOpacity: 0.95, magnification: 1.27 },
    { p: 0.135, target: 'intro', sweep: 0.52, yBias: 0.02, angle: 0.04, faceX: flat, modelOpacity: 1, glassOpacity: 1, magnification: 1.25 },
    { p: 0.205, target: 'intro', sweep: 1.02, yBias: 0.08, angle: 0.34, faceX: flat, modelOpacity: 1, glassOpacity: 0.94, magnification: 1.22 },
    { p: 0.25, target: 'catalog', sweep: -0.08, yBias: -0.04, angle: 3.35, faceX: flat + 0.58, faceY: -0.45, faceZ: 0.18, modelOpacity: 1, glassOpacity: 0.74, magnification: 1.12, distortion: 1.25 },
    { p: 0.32, target: 'catalog', sweep: 0.18, yBias: compact ? 0.1 : 0.12, sizeBoost: 1.14, angle: 6.12, faceX: flat, faceY: 0, faceZ: 0, modelOpacity: 1, glassOpacity: 1, magnification: 1.25 },
    { p: 0.445, target: 'catalog', sweep: 0.82, yBias: compact ? 0.12 : 0.14, sizeBoost: 1.14, angle: 6.54, faceX: flat, faceY: 0, faceZ: 0, modelOpacity: 1, glassOpacity: 1, magnification: 1.24 },
    { p: 0.515, target: 'verify', sweep: 1.06, yBias: 0.02, angle: 8.55, faceX: flat - 0.42, faceY: 0.48, faceZ: -0.22, modelOpacity: 1, glassOpacity: 0.78, magnification: 1.13, distortion: 1.22 },
    { p: 0.602, target: 'verify', sweep: 0.82, yBias: compact ? 0.1 : 0.08, sizeBoost: 1.06, angle: 9.48, faceX: flat, faceY: 0, faceZ: 0, modelOpacity: 1, glassOpacity: 1, magnification: 1.25 },
    { p: 0.742, target: 'verify', sweep: 0.2, yBias: compact ? 0.12 : 0.1, sizeBoost: 1.06, angle: 9.02, faceX: flat, faceY: 0, faceZ: 0, modelOpacity: 1, glassOpacity: 1, magnification: 1.24 },
    { p: 0.825, target: 'final', sweep: -0.1, yBias: 0, angle: 11.72, faceX: flat + 0.5, faceY: -0.42, faceZ: 0.24, modelOpacity: 1, glassOpacity: 0.76, magnification: 1.13, distortion: 1.28 },
    { p: 0.902, target: 'final', sweep: 0.16, yBias: 0.1, sizeBoost: 1.16, angle: 12.52, faceX: flat, faceY: 0, faceZ: 0, modelOpacity: 1, glassOpacity: 1, magnification: 1.26 },
    { p: 0.992, target: 'final', sweep: 0.88, yBias: 0.12, sizeBoost: 1.16, angle: 13.02, faceX: flat, faceY: 0, faceZ: 0, modelOpacity: 1, glassOpacity: 1, magnification: 1.22 }
  ];
}

function interpolateLensState(from, to, amount) {
  const out = { ...from };
  const keys = [
    'x',
    'y',
    'size',
    'radius',
    'modelOpacity',
    'glassOpacity',
    'maskScale',
    'magnification',
    'distortion',
    'angle',
    'faceX',
    'faceY',
    'faceZ',
    'modelOffsetX',
    'modelOffsetY'
  ];

  keys.forEach((key) => {
    out[key] = lerp(from[key], to[key], amount);
  });

  out.target = amount < 0.5 ? from.target : to.target;
  return out;
}

function createStoryCompositor(sourceCanvas, layers) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });
  let scale = 1;

  function resize(viewport) {
    scale = viewport.width < 700 ? 0.82 : Math.min(window.devicePixelRatio || 1, 1.25);
    const width = Math.max(1, Math.round(viewport.width * scale));
    const height = Math.max(1, Math.round(viewport.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function draw(viewport) {
    resize(viewport);
    context.save();
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);
    context.drawImage(sourceCanvas, 0, 0, viewport.width, viewport.height);
    drawStoryVignette(context, viewport);
    layers.forEach((layer) => drawLayerText(context, layer));
    context.restore();
  }

  return { canvas, draw };
}

function drawStoryVignette(context, viewport) {
  const radial = context.createRadialGradient(
    viewport.width * 0.5,
    viewport.height * 0.52,
    Math.min(viewport.width, viewport.height) * 0.16,
    viewport.width * 0.5,
    viewport.height * 0.52,
    Math.max(viewport.width, viewport.height) * 0.72
  );
  radial.addColorStop(0, 'rgba(0,0,0,0)');
  radial.addColorStop(0.62, 'rgba(1,3,2,0.28)');
  radial.addColorStop(1, 'rgba(1,3,2,0.82)');
  context.fillStyle = radial;
  context.fillRect(0, 0, viewport.width, viewport.height);

  const vertical = context.createLinearGradient(0, 0, 0, viewport.height);
  vertical.addColorStop(0, 'rgba(1,3,2,0.68)');
  vertical.addColorStop(0.2, 'rgba(1,3,2,0)');
  vertical.addColorStop(0.72, 'rgba(1,3,2,0)');
  vertical.addColorStop(1, 'rgba(1,3,2,0.9)');
  context.fillStyle = vertical;
  context.fillRect(0, 0, viewport.width, viewport.height);
}

function drawLayerText(context, layer) {
  const layerOpacity = Number.parseFloat(getComputedStyle(layer).opacity || '0');
  if (layerOpacity <= 0.01) return;

  const elements = Array.from(layer.querySelectorAll('.scroll-story-kicker, h1, h2, p:not(.scroll-story-kicker), .scroll-story-button'));
  elements.forEach((element) => drawTextElement(context, element, layerOpacity));
}

function drawTextElement(context, element, layerOpacity) {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const fontSize = Number.parseFloat(style.fontSize) || 16;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
  const tag = element.tagName.toLowerCase();
  const isButton = element.classList.contains('scroll-story-button');
  const text = element.innerText.replace(/\u00a0/g, ' ').trim();
  if (!text) return;

  context.save();
  context.globalAlpha = layerOpacity * (Number.parseFloat(style.opacity || '1') || 1);
  context.font = `${style.fontStyle && style.fontStyle !== 'normal' ? `${style.fontStyle} ` : ''}${style.fontWeight || 600} ${style.fontSize} ${style.fontFamily}`;
  context.textBaseline = 'alphabetic';
  context.fillStyle = style.color || 'rgba(255,255,255,0.95)';
  context.shadowColor = tag === 'p' ? 'rgba(0,0,0,0.24)' : 'rgba(0,0,0,0.45)';
  context.shadowBlur = tag === 'p' ? 12 : 24;
  context.shadowOffsetY = tag === 'p' ? 3 : 6;
  if ('letterSpacing' in context) {
    context.letterSpacing = style.letterSpacing;
  }

  if (isButton) {
    context.globalAlpha *= 0.92;
    roundRect(context, rect.left, rect.top, rect.width, rect.height, Math.min(18, rect.height / 2));
    context.fillStyle = element.classList.contains('primary') ? '#007f55' : 'rgba(255,255,255,0.06)';
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = element.classList.contains('primary') ? '#ffffff' : 'rgba(255,255,255,0.92)';
  }

  const renderedLines = isButton ? [] : getRenderedTextLines(element);
  if (renderedLines.length) {
    context.textAlign = 'left';
    renderedLines.forEach((line) => {
      const baseline = line.top + Math.min(line.height, lineHeight) / 2 + fontSize * 0.34;
      context.fillText(line.text, line.left, baseline);
    });
    context.restore();
    return;
  }

  const textAlign = style.textAlign === 'right' ? 'right' : style.textAlign === 'center' ? 'center' : 'left';
  context.textAlign = textAlign;
  const x = textAlign === 'center' ? rect.left + rect.width / 2 : textAlign === 'right' ? rect.right : rect.left;
  const maxWidth = Math.max(24, rect.width);
  const lines = tag === 'h1' || tag === 'h2' || element.classList.contains('scroll-story-kicker') || isButton
    ? text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
    : wrapText(context, text, maxWidth);
  const blockHeight = lines.length * lineHeight;
  let y = rect.top + Math.max(0, (rect.height - blockHeight) / 2) + fontSize * 0.86;

  lines.forEach((line) => {
    context.fillText(line, x, y, maxWidth);
    y += lineHeight;
  });

  context.restore();
}

function getRenderedTextLines(element) {
  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || 20;
  const tolerance = Math.max(3, Math.min(18, lineHeight * 0.38));
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        return node.nodeValue && node.nodeValue.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );
  const range = document.createRange();
  const lines = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue || '';
    const matcher = /\S+\s*/g;
    let match = matcher.exec(value);

    while (match) {
      const token = match[0];
      const visibleText = token.replace(/\s+/g, ' ');
      range.setStart(node, match.index);
      range.setEnd(node, match.index + token.length);

      const rect = Array.from(range.getClientRects())
        .find((candidate) => candidate.width > 0 && candidate.height > 0);

      if (rect && visibleText.trim()) {
        addRenderedTokenLine(lines, visibleText, rect, tolerance);
      }

      match = matcher.exec(value);
    }
  }

  range.detach?.();

  return lines
    .sort((a, b) => (a.top === b.top ? a.left - b.left : a.top - b.top))
    .map((line) => ({
      text: line.text.replace(/\s+/g, ' ').trim(),
      left: line.left,
      top: line.top,
      height: line.bottom - line.top
    }))
    .filter((line) => line.text);
}

function addRenderedTokenLine(lines, text, rect, tolerance) {
  const center = rect.top + rect.height / 2;
  let line = lines.find((candidate) => Math.abs(candidate.center - center) <= tolerance);

  if (!line) {
    line = {
      text: '',
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      center
    };
    lines.push(line);
  }

  line.text += text;
  line.left = Math.min(line.left, rect.left);
  line.top = Math.min(line.top, rect.top);
  line.right = Math.max(line.right, rect.right);
  line.bottom = Math.max(line.bottom, rect.bottom);
  line.center = (line.top + line.bottom) / 2;
}

function wrapText(context, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function createAppleGlassMaterial(sceneTexture) {
  return new THREE.ShaderMaterial({
    name: 'AppleGlassRefraction',
    uniforms: {
      uSceneTexture: { value: sceneTexture },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uLensCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uLensAxisX: { value: new THREE.Vector2(1, 0) },
      uLensAxisY: { value: new THREE.Vector2(0, 1) },
      uLensRadius: { value: 120 },
      uLensRadiusX: { value: 120 },
      uLensRadiusY: { value: 120 },
      uMagnification: { value: 1.24 },
      uDistortion: { value: 1 },
      uOpticalStrength: { value: 1 },
      uOpacity: { value: 1 },
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec3 vNormalW;
      varying vec3 vViewDirW;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDirW = normalize(cameraPosition - worldPosition.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uSceneTexture;
      uniform vec2 uResolution;
      uniform vec2 uLensCenter;
      uniform vec2 uLensAxisX;
      uniform vec2 uLensAxisY;
      uniform float uLensRadius;
      uniform float uLensRadiusX;
      uniform float uLensRadiusY;
      uniform float uMagnification;
      uniform float uDistortion;
      uniform float uOpticalStrength;
      uniform float uOpacity;
      uniform float uTime;

      varying vec3 vNormalW;
      varying vec3 vViewDirW;

      vec2 screenToTexture(vec2 screen) {
        vec2 uv = screen / uResolution;
        uv.y = 1.0 - uv.y;
        return clamp(uv, vec2(0.001), vec2(0.999));
      }

      void main() {
        vec2 frag = gl_FragCoord.xy;
        vec2 screenDelta = frag - uLensCenter;
        vec2 delta = vec2(
          dot(screenDelta, uLensAxisX) / max(uLensRadiusX, 1.0),
          dot(screenDelta, uLensAxisY) / max(uLensRadiusY, 1.0)
        );
        float radius = length(delta);

        if (radius > 1.08) discard;

        float opticalStrength = clamp(uOpticalStrength, 0.0, 1.0);
        vec2 direction = radius > 0.0001 ? normalize(uLensAxisX * delta.x + uLensAxisY * delta.y) : vec2(0.0);
        float centerWeight = 1.0 - smoothstep(0.12, 0.92, radius);
        float edgeWeight = smoothstep(0.58, 1.0, radius);
        float curvature = sqrt(max(0.0, 1.0 - radius * radius));
        float opticalZoom = mix(1.0, mix(1.0, uMagnification, centerWeight), opticalStrength);
        float bend = (1.0 - curvature) * 0.09 * uDistortion * opticalStrength;
        float ripple = sin((delta.x * 2.2 - delta.y * 1.7 + uTime * 0.22) * 3.14159265) * 0.0025 * edgeWeight * opticalStrength;

        vec2 source = uLensCenter + screenDelta / opticalZoom;
        source += direction * (bend + ripple) * uLensRadius;

        vec2 uv = screenToTexture(source);
        vec2 chroma = direction * edgeWeight * 0.0028 * uDistortion * opticalStrength;

        vec3 color;
        color.r = texture2D(uSceneTexture, screenToTexture(source + chroma * uResolution)).r;
        color.g = texture2D(uSceneTexture, uv).g;
        color.b = texture2D(uSceneTexture, screenToTexture(source - chroma * uResolution)).b;

        float fresnel = pow(1.0 - max(dot(normalize(vNormalW), normalize(vViewDirW)), 0.0), 2.4);
        float rim = smoothstep(0.73, 0.98, radius) * (1.0 - smoothstep(0.985, 1.06, radius));
        float glassTint = smoothstep(0.08, 0.95, radius) * 0.1;
        vec3 tint = vec3(0.91, 1.0, 0.96);
        vec3 sheen = vec3(0.72, 1.0, 0.88) * fresnel * 0.22 + vec3(1.0) * rim * 0.13;

        color = mix(color, color * tint, glassTint);
        color = mix(color, color * 0.9, edgeWeight * 0.14 * (0.45 + opticalStrength * 0.55));
        color += sheen;

        float alpha = uOpacity * (0.58 + centerWeight * 0.08 * opticalStrength + edgeWeight * 0.08 + rim * 0.1 + fresnel * 0.06);
        gl_FragColor = vec4(color, clamp(alpha, 0.42, 0.92));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

function polishLensMaterial(node, glassMaterial) {
  const source = node.material;
  if (!source) return;

  const name = source.name || node.name || '';

  if (/glass/i.test(name)) {
    node.material = glassMaterial;
    return;
  }

  if (/metal/i.test(name)) {
    node.material = new THREE.MeshPhysicalMaterial({
      name: source.name || 'Metal',
      color: new THREE.Color(0x756e62),
      metalness: 1,
      roughness: 0.045,
      side: THREE.DoubleSide,
      envMapIntensity: 3.45,
      clearcoat: 1,
      clearcoatRoughness: 0.03
    });
    return;
  }

  if (/black/i.test(name)) {
    node.material = new THREE.MeshPhysicalMaterial({
      name: source.name || 'Black',
      color: source.color?.clone?.() ?? new THREE.Color(0x050505),
      metalness: 0.08,
      roughness: 0.18,
      side: THREE.DoubleSide,
      envMapIntensity: 1.85,
      clearcoat: 1,
      clearcoatRoughness: 0.045
    });
  }
}

function emptyLensState(width, height) {
  return {
    p: 0,
    x: width / 2,
    y: height / 2,
    size: 0,
    radius: 0,
    modelOpacity: 0,
    glassOpacity: 0,
    maskScale: 0.92,
    magnification: 1,
    distortion: 0,
    angle: 0,
    faceX: Math.PI / 2,
    faceY: 0,
    faceZ: 0,
    modelOffsetX: 0,
    modelOffsetY: 0,
    target: null
  };
}

function createStudioEnvironment(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext('2d');

  const base = context.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, '#ffffff');
  base.addColorStop(0.22, '#f4f7f5');
  base.addColorStop(0.46, '#cfd7d2');
  base.addColorStop(0.7, '#69736d');
  base.addColorStop(1, '#1c2520');
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalCompositeOperation = 'screen';
  context.filter = 'blur(36px)';
  drawStudioBand(context, 92, -170, 250, 1400, -20, 'rgba(255,255,255,0.9)');
  drawStudioBand(context, 470, -115, 150, 1180, -13, 'rgba(255,255,255,0.66)');
  drawStudioBand(context, 855, -160, 320, 1320, -7, 'rgba(255,255,255,0.84)');
  drawStudioBand(context, 1330, -110, 210, 1240, 14, 'rgba(221,255,241,0.74)');
  drawStudioBand(context, 1765, -170, 190, 1380, 23, 'rgba(255,255,255,0.58)');

  context.filter = 'blur(10px)';
  drawStudioBand(context, 645, 430, 920, 64, -10, 'rgba(255,255,255,0.92)');
  drawStudioBand(context, 770, 515, 860, 44, -9, 'rgba(255,255,255,0.68)');
  drawStudioBand(context, 1210, 92, 520, 42, -8, 'rgba(255,255,255,0.72)');
  drawStudioBand(context, 1380, 210, 430, 32, -5, 'rgba(255,255,255,0.48)');

  context.filter = 'blur(58px)';
  const glow = context.createRadialGradient(1410, 230, 24, 1410, 230, 520);
  glow.addColorStop(0, 'rgba(173,255,221,0.64)');
  glow.addColorStop(1, 'rgba(93,255,187,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalCompositeOperation = 'source-over';
  context.filter = 'none';

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const environment = pmremGenerator.fromEquirectangular(texture).texture;
  texture.dispose();
  pmremGenerator.dispose();
  return environment;
}

function loadHdrEnvironment(renderer, scene, fallbackEnvironment) {
  const loader = new HDRLoader();
  loader.load(
    '/textures/photo-studio-01-1k.hdr',
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const environment = pmremGenerator.fromEquirectangular(texture).texture;
      scene.environment = environment;
      texture.dispose();
      pmremGenerator.dispose();
      fallbackEnvironment?.dispose?.();
    },
    undefined,
    () => {}
  );
}

function drawStudioBand(context, x, y, width, height, rotation, color) {
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.fillStyle = color;
  context.fillRect(-width / 2, -height / 2, width, height);
  context.restore();
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}
