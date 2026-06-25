import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Standalone magnifying-glass showcase used by legacy/home card variants. The
// scroll lens has its own renderer; this file keeps the reusable GLB preview
// self-contained and progressively enhanced.
const card = document.querySelector('[data-model-card]');
const canvas = document.querySelector('[data-model-canvas]');
const fallback = document.querySelector('[data-model-fallback]');

if (card && canvas) {
  initMagnifier();
}

function initMagnifier() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The model is decorative/progressive, so unsupported WebGL falls back to
  // normal page content instead of blocking navigation.
  if (!window.WebGLRenderingContext) {
    showFallback();
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
      powerPreference: 'high-performance'
    });
  } catch {
    showFallback();
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;

  const scene = new THREE.Scene();
  scene.environmentRotation.set(0, 1.15, 0);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
  camera.position.set(0, 0.04, 3.85);

  const group = new THREE.Group();
  scene.add(group);
  const modelAxis = new THREE.Group();
  group.add(modelAxis);

  const fallbackEnvironment = createStudioEnvironment(renderer);
  scene.environment = fallbackEnvironment;
  loadStudioEnvironment(renderer, scene, fallbackEnvironment);

  scene.add(new THREE.HemisphereLight(0xf7fff9, 0x223b31, 1.05));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
  keyLight.position.set(3.2, 3.2, 4.8);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x9fffd3, 0.95);
  rimLight.position.set(-2.8, 1.5, 3);
  scene.add(rimLight);

  const fillLight = new THREE.PointLight(0xc8ffe9, 0.6, 12);
  fillLight.position.set(0, -1.5, 2.4);
  scene.add(fillLight);

  const lensLight = new THREE.DirectionalLight(0xffffff, 0.82);
  lensLight.position.set(-1.8, 3.6, 2.8);
  scene.add(lensLight);

  const catchLight = new THREE.PointLight(0xffffff, 1.65, 5.2, 1.8);
  catchLight.position.set(-0.72, 1.08, 2.15);
  scene.add(catchLight);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 64),
    new THREE.MeshBasicMaterial({
      color: 0x006c49,
      transparent: true,
      opacity: 0.13,
      depthWrite: false
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.12, -1.18, -0.08);
  shadow.scale.set(1.35, 0.34, 1);
  group.add(shadow);

  let model = null;
  let spinAngle = 0;
  const baseRotation = new THREE.Euler(1.1, 0.75, -0.42);
  const loader = new GLTFLoader();

  loader.load(
    '/models/magnifying-glass.glb',
    (gltf) => {
      model = gltf.scene;
      model.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
          polishMaterial(node);
        }
      });

      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const maxAxis = Math.max(size.x, size.y, size.z) || 1;
      model.position.sub(center);
      model.scale.setScalar(4.45 / maxAxis);
      model.rotation.copy(baseRotation);

      modelAxis.add(model);
      card.classList.add('model-loaded');
      hideFallback();
      resize();
      render(0);
    },
    undefined,
    () => {
      showFallback();
    }
  );

  let previousTime = 0;
  let hoverBoost = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const needsResize = canvas.width !== width || canvas.height !== height;

    if (needsResize) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

  function render(time) {
    resize();

    const delta = Math.min(previousTime ? (time - previousTime) / 1000 : 0.016, 0.04);
    previousTime = time;
    const hovered = card.matches(':hover, :focus-visible, :focus-within');
    hoverBoost += ((hovered ? 1 : 0) - hoverBoost) * 0.08;

    if (model) {
      // Hover gently changes spin speed only; it never changes layout or focus order.
      const speed = reduceMotion ? 0 : 0.45 + hoverBoost * 0.08;
      spinAngle += delta * speed;
      model.rotation.set(baseRotation.x, baseRotation.y, baseRotation.z + spinAngle);
      shadow.material.opacity = 0.11 + Math.sin(time * 0.00085) * 0.01;
    }

    renderer.render(scene, camera);

    if (!reduceMotion) {
      requestAnimationFrame(render);
    }
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(card);
  window.addEventListener('orientationchange', resize, { passive: true });
  requestAnimationFrame(render);
}

function polishMaterial(node) {
  const source = node.material;
  if (!source) return;

  // The original GLB relies on material "cheats" for glass and metal, so we
  // preserve that intent while boosting reflections for browser rendering.
  const materialName = source.name || '';
  const material = source.clone();

  if (/glass/i.test(materialName)) {
    node.material = new THREE.MeshPhysicalMaterial({
      name: source.name,
      color: source.color?.clone?.() ?? new THREE.Color(0xe9efec),
      metalness: Math.max(source.metalness ?? 0.567, 0.62),
      roughness: Math.min(source.roughness ?? 0.014, 0.01),
      transparent: true,
      opacity: source.opacity ?? 0.73,
      depthWrite: false,
      side: THREE.DoubleSide,
      envMapIntensity: 10,
      reflectivity: 1,
      specularIntensity: 1.8,
      specularColor: new THREE.Color(0xffffff),
      clearcoat: 0.9,
      clearcoatRoughness: 0.01
    });
    return;
  }

  if (/metal/i.test(materialName)) {
    node.material = new THREE.MeshPhysicalMaterial({
      name: source.name,
      color: new THREE.Color(0x8b8479),
      metalness: 1,
      roughness: 0.12,
      envMapIntensity: 3.8,
      clearcoat: 0.65,
      clearcoatRoughness: 0.07
    });
    return;
  }

  if (/black/i.test(materialName)) {
    material.roughness = Math.min(source.roughness ?? 0.32, 0.24);
    material.envMapIntensity = 1.55;
    material.needsUpdate = true;
    node.material = material;
  }
}

function createStudioEnvironment(renderer) {
  // Canvas-generated studio bands create predictable offline reflections.
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
  drawStudioBand(context, 92, -170, 250, 1400, -20, 'rgba(255,255,255,0.98)');
  drawStudioBand(context, 470, -115, 150, 1180, -13, 'rgba(255,255,255,0.74)');
  drawStudioBand(context, 855, -160, 320, 1320, -7, 'rgba(255,255,255,0.94)');
  drawStudioBand(context, 1330, -110, 210, 1240, 14, 'rgba(221,255,241,0.74)');
  drawStudioBand(context, 1765, -170, 190, 1380, 23, 'rgba(255,255,255,0.68)');

  context.filter = 'blur(10px)';
  drawStudioBand(context, 645, 430, 920, 64, -10, 'rgba(255,255,255,0.98)');
  drawStudioBand(context, 770, 515, 860, 44, -9, 'rgba(255,255,255,0.76)');
  drawStudioBand(context, 1210, 92, 520, 42, -8, 'rgba(255,255,255,0.78)');
  drawStudioBand(context, 1380, 210, 430, 32, -5, 'rgba(255,255,255,0.56)');

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

function loadStudioEnvironment(renderer, scene, fallbackEnvironment) {
  const loader = new HDRLoader();
  loader.load(
    '/textures/photo-studio-01-1k.hdr',
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const environment = pmremGenerator.fromEquirectangular(texture).texture;
      scene.environment = environment;
      texture.dispose();
      fallbackEnvironment?.dispose?.();
      pmremGenerator.dispose();
    },
    undefined,
    () => {
      scene.environment = fallbackEnvironment;
    }
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

function showFallback() {
  card?.classList.add('model-failed');
  fallback?.classList.remove('hidden');
}

function hideFallback() {
  fallback?.classList.add('hidden');
}
