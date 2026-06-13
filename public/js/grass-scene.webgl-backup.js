import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const hero = document.querySelector('[data-grass-hero]');
const canvas = document.querySelector('[data-grass-canvas]');
const label = document.querySelector('[data-grass-label]');
const labelName = document.querySelector('[data-grass-label-name]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// World-space extent of the grass field; the cursor trail texture maps onto this rect.
const FIELD = { minX: -13, maxX: 13, minZ: -7.5, maxZ: 6.8 };

if (hero && canvas) {
  lazyBoot();
}

function lazyBoot() {
  let initialized = false;
  const boot = () => {
    if (initialized) return;
    initialized = true;
    initGrassHero();
  };

  if (!('IntersectionObserver' in window)) {
    boot();
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      boot();
    }
  }, { rootMargin: '900px 0px' });

  observer.observe(hero);
}

// Gentle mounds so the silhouette undulates instead of reading as a flat lawn.
function groundY(x, z) {
  return Math.sin(x * 0.34 + 1.6) * Math.cos(z * 0.27 - 0.7) * 0.34
    + Math.sin(x * 0.12 - 0.4) * 0.26
    + Math.cos(z * 0.42 + x * 0.17) * 0.16
    - 0.22;
}

function initGrassHero() {
  if (!hasWebGLSupport()) {
    hero.classList.add('grass-webgl-failed');
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
  } catch {
    hero.classList.add('grass-webgl-failed');
    return;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(getPixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.34;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  const lookTarget = new THREE.Vector3(0, -0.85, -0.9);
  const cameraBase = new THREE.Vector3(0, 4.15, 8.0);

  const pointer = new THREE.Vector2(99, 99);
  const pointerSmooth = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  const cursorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.45);
  const cursorWorld = new THREE.Vector3(0, 0, 0);
  const cursorSmooth = new THREE.Vector3(0, 0, 0);
  const cursorPrev = new THREE.Vector3(0, 0, 0);
  let cursorSettled = false;
  let bloomStrength = 0;
  const bloomPos = new THREE.Vector2(0, 0);
  const bloomVel = new THREE.Vector2(0, 0);
  let bloomSettled = false;
  const clock = new THREE.Clock();
  const loader = new GLTFLoader();
  const props = [];
  const hitTargets = [];
  const debugEnabled = new URLSearchParams(window.location.search).has('grassDebug');
  const debugGroup = new THREE.Group();
  let hovered = null;
  let running = false;
  let frame = 0;
  let isVisible = true;
  let pointerActive = false;
  let cursorOnGround = false;
  let trailEnergy = 0; // decay counter — skip trail work when field is quiet
  const _labelAnchor = new THREE.Vector3(); // reused in updateLabel to avoid clone()

  const environment = createCinematicEnvironment(renderer);
  scene.environment = environment;
  loadHdrEnvironment(renderer, scene, environment);

  buildLighting(scene);
  if (debugEnabled) scene.add(debugGroup);

  const isCompact = window.innerWidth < 720;
  const propConfigs = isCompact ? [
    {
      id: 'iphone',
      label: 'iPhone 14 Pro',
      url: '/models/lost-props/iphone-14-pro.glb',
      x: 0.0, z: 4.6,
      rotation: new THREE.Euler(-0.74, Math.PI - 0.24, 0.06),
      maxSize: 1.05,
      sink: 0.08,
      hitSize: new THREE.Vector3(1.5, 1.4, 1.5),
      hoverLift: 0.16,
      labelHeight: 0.78,
      labelOffset: new THREE.Vector2(0, -14),
      clearance: { radius: 0.92, strength: 0.66 }
    },
    {
      id: 'airpods',
      label: 'AirPods Pro',
      url: '/models/lost-props/airpods-pro.glb',
      x: -0.82, z: 5.2,
      rotation: new THREE.Euler(-0.5, 0.95, 0.12),
      maxSize: 0.58,
      sink: 0.06,
      hitSize: new THREE.Vector3(1.2, 1.1, 1.2),
      hoverLift: 0.13,
      labelHeight: 0.55,
      labelOffset: new THREE.Vector2(0, -12),
      clearance: { radius: 0.72, strength: 0.6 }
    },
    {
      id: 'tumbler',
      label: 'Stanley Tumbler',
      url: '/models/lost-props/stanley-tumbler.glb',
      x: 0.98, z: 4.85,
      rotation: new THREE.Euler(0.2, -0.85, 0.5),
      maxSize: 1.1,
      sink: 0.1,
      hitSize: new THREE.Vector3(1.5, 1.7, 1.5),
      hoverLift: 0.14,
      labelHeight: 0.95,
      labelOffset: new THREE.Vector2(0, -14),
      clearance: { radius: 0.95, strength: 0.68 }
    }
  ] : [
    {
      id: 'airpods',
      label: 'AirPods Pro',
      url: '/models/lost-props/airpods-pro.glb',
      x: -2.1, z: 3.0,
      rotation: new THREE.Euler(-0.5, 0.95, 0.12),
      maxSize: 0.75,
      sink: 0.09,
      hitSize: new THREE.Vector3(1.35, 1.2, 1.35),
      hoverLift: 0.15,
      labelHeight: 0.35,
      labelOffset: new THREE.Vector2(115, 6),
      clearance: { radius: 0.9, strength: 0.7 }
    },
    {
      id: 'iphone',
      label: 'iPhone 14 Pro',
      url: '/models/lost-props/iphone-14-pro.glb',
      x: 0.1, z: 3.6,
      rotation: new THREE.Euler(-0.78, Math.PI - 0.24, 0.06),
      maxSize: 1.3,
      sink: 0.1,
      hitSize: new THREE.Vector3(1.3, 1.2, 1.3),
      hoverLift: 0.18,
      labelHeight: 0.3,
      labelOffset: new THREE.Vector2(165, 60),
      clearance: { radius: 1.15, strength: 0.78 }
    },
    {
      id: 'tumbler',
      label: 'Stanley Tumbler',
      url: '/models/lost-props/stanley-tumbler.glb',
      x: 2.35, z: 3.2,
      rotation: new THREE.Euler(0.2, -0.85, 0.5),
      maxSize: 1.3,
      sink: 0.13,
      hitSize: new THREE.Vector3(1.6, 1.6, 1.6),
      hoverLift: 0.15,
      labelHeight: 0.5,
      labelOffset: new THREE.Vector2(-150, 16),
      clearance: { radius: 1.15, strength: 0.75 }
    }
  ];

  const trail = createTrailField();
  const grass = createGrassField(getGrassCount(), propConfigs, trail.texture);
  scene.add(grass.mesh);
  scene.add(createGroundMesh(trail.texture));

  Promise.allSettled(propConfigs.map((config, index) => loadProp(config, index))).then(() => {
    hero.classList.add('grass-models-ready');
  });

  resize();
  hero.classList.add('grass-scene-ready');
  bindEvents();
  start();

  function loadProp(config, index) {
    return loader.loadAsync(config.url).then((gltf) => {
      const wrapper = new THREE.Group();
      const model = gltf.scene;

      model.traverse((node) => {
        if (node.isMesh) {
          node.frustumCulled = false;
          node.castShadow = true;
          node.receiveShadow = true;
          polishMaterial(node, config.id);
        }
      });

      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const maxAxis = Math.max(size.x, size.y, size.z) || 1;
      const scale = config.maxSize / maxAxis;

      model.scale.setScalar(scale);
      model.position.copy(center).multiplyScalar(-scale);

      wrapper.add(model);
      wrapper.rotation.copy(config.rotation);
      wrapper.position.set(config.x, 0, config.z);
      wrapper.updateMatrixWorld(true);

      // Rest the rotated model on the terrain, slightly sunk into the grass.
      const rested = new THREE.Box3().setFromObject(wrapper);
      const groundHeight = groundY(config.x, config.z);
      wrapper.position.y = groundHeight - rested.min.y - config.sink;

      // Feed the grass shader this item's real footprint so blades become
      // stubble underneath and tuck outward at the rim instead of slicing
      // through the visible surfaces.
      wrapper.updateMatrixWorld(true);
      const contact = new THREE.Box3().setFromObject(wrapper);
      grass.material.uniforms.uClearance.value[index].set(
        (contact.min.x + contact.max.x) / 2,
        (contact.min.z + contact.max.z) / 2,
        (contact.max.x - contact.min.x) / 2 + 0.38,
        (contact.max.z - contact.min.z) / 2 + 0.38
      );

      wrapper.userData.basePosition = wrapper.position.clone();
      wrapper.userData.baseRotation = config.rotation.clone();
      wrapper.userData.hover = 0;
      wrapper.userData.label = config.label;
      wrapper.userData.hoverLift = config.hoverLift;
      wrapper.userData.labelHeight = config.labelHeight;
      wrapper.userData.labelOffset = config.labelOffset || new THREE.Vector2(0, 0);
      scene.add(wrapper);

      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(config.hitSize.x, config.hitSize.y, config.hitSize.z),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.copy(wrapper.position);
      hit.userData.prop = wrapper;
      hitTargets.push(hit);
      scene.add(hit);

      const contactShadow = createContactShadow(config.id);
      contactShadow.position.set(config.x, groundHeight + 0.015, config.z);
      contactShadow.userData.baseOpacity = contactShadow.material.opacity;
      scene.add(contactShadow);

      const accentIntensity = config.id === 'iphone' ? 32 : config.id === 'tumbler' ? 7 : 19;
      const accent = new THREE.SpotLight(0xfff7e6, accentIntensity, 9, 0.6, 0.9, 1.7);
      accent.position.set(config.x + 0.7, 3.3, config.z + 2.4);
      accent.target = wrapper;
      scene.add(accent);
      scene.add(accent.target);

      props.push({ wrapper, hit, label: config.label, contactShadow, config });
      if (debugEnabled) addDebugHelper(config, hit);
    }).catch(() => {
      hero.classList.add(`grass-${config.id}-failed`);
    });
  }

  function bindEvents() {
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('orientationchange', resize, { passive: true });
    hero.addEventListener('pointermove', onPointerMove, { passive: true });
    hero.addEventListener('pointerdown', onPointerMove, { passive: true });
    hero.addEventListener('pointerleave', clearHover, { passive: true });
    hero.addEventListener('click', () => {
      if (hovered) window.location.href = '/search.html';
    });

    if ('IntersectionObserver' in window) {
      const visibilityObserver = new IntersectionObserver((entries) => {
        isVisible = entries.some((entry) => entry.isIntersecting);
        if (isVisible) start();
        else stop();
      }, { threshold: 0.02 });
      visibilityObserver.observe(hero);
    }
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const compact = width < 720;

    renderer.setPixelRatio(getPixelRatio());
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    cameraBase.set(0, compact ? 4.45 : 4.15, compact ? 10.6 : 8.0);
    camera.fov = compact ? 43 : 39;
    camera.position.copy(cameraBase);
    camera.updateProjectionMatrix();
    camera.lookAt(lookTarget);
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    pointerActive = true;
  }

  function clearHover() {
    pointerActive = false;
    cursorOnGround = false;
    cursorSettled = false;
    bloomSettled = false;
    hovered = null;
    pointer.set(99, 99);
    hero.classList.remove('is-hovering-prop');
    hideLabel();
  }

  function updateHover() {
    if (!pointerActive || hitTargets.length === 0) {
      hovered = null;
      hero.classList.remove('is-hovering-prop');
      return;
    }

    raycaster.setFromCamera(pointer, camera);
    cursorOnGround = Boolean(raycaster.ray.intersectPlane(cursorPlane, cursorWorld));
    const intersections = raycaster.intersectObjects(hitTargets, false);
    hovered = intersections[0]?.object?.userData?.prop || null;
    hero.classList.toggle('is-hovering-prop', Boolean(hovered));
  }

  function updateTrail(dt) {
    if (reduceMotion) return;

    const cursorActive = pointerActive && cursorOnGround;
    if (cursorActive) trailEnergy = 1.5; // seconds to keep fading after last splat
    else trailEnergy = Math.max(0, trailEnergy - dt);

    // Skip fade + GPU upload when nothing is happening and field has decayed.
    if (trailEnergy <= 0 && !hovered) return;

    trail.fade(Math.min(0.1, dt * 1.0));

    // Keep a soft permanent parting around each prop; deepen it on hover.
    props.forEach(({ wrapper }) => {
      const strength = wrapper === hovered ? 0.16 : 0.05;
      const radius = wrapper === hovered ? 1.7 : 1.25;
      const base = wrapper.userData.basePosition;
      trail.splat(base.x, base.z, radius, strength);
    });

    if (cursorActive) {
      if (!cursorSettled) {
        cursorSmooth.copy(cursorWorld);
        cursorPrev.copy(cursorWorld);
        cursorSettled = true;
      }
      cursorSmooth.lerp(cursorWorld, 0.5);
      // Stamp along the segment so fast cursor moves leave a continuous part.
      const steps = Math.min(5, Math.max(1, Math.ceil(cursorPrev.distanceTo(cursorSmooth) / 0.55)));
      for (let i = 1; i <= steps; i += 1) {
        const x = cursorPrev.x + (cursorSmooth.x - cursorPrev.x) * (i / steps);
        const z = cursorPrev.z + (cursorSmooth.z - cursorPrev.z) * (i / steps);
        trail.splat(x, z, 2.6, 0.11);
      }
      cursorPrev.copy(cursorSmooth);
    }

    trail.texture.needsUpdate = true;
  }

  function render() {
    if (!running) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();
    const time = reduceMotion ? 0 : elapsed;
    updateHover();
    updateTrail(dt);

    grass.material.uniforms.uTime.value = time;
    grass.material.uniforms.uWindStrength.value = reduceMotion ? 0.03 : 0.3;

    const bloomTarget = (pointerActive && cursorOnGround && !hovered && !reduceMotion) ? 1 : 0;
    bloomStrength += (bloomTarget - bloomStrength) * 0.14;
    if (cursorOnGround) {
      if (!bloomSettled) {
        bloomPos.set(cursorWorld.x, cursorWorld.z);
        bloomVel.set(0, 0);
        bloomSettled = true;
      }
      // Damped spring: the bloom chases the cursor with physical inertia,
      // responsive at the point but with a graceful trailing settle.
      const ax = (cursorWorld.x - bloomPos.x) * 38 - bloomVel.x * 9;
      const az = (cursorWorld.z - bloomPos.y) * 38 - bloomVel.y * 9;
      bloomVel.x += ax * dt;
      bloomVel.y += az * dt;
      bloomPos.x += bloomVel.x * dt;
      bloomPos.y += bloomVel.y * dt;
    }
    grass.material.uniforms.uCursor.value.set(bloomPos.x, bloomPos.y, bloomStrength);

    props.forEach(({ wrapper, hit, contactShadow }) => {
      const target = wrapper === hovered ? 1 : 0;
      wrapper.userData.hover += (target - wrapper.userData.hover) * 0.1;
      const h = wrapper.userData.hover;
      const basePosition = wrapper.userData.basePosition;
      const baseRotation = wrapper.userData.baseRotation;
      const lift = wrapper.userData.hoverLift;

      const bob = reduceMotion ? 0 : Math.sin(elapsed * 1.4 + basePosition.x) * 0.012 * h;
      wrapper.position.set(
        basePosition.x,
        basePosition.y + lift * h + bob,
        basePosition.z
      );
      wrapper.scale.setScalar(1 + h * 0.05);
      wrapper.rotation.set(
        baseRotation.x - h * 0.06,
        baseRotation.y + h * 0.1,
        baseRotation.z + h * 0.05
      );
      hit.position.copy(wrapper.position);

      if (contactShadow) {
        contactShadow.scale.setScalar(1 + h * 0.12);
        contactShadow.material.opacity = contactShadow.userData.baseOpacity + h * 0.1;
      }
    });

    if (!reduceMotion) {
      pointerSmooth.x += ((pointerActive ? pointer.x : 0) - pointerSmooth.x) * 0.04;
      pointerSmooth.y += ((pointerActive ? pointer.y : 0) - pointerSmooth.y) * 0.04;
      camera.position.x = cameraBase.x + Math.sin(time * 0.1) * 0.06 + pointerSmooth.x * 0.24;
      camera.position.y = cameraBase.y - pointerSmooth.y * 0.07;
      camera.lookAt(lookTarget);
    }

    renderer.render(scene, camera);
    updateLabel();
    frame = requestAnimationFrame(render);
  }

  function updateLabel() {
    if (!hovered || !label || !labelName) {
      hideLabel();
      return;
    }

    _labelAnchor.copy(hovered.userData.basePosition);
    _labelAnchor.y += hovered.userData.labelHeight ?? 0.8;
    const anchor = _labelAnchor.project(camera);

    if (anchor.z < -1 || anchor.z > 1) {
      hideLabel();
      return;
    }

    const heroRect = hero.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const offset = hovered.userData.labelOffset || new THREE.Vector2(0, 0);
    const x = canvasRect.left - heroRect.left + (anchor.x * 0.5 + 0.5) * canvasRect.width + offset.x;
    const y = canvasRect.top - heroRect.top + (-anchor.y * 0.5 + 0.5) * canvasRect.height + offset.y;
    const safeX = Math.min(Math.max(x, 96), heroRect.width - 96);
    const safeY = Math.min(Math.max(y, heroRect.height * 0.6), heroRect.height - 88);

    labelName.textContent = hovered.userData.label;
    label.style.left = `${safeX}px`;
    label.style.top = `${safeY}px`;
    label.classList.add('is-visible');
  }

  function hideLabel() {
    label?.classList.remove('is-visible');
  }

  function start() {
    if (running || !isVisible) return;
    running = true;
    clock.start();
    frame = requestAnimationFrame(render);
  }

  function stop() {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  function addDebugHelper(config, hit) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    marker.position.set(config.x, groundY(config.x, config.z), config.z);
    debugGroup.add(marker);
    const box = new THREE.BoxHelper(hit, 0x55ffc2);
    debugGroup.add(box);
  }
}

function hasWebGLSupport() {
  if (!window.WebGLRenderingContext) return false;
  const probe = document.createElement('canvas');
  const context = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!context) return false;
  context.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
}

function getPixelRatio() {
  const max = window.innerWidth < 720 ? 1.5 : 1.45;
  return Math.min(window.devicePixelRatio || 1, max);
}

function getGrassCount() {
  const width = window.innerWidth;
  const cores = navigator.hardwareConcurrency || 4;
  if (reduceMotion) return width < 720 ? 6000 : 14000;
  if (width < 520) return 11000;
  if (width < 820) return 15000;
  if (width < 1120) return 24000;
  return cores >= 8 ? 46000 : 30000;
}

// CPU-side displacement field that records cursor "parting" splats; uploaded
// as a single-channel DataTexture (no 2D-canvas readback stalls). Fades a
// little each frame so the grass springs back slowly.
function createTrailField() {
  const size = 192;
  const data = new Uint8Array(size * size);

  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  const spanX = FIELD.maxX - FIELD.minX;
  const spanZ = FIELD.maxZ - FIELD.minZ;

  function fade(amount) {
    const keep = 1 - amount;
    for (let i = 0; i < data.length; i += 1) {
      const v = data[i];
      if (v !== 0) data[i] = (v * keep) | 0;
    }
  }

  function splat(x, z, radiusWorld, strength) {
    const px = ((x - FIELD.minX) / spanX) * size;
    const py = ((z - FIELD.minZ) / spanZ) * size;
    const pr = Math.max(2, (radiusWorld / spanX) * size);
    const x0 = Math.max(0, Math.floor(px - pr));
    const x1 = Math.min(size - 1, Math.ceil(px + pr));
    const y0 = Math.max(0, Math.floor(py - pr));
    const y1 = Math.min(size - 1, Math.ceil(py + pr));
    const add = strength * 255;
    for (let yy = y0; yy <= y1; yy += 1) {
      const row = yy * size;
      const dy = (yy - py) / pr;
      for (let xx = x0; xx <= x1; xx += 1) {
        const dx = (xx - px) / pr;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;
        const falloff = (1 - d2) * (1 - d2);
        const next = data[row + xx] + add * falloff;
        data[row + xx] = next > 255 ? 255 : next | 0;
      }
    }
  }

  return { texture, fade, splat };
}

function createGrassField(count, propConfigs, trailTexture) {
  const rows = 5;
  const positions = [];
  const indices = [];

  for (let i = 0; i <= rows; i += 1) {
    const y = i / rows;
    positions.push(-0.5, y, 0, 0.5, y, 0);
  }

  for (let i = 0; i < rows; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);

  const offsets = new Float32Array(count * 3);
  const data1 = new Float32Array(count * 4); // height, width, phase, curve
  const data2 = new Float32Array(count * 4); // leanX, leanZ, hue, ao

  // Tuft centers: blades cluster around them and lean outward like fountains.
  const clumpCount = Math.max(70, Math.floor(count / 24));
  const clumps = [];
  for (let i = 0; i < clumpCount; i += 1) {
    clumps.push({
      x: FIELD.minX + Math.random() * (FIELD.maxX - FIELD.minX),
      z: FIELD.minZ + Math.pow(Math.random(), 0.82) * (FIELD.maxZ - FIELD.minZ),
      radius: 0.45 + Math.random() * 1.05,
      heightBias: 0.82 + Math.random() * 0.5,
      hueBias: Math.random()
    });
  }

  for (let i = 0; i < count; i += 1) {
    const ix = i * 3;
    const ip = i * 4;

    let x;
    let z;
    let clump = null;
    if (Math.random() < 0.78) {
      clump = clumps[(Math.random() * clumpCount) | 0];
      const angle = Math.random() * Math.PI * 2;
      const distance = (Math.random() + Math.random()) * 0.5 * clump.radius;
      x = clump.x + Math.cos(angle) * distance;
      z = clump.z + Math.sin(angle) * distance;
    } else {
      x = FIELD.minX + Math.random() * (FIELD.maxX - FIELD.minX);
      z = FIELD.minZ + Math.pow(Math.random(), 0.82) * (FIELD.maxZ - FIELD.minZ);
    }
    x = Math.min(FIELD.maxX, Math.max(FIELD.minX, x));
    z = Math.min(FIELD.maxZ, Math.max(FIELD.minZ, z));

    // Taller toward the back so the far silhouette stays interesting.
    const farBoost = 1 + Math.max(0, (-z - 2.0) / 6) * 0.22;
    const heightBias = clump ? clump.heightBias : 0.85 + Math.random() * 0.4;
    let height = (0.55 + Math.random() * 0.65) * heightBias * farBoost;
    let width = 0.014 + Math.random() * 0.017;

    // Fountain lean: away from the tuft core, plus jitter.
    let leanX = (Math.random() - 0.5) * 0.3;
    let leanZ = (Math.random() - 0.5) * 0.3;
    if (clump) {
      const dx = x - clump.x;
      const dz = z - clump.z;
      const d = Math.hypot(dx, dz) || 1;
      const spread = 0.1 + (d / clump.radius) * 0.26;
      leanX += (dx / d) * spread;
      leanZ += (dz / d) * spread;
    }

    const hueBias = clump ? clump.hueBias : Math.random();
    const hue = Math.min(1, Math.max(0, hueBias * 0.65 + Math.random() * 0.45));
    let ao = 0.5 + Math.random() * 0.5;

    // Underlayer fill: short, wide, dark blades that carpet the root level
    // so no bare ground shows between the tall strands.
    if (Math.random() < 0.38) {
      height *= 0.42 + Math.random() * 0.18;
      width *= 2.4;
      ao *= 0.45;
    }

    offsets[ix] = x;
    offsets[ix + 1] = groundY(x, z);
    offsets[ix + 2] = z;
    data1[ip] = height;
    data1[ip + 1] = width;
    data1[ip + 2] = Math.random() * Math.PI * 2;
    data1[ip + 3] = 0.12 + Math.random() * 0.5;
    data2[ip] = leanX;
    data2[ip + 1] = leanZ;
    data2[ip + 2] = hue;
    data2[ip + 3] = ao;
  }

  // Placeholder ellipses; each prop overwrites its slot with measured
  // bounds once the GLB has loaded and been staged on the terrain.
  const clearances = [];
  for (let i = 0; i < 3; i += 1) {
    clearances.push(new THREE.Vector4(999, 999, 0.001, 0.001));
  }

  geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute('aData1', new THREE.InstancedBufferAttribute(data1, 4));
  geometry.setAttribute('aData2', new THREE.InstancedBufferAttribute(data2, 4));
  geometry.instanceCount = count;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWindStrength: { value: 0.3 },
      uTrail: { value: trailTexture },
      uTexel: { value: new THREE.Vector2(1 / 192, 1 / 192) },
      uFieldMin: { value: new THREE.Vector2(FIELD.minX, FIELD.minZ) },
      uFieldSize: { value: new THREE.Vector2(FIELD.maxX - FIELD.minX, FIELD.maxZ - FIELD.minZ) },
      uClearance: { value: clearances },
      uPool: { value: new THREE.Vector4(0, 3.2, 10.0, 0.24) },
      uCursor: { value: new THREE.Vector3(999, 999, 0) },
      uBloomRadius: { value: 2.3 },
      uFogColor: { value: new THREE.Color(0x020400) },
      uFogK: { value: 0.088 }
    },
    vertexShader: `
      attribute vec3 aOffset;
      attribute vec4 aData1;
      attribute vec4 aData2;
      uniform float uTime;
      uniform float uWindStrength;
      uniform sampler2D uTrail;
      uniform vec2 uTexel;
      uniform vec2 uFieldMin;
      uniform vec2 uFieldSize;
      uniform vec4 uClearance[3];
      uniform vec4 uPool;
      uniform vec3 uCursor;
      uniform float uBloomRadius;
      uniform float uFogK;
      varying vec3 vColor;
      varying float vFade;
      varying float vEdge;

      void main() {
        float t = position.y;
        float tip = t * t;
        float height = aData1.x;
        float bladeWidth = aData1.y;
        float phase = aData1.z;
        float curve = aData1.w;
        vec2 lean = aData2.xy;
        float hue = aData2.z;
        float ao = aData2.w;

        vec2 base = aOffset.xz;
        vec2 uv = (base - uFieldMin) / uFieldSize;

        // Cursor trail: strength + gradient direction (push away from peak).
        float press = texture2D(uTrail, uv).r;
        float px1 = texture2D(uTrail, uv + vec2(uTexel.x * 2.0, 0.0)).r;
        float pz1 = texture2D(uTrail, uv + vec2(0.0, uTexel.y * 2.0)).r;
        vec2 grad = vec2(px1 - press, pz1 - press);
        float gradLen = length(grad);
        vec2 pushDir = gradLen > 0.0005 ? -grad / gradLen : vec2(0.0);
        press = smoothstep(0.03, 0.85, press);

        // Contact clearings from each item's measured bounds (cx, cz, rx, rz):
        // stubble directly underneath, blades shorten and tuck outward at the
        // rim so grass surrounds the items without crossing their surfaces.
        float clearing = 0.0;
        vec2 clearDir = vec2(0.0);
        for (int i = 0; i < 3; i++) {
          vec2 delta = base - uClearance[i].xy;
          vec2 radii = max(uClearance[i].zw, vec2(0.001));
          vec2 shaped = delta / radii;
          shaped.y *= shaped.y > 0.0 ? 0.45 : 1.0;
          float dn = length(shaped);
          float local = 1.0 - smoothstep(0.5, 1.5, dn);
          if (local > clearing) {
            clearing = local;
            clearDir = normalize(delta + vec2(0.0008));
          }
        }
        float occl = smoothstep(0.35, 0.9, clearing);
        // Inside the contact zone blades comb outward and the wind lets go,
        // so they tuck around the item instead of arcing across its face.
        lean = mix(lean, clearDir * (length(lean) + 0.2), clearing);

        vec3 pos;
        pos.x = position.x * bladeWidth * (1.0 - t * 0.94);
        pos.y = t * height;
        pos.z = 0.0;

        // Per-blade lean + curvature (fountain-shaped tufts).
        pos.xz += lean * (t * 0.3 + tip * 1.05) + lean * curve * tip;

        // Wind: slow gusts + faster flutter, strongest at the tip.
        float gustA = sin(uTime * 0.8 + dot(base, vec2(0.3, 0.22)));
        float gustB = sin(uTime * 1.7 + phase + dot(base, vec2(0.1, 0.34))) * 0.5;
        float flutter = sin(uTime * 3.4 + phase * 1.9) * 0.12;
        vec2 windDir = vec2(0.86, 0.5);
        pos.xz += windDir * (gustA + gustB + flutter) * tip * uWindStrength * (1.0 - clearing * 0.85);

        // Live cursor bloom: soft radial splay centered exactly on the
        // cursor. Blades at the very center fan along their own lean so the
        // middle reads as a dense dark starburst, never an empty hole.
        vec2 bd = base - uCursor.xy;
        float bdist = length(bd);
        float bnorm = clamp(bdist / uBloomRadius, 0.0, 1.0);
        float bloom = (1.0 - bnorm * bnorm * (3.0 - 2.0 * bnorm)) * uCursor.z;
        vec2 bdir = bdist > 0.14 ? bd / bdist : normalize(lean + vec2(0.001, 0.0));
        pos.xz += bdir * bloom * (2.5 * tip + 0.45 * t);
        pos.y *= 1.0 - bloom * 0.16 * t;

        // Fading wake: presses gently, never to bare ground.
        pos.y *= 1.0 - press * 0.3 * (0.3 + 0.42 * t);
        // Item contact: collapse to stubble under the prop, tuck out at rim.
        pos.y *= mix(1.0, 0.08, occl);
        pos.y *= 1.0 - clearing * 0.72 * t;
        pos.xz += pushDir * press * (1.1 * tip + 0.2 * t);
        pos.xz += clearDir * clearing * 1.8 * tip;

        vec3 world = vec3(pos.x + aOffset.x, pos.y + aOffset.y, pos.z + aOffset.z);

        // Color: distinct bands per v2.3 spec.
        // Values are pre-ACES linear — must be high enough to survive
        // ACES FilmicToneMapping at exposure 1.34 (which heavily compresses).
        // Calibrated so on-screen samples hit:
        //   tips ~#b0a234, body ~#032e00 range, root near-black.
        vec3 rootCol = vec3(0.0, 0.003, 0.0);
        vec3 bodyCol = vec3(0.001, 0.032, 0.0);
        // tipCol needs to be >>1 in linear to survive ACES compression
        vec3 tipCol = vec3(1.6, 1.35, 0.17);
        // Band transitions: 0-10% root, 10-60% body, 60-100% tip blend
        vec3 col = mix(rootCol, bodyCol, smoothstep(0.0, 0.1, t));
        col = mix(col, bodyCol, smoothstep(0.1, 0.6, t));
        col = mix(col, tipCol, smoothstep(0.6, 1.0, t));
        // Per-blade brightness jitter only (0.8-1.15), hue stays consistent
        float bv = 0.8 + hue * 0.35;
        col *= mix(0.62, 1.0, ao) * bv;

        // Reduced backlight (~30% of old) on the upper third — subtle rim only.
        col += vec3(0.18, 0.15, 0.02) * pow(t, 3.0);

        // Crater interiors: near-black green core (#001b00..#1e261a target).
        // pressMix raised to 0.96 at center for very dark core.
        float pressMix = clamp(max(press * 0.75, bloom * 0.96), 0.0, 0.96);
        vec3 pressedCol = vec3(0.0, 0.008, 0.001) * (0.4 + 0.6 * t);
        col = mix(col, pressedCol, pressMix);
        // Minimal ring (<=0.05) where bloom edge tips catch light.
        float ring = smoothstep(0.4, 0.68, bnorm) * (1.0 - smoothstep(0.68, 1.0, bnorm)) * uCursor.z;
        col += tipCol * ring * 0.05 * t;
        col *= 1.0 - clearing * 0.2;

        // Cinematic pool of light: neutral brightness multiplier only (no warm tint).
        float poolDist = distance(world.xz, uPool.xy);
        float pool = mix(uPool.w, 1.95, smoothstep(uPool.z, uPool.z * 0.16, poolDist));
        col *= pool;

        vColor = col;
        vEdge = position.x * 2.0;
        vec4 mv = modelViewMatrix * vec4(world, 1.0);
        float dist = max(0.0, -mv.z);
        vFade = 1.0 - exp(-pow(dist * uFogK, 2.0));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uFogColor;
      varying vec3 vColor;
      varying float vFade;
      varying float vEdge;

      void main() {
        // Cheap cylindrical shading across the blade width.
        float side = 0.78 + 0.3 * (1.0 - abs(vEdge));
        vec3 color = vColor * side;
        color = mix(color, uFogColor, vFade);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}

// Terrain-following floor tinted like the blade roots, with the same light
// pool, wake darkening, and fog, so gaps between blades read as shadowed
// grass depth instead of bare void.
function createGroundMesh(trailTexture) {
  const geometry = new THREE.PlaneGeometry(34, 26, 72, 56);
  geometry.rotateX(-Math.PI / 2);
  const positionAttr = geometry.attributes.position;
  for (let i = 0; i < positionAttr.count; i += 1) {
    const x = positionAttr.getX(i);
    const z = positionAttr.getZ(i);
    positionAttr.setY(i, groundY(x, z) - 0.05);
  }
  positionAttr.needsUpdate = true;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTrail: { value: trailTexture },
      uFieldMin: { value: new THREE.Vector2(FIELD.minX, FIELD.minZ) },
      uFieldSize: { value: new THREE.Vector2(FIELD.maxX - FIELD.minX, FIELD.maxZ - FIELD.minZ) },
      uPool: { value: new THREE.Vector4(0, 3.2, 10.0, 0.24) },
      uFogColor: { value: new THREE.Color(0x020400) },
      uFogK: { value: 0.088 }
    },
    vertexShader: `
      uniform float uFogK;
      varying vec3 vWorld;
      varying float vFade;

      void main() {
        vWorld = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = max(0.0, -mv.z);
        vFade = 1.0 - exp(-pow(dist * uFogK, 2.0));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uTrail;
      uniform vec2 uFieldMin;
      uniform vec2 uFieldSize;
      uniform vec4 uPool;
      uniform vec3 uFogColor;
      varying vec3 vWorld;
      varying float vFade;

      void main() {
        vec2 uv = clamp((vWorld.xz - uFieldMin) / uFieldSize, 0.0, 1.0);
        float press = texture2D(uTrail, uv).r;
        vec3 col = vec3(0.016, 0.05, 0.008);
        float poolDist = distance(vWorld.xz, uPool.xy);
        float pool = mix(uPool.w, 1.6, smoothstep(uPool.z, uPool.z * 0.16, poolDist));
        col *= vec3(pool * 0.97, pool, pool * 0.7);
        col = mix(col, vec3(0.018, 0.06, 0.01), press * 0.6);
        gl_FragColor = vec4(mix(col, uFogColor, vFade), 1.0);
      }
    `
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

function buildLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xdcf5c0, 0x081406, 0.5);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffe9b0, 2.7);
  key.position.set(-4.2, 7.4, 4.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 22;
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.bias = -0.0004;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xbfffd9, 1.5);
  rim.position.set(5.2, 3.6, -5.4);
  scene.add(rim);

  const fill = new THREE.PointLight(0xfff6e0, 1.2, 9.5, 1.8);
  fill.position.set(0.4, 2.6, 4.6);
  scene.add(fill);
}

function polishMaterial(node, propId = '') {
  const source = node.material;
  if (!source) return;

  let material = source.clone();
  const name = `${source.name || ''} ${node.name || ''}`.toLowerCase();

  // Never force DoubleSide: it was making the iPhone's interior (rear cameras)
  // visible through the front glass. Blend-transparent or transmissive
  // (KHR_materials_transmission) surfaces also reveal the internals and the
  // grass behind the prop, so force everything fully opaque.
  const wasSeeThrough = material.transparent
    || ('transmission' in material && material.transmission > 0)
    || (material.opacity ?? 1) < 1;
  if (wasSeeThrough) {
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    if ('transmission' in material) material.transmission = 0;
    if ('thickness' in material) material.thickness = 0;
    if ('roughness' in material) material.roughness = Math.min(material.roughness ?? 0.3, 0.1);
  }
  material.depthWrite = true;

  if ('envMapIntensity' in material) material.envMapIntensity = Math.max(material.envMapIntensity || 0, 1.9);

  if (propId === 'tumbler') {
    if ('roughness' in material) material.roughness = Math.min(material.roughness ?? 0.6, 0.32);
    if ('metalness' in material) material.metalness = Math.max(material.metalness || 0, 0.12);
    if ('clearcoat' in material) material.clearcoat = Math.max(material.clearcoat || 0, 0.55);
    if ('clearcoatRoughness' in material) material.clearcoatRoughness = 0.12;
    if ('envMapIntensity' in material) material.envMapIntensity = 1.7;
  }

  if (propId === 'iphone') {
    if (name.includes('screen') || name.includes('display') || name.includes('glass') || name.includes('front')) {
      if ('color' in material && !material.map) material.color.set(0x05060a);
      if ('roughness' in material) material.roughness = 0.05;
      if ('metalness' in material) material.metalness = Math.max(material.metalness || 0, 0.2);
      if ('envMapIntensity' in material) material.envMapIntensity = 3.6;
      if ('clearcoat' in material) material.clearcoat = 1;
      if ('clearcoatRoughness' in material) material.clearcoatRoughness = 0.04;
    } else {
      if ('roughness' in material) material.roughness = Math.min(material.roughness ?? 0.4, 0.24);
      if ('metalness' in material && material.metalness > 0.4) material.metalness = Math.max(material.metalness, 0.85);
      if ('envMapIntensity' in material) material.envMapIntensity = 2.6;
    }
  }

  if (propId === 'airpods') {
    if ('roughness' in material) material.roughness = 0.07;
    if ('metalness' in material) material.metalness = Math.min(material.metalness || 0, 0.06);
    if ('envMapIntensity' in material) material.envMapIntensity = 3.4;
    if ('clearcoat' in material) material.clearcoat = 1;
    if ('clearcoatRoughness' in material) material.clearcoatRoughness = 0.05;
  }

  node.material = material;
}

function createContactShadow(propId) {
  const texture = createRadialShadowTexture();
  const size = propId === 'tumbler' ? 2.0 : propId === 'iphone' ? 1.9 : 1.45;
  const opacity = propId === 'tumbler' ? 0.32 : propId === 'iphone' ? 0.3 : 0.26;
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity,
      depthWrite: false,
      color: 0x020503
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 2;
  return shadow;
}

function createRadialShadowTexture() {
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const context = shadowCanvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 10, 128, 128, 124);
  gradient.addColorStop(0, 'rgba(0,0,0,0.82)');
  gradient.addColorStop(0.42, 'rgba(0,0,0,0.38)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(shadowCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createCinematicEnvironment(renderer) {
  const envCanvas = document.createElement('canvas');
  envCanvas.width = 1536;
  envCanvas.height = 768;
  const context = envCanvas.getContext('2d');

  const base = context.createLinearGradient(0, 0, 0, envCanvas.height);
  base.addColorStop(0, '#ffffff');
  base.addColorStop(0.18, '#eaffdc');
  base.addColorStop(0.38, '#6f8f68');
  base.addColorStop(0.7, '#122018');
  base.addColorStop(1, '#020403');
  context.fillStyle = base;
  context.fillRect(0, 0, envCanvas.width, envCanvas.height);

  context.globalCompositeOperation = 'screen';
  context.filter = 'blur(28px)';
  drawBand(context, 80, 86, 620, 56, -8, 'rgba(255,255,255,0.88)');
  drawBand(context, 520, 148, 940, 68, 6, 'rgba(255,255,255,0.58)');
  drawBand(context, 910, 280, 640, 58, 10, 'rgba(182,255,173,0.42)');
  drawBand(context, 1080, 76, 420, 42, -14, 'rgba(255,244,207,0.62)');
  context.filter = 'blur(76px)';
  context.fillStyle = 'rgba(129, 220, 104, 0.36)';
  context.fillRect(470, 500, 650, 170);
  context.globalCompositeOperation = 'source-over';
  context.filter = 'none';

  const texture = new THREE.CanvasTexture(envCanvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(texture).texture;
  texture.dispose();
  pmrem.dispose();
  return environment;
}

function loadHdrEnvironment(renderer, scene, fallbackEnvironment) {
  const loader = new HDRLoader();
  loader.load(
    '/textures/photo-studio-01-1k.hdr',
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const environment = pmrem.fromEquirectangular(texture).texture;
      scene.environment = environment;
      texture.dispose();
      fallbackEnvironment?.dispose?.();
      pmrem.dispose();
    },
    undefined,
    () => {
      scene.environment = fallbackEnvironment;
    }
  );
}

function drawBand(context, x, y, width, height, rotation, color) {
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.fillStyle = color;
  context.fillRect(-width / 2, -height / 2, width, height);
  context.restore();
}
