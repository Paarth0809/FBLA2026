// Cinematic grass hero — WebGPU + TSL port of the "Digital Oasis" reference.
// Renders ONLY into the post-scroll hero canvas. The scroll story and the
// magnifying-glass scroll lens live in separate files/canvases and are not
// touched here. Grass settings are kept verbatim from the reference; we add
// the lost-item props, hover labels, reduced-motion + visibility handling, and
// sizing into the hero element instead of a fullscreen canvas.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, float, vec3, instancedArray, instanceIndex, uv,
  positionGeometry, positionWorld, sin, cos, pow, smoothstep, mix,
  sqrt, select, hash, time, deltaTime, PI, mx_noise_float,
  pass, mrt, output, transformedNormalView, uniformArray,
} from 'three/tsl';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { GLTFLoader } from '/vendor/three-gpu-addons/loaders/GLTFLoader.js';

const hero = document.querySelector('[data-grass-hero]');
const canvas = document.querySelector('[data-grass-canvas]');
const label = document.querySelector('[data-grass-label]');
const labelName = document.querySelector('[data-grass-label-name]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const debugEnabled = new URLSearchParams(window.location.search).has('grassDebug');

if (hero && canvas) {
  lazyBoot();
}

function lazyBoot() {
  let initialized = false;
  const boot = () => {
    if (initialized) return;
    initialized = true;
    initGrassHero().catch(() => hero.classList.add('grass-webgl-failed'));
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

async function initGrassHero() {
  if (!navigator.gpu) {
    // No WebGPU — keep the CSS fallback gradient rather than a blank canvas.
    hero.classList.add('grass-webgl-failed');
    return;
  }

  // ─── Reference constants (verbatim) ───────────────────────────────────────
  const BLADE_COUNT = 120000;
  const FIELD_SIZE = 30;
  const BACKGROUND_HEX = '#000000';
  const GROUND_HEX = '#000000';
  const BLADE_BASE_HEX = '#0e1e04';
  const BLADE_TIP_HEX = '#c8b840';

  const skyColors = {
    top: new THREE.Color('#000000'),
    midHigh: new THREE.Color('#000000'),
    midLow: new THREE.Color('#000000'),
    horizon: new THREE.Color('#000000'),
  };

  function buildSkyTexture() {
    const w = 2, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, '#' + skyColors.top.getHexString());
    grad.addColorStop(0.35, '#' + skyColors.midHigh.getHexString());
    grad.addColorStop(0.65, '#' + skyColors.midLow.getHexString());
    grad.addColorStop(1.0, '#' + skyColors.horizon.getHexString());
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function buildPropReflectionTexture() {
    const w = 1024, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0.0, '#010201');
    base.addColorStop(0.24, '#102014');
    base.addColorStop(0.44, '#dcefc6');
    base.addColorStop(0.52, '#f6f9ef');
    base.addColorStop(0.62, '#223615');
    base.addColorStop(1.0, '#010201');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    const sideBands = ctx.createLinearGradient(0, 0, w, 0);
    sideBands.addColorStop(0.0, 'rgba(255,255,255,0.28)');
    sideBands.addColorStop(0.16, 'rgba(198,237,148,0.12)');
    sideBands.addColorStop(0.36, 'rgba(0,0,0,0)');
    sideBands.addColorStop(0.64, 'rgba(0,0,0,0)');
    sideBands.addColorStop(0.86, 'rgba(198,237,148,0.12)');
    sideBands.addColorStop(1.0, 'rgba(255,255,255,0.24)');
    ctx.fillStyle = sideBands;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(0, h * 0.46, w, 16);
    ctx.fillStyle = 'rgba(214,244,157,0.18)';
    ctx.fillRect(0, h * 0.34, w, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(0, h * 0.66, w, 7);
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  const scene = new THREE.Scene();
  scene.background = buildSkyTexture();
  scene.fog = new THREE.FogExp2('#000000', 0.035);
  const propReflectionMap = buildPropReflectionTexture();

  const rect0 = hero.getBoundingClientRect();
  const camera = new THREE.PerspectiveCamera(38, Math.max(0.1, rect0.width / rect0.height), 0.1, 100);
  camera.position.set(0, 8, 18);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
  const isMobile = rect0.width < 768;
  renderer.setPixelRatio(getPixelRatio());
  renderer.setSize(Math.max(1, rect0.width), Math.max(1, rect0.height), false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  await renderer.init();

  // ─── GPU buffers ──────────────────────────────────────────────────────────
  const bladeData = instancedArray(BLADE_COUNT, 'vec4');
  const bendState = instancedArray(BLADE_COUNT, 'vec4');
  const bladeBound = instancedArray(BLADE_COUNT, 'float');

  // ─── Uniforms (verbatim) ──────────────────────────────────────────────────
  const mouseWorld = uniform(new THREE.Vector3(99999, 0, 99999));
  const mouseRadius = uniform(6.1);
  const mouseStrength = uniform(1.1);
  const outerRadius = uniform(9.4);
  const outerStrength = uniform(0.35);
  const wakeWorld = uniform(new THREE.Vector3(99999, 0, 99999));
  const wakeAmount = uniform(0.0);
  const wakeRadius = uniform(5.1);
  const wakeStrength = uniform(3.25);
  const wakeOuterRadius = uniform(8.8);
  const wakeOuterStrength = uniform(1.05);
  const camSphereWorld = uniform(new THREE.Vector3(0, 0, 0));
  const camSphereRadius = uniform(15.0);
  const camSphereStrength = uniform(0.0);

  const grassDensity = uniform(1.0);
  const windSpeed = uniform(1.3);
  const windAmplitude = uniform(reduceMotion ? 0.0 : 0.21);
  const bladeWidth = uniform(4.0);
  const bladeTipWidth = uniform(0.19);
  const bladeHeight = uniform(1.6);
  const bladeHeightVariation = uniform(0.5);
  const bladeLean = uniform(1.1);
  const noiseAmplitude = uniform(1.85);
  const noiseFrequency = uniform(0.3);
  const noise2Amplitude = uniform(0.2);
  const noise2Frequency = uniform(15);
  const bladeColorVariation = uniform(0.93);
  const groundRadius = uniform(13.8);
  const groundFalloff = uniform(2.4);
  const bladeBaseColor = uniform(new THREE.Color(BLADE_BASE_HEX));
  const bladeTipColor = uniform(new THREE.Color(BLADE_TIP_HEX));
  const backgroundColor = uniform(new THREE.Color(BACKGROUND_HEX));
  const groundColor = uniform(new THREE.Color(GROUND_HEX));
  const fogStart = uniform(6.5);
  const fogEnd = uniform(12.0);
  const fogIntensity = uniform(1.0);
  const fogColor = uniform(new THREE.Color('#000000'));
  const goldenTipColor = uniform(new THREE.Color('#d4b838'));
  const greenTipColor = uniform(new THREE.Color('#4a7a14'));
  const midColor = uniform(new THREE.Color('#2d4e0e'));
  const clearanceSlots = [
    new THREE.Vector4(999, 999, 0.001, 0.001),
    new THREE.Vector4(999, 999, 0.001, 0.001),
    new THREE.Vector4(999, 999, 0.001, 0.001),
  ];
  const propClearance = uniformArray(clearanceSlots, 'vec4');
  const propSharpSlots = [
    new THREE.Vector4(999, 999, 0.001, 0.001),
    new THREE.Vector4(999, 999, 0.001, 0.001),
    new THREE.Vector4(999, 999, 0.001, 0.001),
  ];
  const propSharpMask = uniformArray(propSharpSlots, 'vec4');

  function ellipseMask(slot, uvNode, inner = 0.72, outer = 1.0) {
    const dx = uvNode.x.sub(slot.x).div(slot.z.max(0.0001));
    const dy = uvNode.y.sub(slot.y).div(slot.w.max(0.0001));
    const e = sqrt(dx.mul(dx).add(dy.mul(dy)));
    return float(1).sub(smoothstep(inner, outer, e));
  }

  // ─── DoF uniforms (verbatim) ──────────────────────────────────────────────
  const focusDistanceU = uniform(31.83);
  const focalLengthU = uniform(8.0);
  const bokehScaleU = uniform(6.25);
  const dofEnabled = !isMobile;

  // Rest focus on the lost-item plane (z≈5) so the props read sharp when idle;
  // the cursor then pulls focus around the field on pointer-move (reference).
  let mouseFocusDist = camera.position.distanceTo(new THREE.Vector3(0, 0, 5));
  let autoFocusSmoothed = mouseFocusDist;

  const noise2D = Fn(([x, z]) => mx_noise_float(vec3(x, float(0), z)).mul(0.5).add(0.5));

  // ─── Compute init ─────────────────────────────────────────────────────────
  const computeInit = Fn(() => {
    const blade = bladeData.element(instanceIndex);
    const col = instanceIndex.mod(283);
    const row = instanceIndex.div(283);
    const jx = hash(instanceIndex).sub(0.5);
    const jz = hash(instanceIndex.add(7919)).sub(0.5);
    const wx = col.toFloat().add(jx).div(float(283)).sub(0.5).mul(FIELD_SIZE);
    const wz = row.toFloat().add(jz).div(float(283)).sub(0.5).mul(FIELD_SIZE);
    blade.x.assign(wx);
    blade.y.assign(wz);
    blade.z.assign(hash(instanceIndex.add(1337)).mul(PI.mul(2)));
    const n1 = noise2D(wx.mul(noiseFrequency), wz.mul(noiseFrequency));
    const n2 = noise2D(wx.mul(noiseFrequency.mul(noise2Frequency)).add(50), wz.mul(noiseFrequency.mul(noise2Frequency)).add(50));
    const clump = n1.mul(noiseAmplitude).sub(noise2Amplitude).add(n2.mul(noise2Amplitude).mul(2)).max(0);
    blade.w.assign(clump);
    const dist = sqrt(wx.mul(wx).add(wz.mul(wz)));
    const edgeNoise = noise2D(wx.mul(0.25).add(100), wz.mul(0.25).add(100));
    const maxR = float(12.0).add(edgeNoise.sub(0.5).mul(6.0));
    const boundary = float(1).sub(smoothstep(maxR.sub(1.5), maxR, dist));
    bladeBound.element(instanceIndex).assign(select(boundary.lessThan(0.05), float(0), boundary));
  })().compute(BLADE_COUNT);

  // ─── Compute update ───────────────────────────────────────────────────────
  const computeUpdate = Fn(() => {
    const blade = bladeData.element(instanceIndex);
    const bend = bendState.element(instanceIndex);
    const bx = blade.x;
    const bz = blade.y;

    const w1 = sin(bx.mul(0.35).add(bz.mul(0.12)).add(time.mul(windSpeed)));
    const w2 = sin(bx.mul(0.18).add(bz.mul(0.28)).add(time.mul(windSpeed.mul(0.67))).add(1.7));
    const windX = w1.add(w2).mul(windAmplitude);
    const windZ = w1.sub(w2).mul(windAmplitude.mul(0.55));

    const lw = deltaTime.mul(4.0).saturate();
    bend.x.assign(mix(bend.x, windX, lw));
    bend.y.assign(mix(bend.y, windZ, lw));

    // Inner mouse push
    const dx = bx.sub(mouseWorld.x);
    const dz = bz.sub(mouseWorld.z);
    const dist = sqrt(dx.mul(dx).add(dz.mul(dz))).add(0.0001);
    const falloff = float(1).sub(dist.div(mouseRadius).saturate());
    const influence = falloff.mul(falloff).mul(mouseStrength);
    const pushX = dx.div(dist).mul(influence);
    const pushZ = dz.div(dist).mul(influence);

    // Outer mouse sphere
    const odx = bx.sub(mouseWorld.x);
    const odz = bz.sub(mouseWorld.z);
    const odist = sqrt(odx.mul(odx).add(odz.mul(odz))).add(0.0001);
    const ofalloff = float(1).sub(odist.div(outerRadius).saturate());
    const oinfluence = ofalloff.mul(ofalloff).mul(outerStrength);
    const opushX = odx.div(odist).mul(oinfluence);
    const opushZ = odz.div(odist).mul(oinfluence);

    // Delayed cursor wake: subtle direct response comes from mouseWorld;
    // this spring-smoothed field creates the physical trailing bloom.
    const wdx = bx.sub(wakeWorld.x);
    const wdz = bz.sub(wakeWorld.z);
    const wdist = sqrt(wdx.mul(wdx).add(wdz.mul(wdz))).add(0.0001);
    const wfalloff = float(1).sub(wdist.div(wakeRadius).saturate());
    const winfluence = wfalloff.mul(wfalloff).mul(wakeStrength).mul(wakeAmount);
    const wpushX = wdx.div(wdist).mul(winfluence);
    const wpushZ = wdz.div(wdist).mul(winfluence);

    const wofalloff = float(1).sub(wdist.div(wakeOuterRadius).saturate());
    const woinfluence = wofalloff.mul(wofalloff).mul(wakeOuterStrength).mul(wakeAmount);
    const wopushX = wdx.div(wdist).mul(woinfluence);
    const wopushZ = wdz.div(wdist).mul(woinfluence);

    // Camera sphere push (fixed at field center → signature central parting)
    const cdx = bx.sub(camSphereWorld.x);
    const cdz = bz.sub(camSphereWorld.z);
    const cdist = sqrt(cdx.mul(cdx).add(cdz.mul(cdz))).add(0.0001);
    const cfalloff = float(1).sub(cdist.div(camSphereRadius).saturate());
    const cinfluence = cfalloff.mul(cfalloff).mul(camSphereStrength);
    const cpushX = cdx.div(cdist).mul(cinfluence);
    const cpushZ = cdz.div(cdist).mul(cinfluence);

    const totalPushX = pushX.add(opushX).add(wpushX).add(wopushX).add(cpushX);
    const totalPushZ = pushZ.add(opushZ).add(wpushZ).add(wopushZ).add(cpushZ);

    const targetMag = sqrt(totalPushX.mul(totalPushX).add(totalPushZ.mul(totalPushZ)));
    const currentMag = sqrt(bend.z.mul(bend.z).add(bend.w.mul(bend.w)));
    const lm = select(targetMag.greaterThan(currentMag), deltaTime.mul(12.0), deltaTime.mul(1)).saturate();
    bend.z.assign(mix(bend.z, totalPushX, lm));
    bend.w.assign(mix(bend.w, totalPushZ, lm));
  })().compute(BLADE_COUNT);

  // ─── Blade geometry (verbatim) ────────────────────────────────────────────
  function createBladeGeometry() {
    const segs = 5, W = 0.055, H = 1.0;
    const verts = [], norms = [], uvArr = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, y = t * H, hw = W * 0.5 * (1.0 - t * 0.82);
      verts.push(-hw, y, 0, hw, y, 0);
      norms.push(0, 0, 1, 0, 0, 1);
      uvArr.push(0, t, 1, t);
    }
    for (let i = 0; i < segs; i++) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    geo.setIndex(idx);
    return geo;
  }

  // ─── Grass material (verbatim node graph) ─────────────────────────────────
  const grassMat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: true });

  grassMat.positionNode = Fn(() => {
    const blade = bladeData.element(instanceIndex);
    const bend = bendState.element(instanceIndex);
    const worldX = blade.x, worldZ = blade.y, rotY = blade.z;
    const boundary = bladeBound.element(instanceIndex);
    const visible = select(hash(instanceIndex.add(9999)).lessThan(grassDensity.mul(0.5)), float(1), float(0));
    const hVar = hash(instanceIndex.add(5555)).mul(bladeHeightVariation);
    const heightScale = float(0.35).add(blade.w).add(hVar).mul(boundary).mul(visible);
    const taper = float(1).sub(uv().y.mul(float(1).sub(bladeTipWidth)));
    const lx = positionGeometry.x.mul(bladeWidth).mul(taper).mul(heightScale.sign());
    const ly = positionGeometry.y.mul(heightScale).mul(bladeHeight);
    const cY = cos(rotY), sY = sin(rotY);
    const rx = lx.mul(cY), rz = lx.mul(sY);
    const t = uv().y;
    const tip = t.mul(t);

    const c0 = propClearance.element(0);
    const c1 = propClearance.element(1);
    const c2 = propClearance.element(2);
    const d0x = worldX.sub(c0.x), d0z = worldZ.sub(c0.y);
    const d1x = worldX.sub(c1.x), d1z = worldZ.sub(c1.y);
    const d2x = worldX.sub(c2.x), d2z = worldZ.sub(c2.y);
    const n0x = d0x.div(c0.z.max(0.001)), n0z = d0z.div(c0.w.max(0.001)).mul(select(d0z.greaterThan(0), float(0.26), float(1)));
    const n1x = d1x.div(c1.z.max(0.001)), n1z = d1z.div(c1.w.max(0.001)).mul(select(d1z.greaterThan(0), float(0.26), float(1)));
    const n2x = d2x.div(c2.z.max(0.001)), n2z = d2z.div(c2.w.max(0.001)).mul(select(d2z.greaterThan(0), float(0.26), float(1)));
    const e0 = sqrt(n0x.mul(n0x).add(n0z.mul(n0z)));
    const e1 = sqrt(n1x.mul(n1x).add(n1z.mul(n1z)));
    const e2 = sqrt(n2x.mul(n2x).add(n2z.mul(n2z)));
    const core0 = float(1).sub(smoothstep(0.12, 1.02, e0));
    const core1 = float(1).sub(smoothstep(0.12, 1.02, e1));
    const core2 = float(1).sub(smoothstep(0.12, 1.02, e2));
    const contact0 = float(1).sub(smoothstep(0.52, 2.08, e0));
    const contact1 = float(1).sub(smoothstep(0.52, 2.08, e1));
    const contact2 = float(1).sub(smoothstep(0.52, 2.08, e2));
    const organic = hash(instanceIndex.add(6197)).mul(0.28).add(0.86);
    const collapse = core0.max(core1).max(core2);
    const clearing = contact0.max(contact1).max(contact2);
    const occl = smoothstep(0.2, 0.88, collapse);
    const dist0 = sqrt(d0x.mul(d0x).add(d0z.mul(d0z))).add(0.0008);
    const dist1 = sqrt(d1x.mul(d1x).add(d1z.mul(d1z))).add(0.0008);
    const dist2 = sqrt(d2x.mul(d2x).add(d2z.mul(d2z))).add(0.0008);
    const clearRawX = d0x.div(dist0).mul(contact0).add(d1x.div(dist1).mul(contact1)).add(d2x.div(dist2).mul(contact2));
    const clearRawZ = d0z.div(dist0).mul(contact0).add(d1z.div(dist1).mul(contact1)).add(d2z.div(dist2).mul(contact2));
    const clearMag = sqrt(clearRawX.mul(clearRawX).add(clearRawZ.mul(clearRawZ))).add(0.0008);
    const clearDirX = select(clearMag.greaterThan(0.002), clearRawX.div(clearMag), cos(rotY));
    const clearDirZ = select(clearMag.greaterThan(0.002), clearRawZ.div(clearMag), sin(rotY));

    const bendFactor = pow(t, 1.8);
    const staticBendX = hash(instanceIndex.add(7777)).sub(0.5).mul(bladeLean);
    const staticBendZ = hash(instanceIndex.add(8888)).sub(0.5).mul(bladeLean);
    const bendDamp = float(1).sub(collapse.mul(0.78)).sub(clearing.mul(0.12)).max(0.12);
    const staticDamp = float(1).sub(collapse.mul(0.36)).sub(clearing.mul(0.16)).max(0.22);
    const bendX = staticBendX.mul(staticDamp).add(bend.x.mul(bendDamp)).add(bend.z.mul(bendDamp));
    const bendZ = staticBendZ.mul(staticDamp).add(bend.y.mul(bendDamp)).add(bend.w.mul(bendDamp));
    const relX = rx.add(bendX.mul(bendFactor).mul(bladeHeight));
    const relY = ly;
    const relZ = rz.add(bendZ.mul(bendFactor).mul(bladeHeight));
    const origLen = sqrt(rx.mul(rx).add(ly.mul(ly)).add(rz.mul(rz)));
    const newLen = sqrt(relX.mul(relX).add(relY.mul(relY)).add(relZ.mul(relZ)));
    const scale = origLen.div(newLen.max(0.0001));
    const tipX = worldX.add(relX.mul(scale));
    const tipZ = worldZ.add(relZ.mul(scale));
    const tip0x = tipX.sub(c0.x), tip0z = tipZ.sub(c0.y);
    const tip1x = tipX.sub(c1.x), tip1z = tipZ.sub(c1.y);
    const tip2x = tipX.sub(c2.x), tip2z = tipZ.sub(c2.y);
    const tn0x = tip0x.div(c0.z.max(0.001)), tn0z = tip0z.div(c0.w.max(0.001)).mul(select(tip0z.greaterThan(0), float(0.22), float(1)));
    const tn1x = tip1x.div(c1.z.max(0.001)), tn1z = tip1z.div(c1.w.max(0.001)).mul(select(tip1z.greaterThan(0), float(0.22), float(1)));
    const tn2x = tip2x.div(c2.z.max(0.001)), tn2z = tip2z.div(c2.w.max(0.001)).mul(select(tip2z.greaterThan(0), float(0.22), float(1)));
    const te0 = sqrt(tn0x.mul(tn0x).add(tn0z.mul(tn0z)));
    const te1 = sqrt(tn1x.mul(tn1x).add(tn1z.mul(tn1z)));
    const te2 = sqrt(tn2x.mul(tn2x).add(tn2z.mul(tn2z)));
    const tipHit0 = float(1).sub(smoothstep(0.78, 1.08, te0)).mul(tip);
    const tipHit1 = float(1).sub(smoothstep(0.78, 1.08, te1)).mul(tip);
    const tipHit2 = float(1).sub(smoothstep(0.78, 1.08, te2)).mul(tip);
    const tipShield = tipHit0.max(tipHit1).max(tipHit2);
    const tipDist0 = sqrt(tip0x.mul(tip0x).add(tip0z.mul(tip0z))).add(0.0008);
    const tipDist1 = sqrt(tip1x.mul(tip1x).add(tip1z.mul(tip1z))).add(0.0008);
    const tipDist2 = sqrt(tip2x.mul(tip2x).add(tip2z.mul(tip2z))).add(0.0008);
    const tipRawX = tip0x.div(tipDist0).mul(tipHit0).add(tip1x.div(tipDist1).mul(tipHit1)).add(tip2x.div(tipDist2).mul(tipHit2));
    const tipRawZ = tip0z.div(tipDist0).mul(tipHit0).add(tip1z.div(tipDist1).mul(tipHit1)).add(tip2z.div(tipDist2).mul(tipHit2));
    const tipMag = sqrt(tipRawX.mul(tipRawX).add(tipRawZ.mul(tipRawZ))).add(0.0008);
    const tipDirX = select(tipMag.greaterThan(0.002), tipRawX.div(tipMag), clearDirX);
    const tipDirZ = select(tipMag.greaterThan(0.002), tipRawZ.div(tipMag), clearDirZ);
    const contactHeight = float(1).sub(occl.mul(0.9)).sub(clearing.mul(0.32).mul(t)).sub(tipShield.mul(0.74).mul(tip)).max(0.035);
    const frontWake = smoothstep(0.0, 1.0, d0z.max(d1z).max(d2z).mul(0.7).add(0.5));
    const tuck = clearing.mul(0.4).mul(tip).add(occl.mul(0.08).mul(t)).mul(organic).mul(float(1).add(frontWake.mul(0.08)));
    const tipTuck = tipShield.mul(0.68).mul(tip).mul(organic);
    return vec3(
      worldX.add(relX.mul(scale)).add(clearDirX.mul(tuck)).add(tipDirX.mul(tipTuck)),
      relY.mul(scale).mul(contactHeight),
      worldZ.add(relZ.mul(scale)).add(clearDirZ.mul(tuck)).add(tipDirZ.mul(tipTuck))
    );
  })();

  grassMat.colorNode = Fn(() => {
    const t = uv().y;
    const clump = bladeData.element(instanceIndex).w.saturate();
    const bladeHash = hash(instanceIndex.add(4242));
    const isGolden = bladeHash.lessThan(0.4);
    const lowerGrad = smoothstep(float(0.0), float(0.45), t);
    const upperGrad = smoothstep(float(0.4), float(0.85), t);
    const tipMix = float(1).sub(bladeColorVariation).add(clump.mul(bladeColorVariation));
    const greenTip = mix(greenTipColor, bladeTipColor, tipMix);
    const warmTip = mix(greenTipColor, goldenTipColor, tipMix);
    const tipFinal = mix(greenTip, warmTip, select(isGolden, float(1), float(0)));
    const lowerColor = mix(bladeBaseColor, midColor, lowerGrad);
    const grassColor = mix(lowerColor, tipFinal, upperGrad);
    const blade = bladeData.element(instanceIndex);
    const dist = sqrt(blade.x.mul(blade.x).add(blade.y.mul(blade.y)));
    const wx = blade.x.sub(wakeWorld.x);
    const wz = blade.y.sub(wakeWorld.z);
    const wdist = sqrt(wx.mul(wx).add(wz.mul(wz))).add(0.0001);
    const bnorm = wdist.div(wakeRadius).saturate();
    const bloom = float(1).sub(bnorm.mul(bnorm).mul(float(3).sub(bnorm.mul(2)))).mul(wakeAmount);
    const ring = smoothstep(0.34, 0.72, bnorm).mul(float(1).sub(smoothstep(0.72, 1.0, bnorm))).mul(wakeAmount);
    const pressedCol = vec3(0.0, 0.028, 0.002).mul(float(0.42).add(t.mul(0.58)));
    const bloomColor = mix(grassColor, pressedCol, bloom.mul(0.82).saturate()).add(vec3(0.09, 0.075, 0.015).mul(ring).mul(t));
    const fogFactor = smoothstep(fogStart, fogEnd, dist).mul(fogIntensity);
    return mix(bloomColor, fogColor, fogFactor);
  })();

  grassMat.opacityNode = Fn(() => {
    const blade = bladeData.element(instanceIndex);
    const dist = sqrt(blade.x.mul(blade.x).add(blade.y.mul(blade.y)));
    const fadeEnd = select(fogIntensity.greaterThan(0.01), fogEnd.add(2.0), float(15.0));
    const fadeFactor = float(1).sub(smoothstep(fadeEnd.sub(5.0), fadeEnd, dist));
    return smoothstep(float(0.0), float(0.1), uv().y).mul(fadeFactor);
  })();
  grassMat.transparent = true;

  const bladeGeo = createBladeGeometry();
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, BLADE_COUNT);
  grass.frustumCulled = false;
  scene.add(grass);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < BLADE_COUNT; i++) grass.setMatrixAt(i, dummy.matrix);
  grass.instanceMatrix.needsUpdate = true;

  // ─── Ground (verbatim) ────────────────────────────────────────────────────
  const groundMat = new THREE.MeshBasicNodeMaterial();
  groundMat.colorNode = Fn(() => {
    const wx = positionWorld.x, wz = positionWorld.z;
    const dist = sqrt(wx.mul(wx).add(wz.mul(wz)));
    const edgeNoise = noise2D(wx.mul(0.25).add(100), wz.mul(0.25).add(100));
    const maxR = groundRadius.add(edgeNoise.sub(0.5).mul(4.0));
    const t = smoothstep(maxR.sub(groundFalloff), maxR, dist);
    return mix(groundColor, backgroundColor, t);
  })();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_SIZE * 5, FIELD_SIZE * 5), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // ─── Lighting (verbatim) ──────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.5);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  // ─── Lost-item props (our feature, WebGPU-native) ─────────────────────────
  const loader = new GLTFLoader();
  const props = [];
  const hitTargets = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(99, 99);
  const cursorWorld = new THREE.Vector3(99999, 0, 99999);
  const wakePos = new THREE.Vector3(99999, 0, 99999);
  const wakeVel = new THREE.Vector3();
  let cursorOnGround = false;
  let wakeSettled = false;
  let wakePower = 0;
  let hovered = null;
  let pointerActive = false;

  const propConfigs = [
    {
      id: 'airpods',
      label: 'AirPods Pro',
      url: '/models/lost-props/airpods-pro.glb',
      x: isMobile ? -1.85 : -4.55,
      z: isMobile ? 5.2 : 5.25,
      rot: new THREE.Euler(-0.38, 0.72, 0.06),
      maxSize: isMobile ? 1.18 : 1.68,
      sink: 0.0,
      labelHeight: 1.12,
      contact: { padX: 0.72, padZ: 0.62, scaleX: 1.08, scaleZ: 1.08, offsetZ: 0.08 },
      sharpPad: { x: 0.075, y: 0.125 },
    },
    {
      id: 'iphone',
      label: 'iPhone 14 Pro',
      url: '/models/lost-props/iphone-14-pro.glb',
      x: 0.0,
      z: 5.34,
      rot: new THREE.Euler(-0.5, Math.PI - 0.1, 0.01),
      maxSize: isMobile ? 1.86 : 2.42,
      sink: 0.0,
      labelHeight: 2.0,
      contact: { padX: 0.58, padZ: 1.18, scaleX: 1.02, scaleZ: 1.08, offsetZ: 0.28 },
      sharpPad: { x: 0.065, y: 0.12 },
    },
    {
      id: 'tumbler',
      label: 'Stanley Tumbler',
      url: '/models/lost-props/stanley-tumbler.glb',
      x: isMobile ? 1.95 : 4.72,
      z: isMobile ? 5.18 : 5.12,
      rot: new THREE.Euler(0.04, -0.66, 0.18),
      maxSize: isMobile ? 2.06 : 3.05,
      sink: 0.01,
      labelHeight: 2.42,
      contact: { padX: 0.74, padZ: 0.72, scaleX: 1.05, scaleZ: 1.07 },
      sharpPad: { x: 0.08, y: 0.13 },
    },
  ];
  const debugMeshes = createDebugMeshes();

  Promise.allSettled(propConfigs.map((cfg) => loadProp(cfg))).then(() => {
    updatePropScreenMasks();
    hero.classList.add('grass-models-ready');
  });

  function loadProp(cfg) {
    return loader.loadAsync(cfg.url).then((gltf) => {
      const wrapper = new THREE.Group();
      const model = gltf.scene;
      model.traverse((node) => {
        if (node.isMesh) {
          node.frustumCulled = false;
          polishMaterial(node, cfg.id);
        }
      });
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const maxAxis = Math.max(size.x, size.y, size.z) || 1;
      const scale = cfg.maxSize / maxAxis;
      model.scale.setScalar(scale);
      model.position.copy(center).multiplyScalar(-scale);
      wrapper.add(model);
      wrapper.rotation.copy(cfg.rot);
      wrapper.position.set(cfg.x, 0, cfg.z);
      wrapper.updateMatrixWorld(true);
      const rested = new THREE.Box3().setFromObject(wrapper);
      wrapper.position.y = -rested.min.y - (cfg.sink ?? 0.1); // nestle into the grass
      wrapper.updateMatrixWorld(true);
      const contact = new THREE.Box3().setFromObject(wrapper);
      const slot = propConfigs.findIndex((prop) => prop.id === cfg.id);
      if (slot >= 0) {
        setClearanceSlot(slot, contact, cfg);
        updateDebugClearance(slot);
      }
      wrapper.userData = {
        base: wrapper.position.clone(),
        baseRot: cfg.rot.clone(),
        hover: 0,
        label: cfg.label,
        labelHeight: cfg.labelHeight,
        sharpPad: cfg.sharpPad,
        slot,
      };
      scene.add(wrapper);

      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(size.x * scale * 1.2, size.y * scale * 1.2, size.z * scale * 1.2),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.copy(wrapper.position);
      hit.rotation.copy(wrapper.rotation);
      hit.userData.prop = wrapper;
      hitTargets.push(hit);
      scene.add(hit);
      const helper = debugEnabled ? new THREE.BoxHelper(hit, 0xb0a234) : null;
      if (helper) scene.add(helper);
      props.push({ wrapper, hit, helper, slot });
    }).catch(() => hero.classList.add(`grass-${cfg.id}-failed`));
  }

  function setClearanceSlot(slot, box, cfg) {
    const contact = cfg.contact || {};
    const cx = (box.min.x + box.max.x) / 2 + (contact.offsetX || 0);
    const cz = (box.min.z + box.max.z) / 2 + (contact.offsetZ || 0);
    const rx = ((box.max.x - box.min.x) / 2) * (contact.scaleX || 1) + (contact.padX ?? 0.62);
    const rz = ((box.max.z - box.min.z) / 2) * (contact.scaleZ || 1) + (contact.padZ ?? 0.62);
    clearanceSlots[slot].set(cx, cz, Math.max(rx, 0.08), Math.max(rz, 0.08));
  }

  function polishMaterial(node, propId) {
    const m = node.material;
    if (!m) return;
    if ('envMap' in m) m.envMap = propReflectionMap;
    if ('envMapIntensity' in m) m.envMapIntensity = propId === 'iphone' ? 2.55 : propId === 'airpods' ? 3.1 : 1.8;
    if ('clearcoat' in m) m.clearcoat = propId === 'tumbler' ? Math.max(m.clearcoat || 0, 0.48) : Math.max(m.clearcoat || 0, 0.85);
    if ('clearcoatRoughness' in m) m.clearcoatRoughness = propId === 'tumbler' ? 0.22 : 0.06;
    // Force opaque: the iPhone is a single alphaMode:BLEND atlas and the
    // Stanley uses KHR transmission — both render see-through otherwise.
    if (m.transparent || (m.transmission ?? 0) > 0 || (m.opacity ?? 1) < 1) {
      m.transparent = false; m.opacity = 1; m.depthWrite = true;
      if ('transmission' in m) m.transmission = 0;
      if ('roughness' in m) m.roughness = Math.min(m.roughness ?? 0.3, 0.12);
    }
    if (propId === 'iphone') {
      const name = `${m.name || ''} ${node.name || ''}`.toLowerCase();
      m.side = THREE.FrontSide;
      m.depthTest = true;
      m.depthWrite = true;
      if (name.includes('screen') || name.includes('glass') || name.includes('display')) {
        if ('color' in m && !m.map) m.color.set(0x05060a);
        if ('roughness' in m) m.roughness = 0.018;
        if ('metalness' in m) m.metalness = Math.max(m.metalness || 0, 0.32);
        if ('envMapIntensity' in m) m.envMapIntensity = 3.6;
      } else if ('roughness' in m) {
        m.roughness = Math.min(m.roughness ?? 0.4, 0.18);
      }
    }
    if (propId === 'airpods') {
      if ('roughness' in m) m.roughness = 0.035;
      if ('metalness' in m) m.metalness = Math.min(m.metalness || 0, 0.05);
    }
    if (propId === 'tumbler') {
      if ('roughness' in m) m.roughness = Math.min(m.roughness ?? 0.32, 0.14);
      if ('metalness' in m) m.metalness = Math.max(m.metalness || 0, 0.04);
    }
    m.needsUpdate = true;
    node.material = m;
  }

  // ─── Post-processing (DoF) ────────────────────────────────────────────────
  const postProcessing = new THREE.PostProcessing(renderer);
  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output: output, normal: transformedNormalView }));
  const sceneColor = scenePass.getTextureNode('output');
  const sceneViewZ = scenePass.getViewZNode();
  const dofOutput = dof(sceneColor, sceneViewZ, focusDistanceU, focalLengthU, bokehScaleU);
  const protectedDofOutput = Fn(() => {
    const screenUv = uv();
    const sharp0 = ellipseMask(propSharpMask.element(0), screenUv, 0.52, 1.0);
    const sharp1 = ellipseMask(propSharpMask.element(1), screenUv, 0.52, 1.0);
    const sharp2 = ellipseMask(propSharpMask.element(2), screenUv, 0.52, 1.0);
    const itemSharpZone = sharp0.max(sharp1).max(sharp2);
    return mix(dofOutput, sceneColor.sample(screenUv), itemSharpZone);
  })();
  postProcessing.outputNode = dofEnabled ? protectedDofOutput : sceneColor;
  postProcessing.needsUpdate = true;

  // ─── Interaction ──────────────────────────────────────────────────────────
  const grassPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();

  function onPointerMove(e) {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    pointerActive = true;
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(grassPlane, hitPoint)) {
      cursorOnGround = true;
      cursorWorld.copy(hitPoint);
      mouseWorld.value.copy(hitPoint);
      mouseFocusDist = camera.position.distanceTo(hitPoint);
    } else {
      cursorOnGround = false;
      mouseWorld.value.set(99999, 0, 99999);
    }
  }
  function clearPointer() {
    pointerActive = false;
    cursorOnGround = false;
    mouseWorld.value.set(99999, 0, 99999);
    hovered = null;
    hero.classList.remove('is-hovering-prop');
    hideLabel();
  }

  hero.addEventListener('pointermove', onPointerMove, { passive: true });
  hero.addEventListener('pointerleave', clearPointer, { passive: true });
  hero.addEventListener('click', () => { if (hovered) window.location.href = '/search.html'; });

  function updateHover() {
    if (!pointerActive || hitTargets.length === 0) { hovered = null; hero.classList.remove('is-hovering-prop'); return; }
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(hitTargets, false);
    hovered = hits[0]?.object?.userData?.prop || null;
    hero.classList.toggle('is-hovering-prop', Boolean(hovered));
  }

  const _anchor = new THREE.Vector3();
  function updateLabel() {
    if (!hovered || !label || !labelName) { hideLabel(); return; }
    _anchor.copy(hovered.userData.base);
    _anchor.y += hovered.userData.labelHeight;
    _anchor.project(camera);
    if (_anchor.z < -1 || _anchor.z > 1) { hideLabel(); return; }
    const hr = hero.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const x = cr.left - hr.left + (_anchor.x * 0.5 + 0.5) * cr.width;
    const y = cr.top - hr.top + (-_anchor.y * 0.5 + 0.5) * cr.height;
    const safeX = Math.min(Math.max(x, 96), hr.width - 96);
    const safeY = Math.min(Math.max(y, hr.height * 0.32), hr.height - 88);
    labelName.textContent = hovered.userData.label;
    label.style.left = `${safeX}px`;
    label.style.top = `${safeY}px`;
    label.classList.add('is-visible');
  }
  function hideLabel() { label?.classList.remove('is-visible'); }

  let debugPanel;
  if (debugEnabled) {
    debugPanel = document.createElement('div');
    debugPanel.style.cssText = 'position:absolute;right:16px;bottom:16px;z-index:8;padding:10px 12px;border:1px solid rgba(176,162,52,.55);border-radius:10px;background:rgba(0,0,0,.7);color:#d7f5bf;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;pointer-events:none;white-space:pre;';
    hero.appendChild(debugPanel);
  }

  function createDebugMeshes() {
    if (!debugEnabled) return null;
    const group = new THREE.Group();
    scene.add(group);
    const clearances = clearanceSlots.map(() => {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.96, 1.0, 64),
        new THREE.MeshBasicMaterial({ color: 0xb0a234, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      group.add(mesh);
      return mesh;
    });
    const cursor = makeDebugDisc(0x4edea3);
    const wake = makeDebugDisc(0xd4b838);
    group.add(cursor, wake);
    return { group, clearances, cursor, wake };
  }

  function makeDebugDisc(color) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.11, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    return mesh;
  }

  function updateDebugClearance(index) {
    if (!debugMeshes) return;
    const slot = clearanceSlots[index];
    const mesh = debugMeshes.clearances[index];
    mesh.position.set(slot.x, 0.035, slot.y);
    mesh.scale.set(slot.z, slot.w, 1);
    mesh.visible = slot.z > 0.01 && slot.x < 900;
  }

  let lastFpsTime = performance.now();
  let fpsFrames = 0;
  let fps = 0;

  // ─── Resize / visibility / loop ───────────────────────────────────────────
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const r = hero.getBoundingClientRect();
      camera.aspect = Math.max(0.1, r.width / r.height);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(getPixelRatio());
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    }, 120);
  }, { passive: true });

  let lastFrame = performance.now();
  function frameTick(now = performance.now()) {
    const dt = Math.min(0.033, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    if (!reduceMotion) {
      autoFocusSmoothed += (mouseFocusDist - autoFocusSmoothed) * 0.06;
      focusDistanceU.value = autoFocusSmoothed;
    }
    updateWake(dt);
    updateHover();
    props.forEach(({ wrapper, hit, helper }) => {
      const target = wrapper === hovered ? 1 : 0;
      wrapper.userData.hover += (target - wrapper.userData.hover) * 0.12;
      const h = wrapper.userData.hover;
      const base = wrapper.userData.base, br = wrapper.userData.baseRot;
      wrapper.position.set(base.x, base.y + 0.32 * h, base.z);
      wrapper.scale.setScalar(1 + 0.05 * h);
      wrapper.rotation.set(br.x - 0.05 * h, br.y + 0.1 * h, br.z + 0.04 * h);
      hit.position.copy(wrapper.position);
      hit.rotation.copy(wrapper.rotation);
      hit.scale.setScalar(1 + 0.05 * h);
      helper?.update();
    });
    updatePropScreenMasks();
    renderer.compute(computeUpdate);
    postProcessing.render();
    updateLabel();
    updateDebug(now);
  }

  function updateWake(dt) {
    const active = pointerActive && cursorOnGround && !reduceMotion;
    const target = active ? 1 : 0;
    const response = target > wakePower ? 1 - Math.exp(-dt * 14) : 1 - Math.exp(-dt * 1.6);
    wakePower += (target - wakePower) * response;

    if (active) {
      if (!wakeSettled) {
        wakePos.copy(cursorWorld);
        wakeVel.set(0, 0, 0);
        wakeSettled = true;
      }
      wakeVel.x += ((cursorWorld.x - wakePos.x) * 38 - wakeVel.x * 9) * dt;
      wakeVel.z += ((cursorWorld.z - wakePos.z) * 38 - wakeVel.z * 9) * dt;
      wakePos.x += wakeVel.x * dt;
      wakePos.z += wakeVel.z * dt;
    }

    if (wakePower < 0.01 && !active) {
      wakePower = 0;
      wakeSettled = false;
      wakeVel.set(0, 0, 0);
      wakeWorld.value.set(99999, 0, 99999);
    } else {
      wakeWorld.value.copy(wakePos);
    }
    wakeAmount.value = wakePower;
  }

  function updateDebug(now) {
    if (!debugMeshes) return;
    fpsFrames += 1;
    if (now - lastFpsTime > 500) {
      fps = Math.round((fpsFrames * 1000) / (now - lastFpsTime));
      fpsFrames = 0;
      lastFpsTime = now;
    }
    debugMeshes.cursor.visible = pointerActive && cursorOnGround;
    if (debugMeshes.cursor.visible) debugMeshes.cursor.position.set(cursorWorld.x, 0.08, cursorWorld.z);
    debugMeshes.wake.visible = wakePower > 0.01;
    if (debugMeshes.wake.visible) {
      debugMeshes.wake.position.set(wakeWorld.value.x, 0.09, wakeWorld.value.z);
      debugMeshes.wake.scale.setScalar(1 + wakePower * 2.2);
    }
    if (debugPanel) {
      debugPanel.textContent = [
        `fps ${fps}`,
        `wake ${wakePower.toFixed(2)} @ ${wakeWorld.value.x.toFixed(2)}, ${wakeWorld.value.z.toFixed(2)}`,
        `cursor ${cursorOnGround ? `${cursorWorld.x.toFixed(2)}, ${cursorWorld.z.toFixed(2)}` : 'off'}`,
        `hover ${hovered?.userData?.label || 'none'}`,
        `sharp ${propSharpSlots.map((s) => `${s.x.toFixed(2)},${s.y.toFixed(2)}/${s.z.toFixed(2)},${s.w.toFixed(2)}`).join(' | ')}`,
      ].join('\n');
    }
  }

  const _maskBox = new THREE.Box3();
  const _maskCorner = new THREE.Vector3();

  function updatePropScreenMasks() {
    props.forEach(({ wrapper }) => {
      const slot = wrapper.userData.slot;
      if (slot < 0) return;
      _maskBox.setFromObject(wrapper);
      updateScreenSlot(propSharpSlots[slot], _maskBox, wrapper.userData.sharpPad, 1.48);
    });
  }

  function updateScreenSlot(slot, box, pad = { x: 0.02, y: 0.03 }, scale = 1) {
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (let xi = 0; xi <= 1; xi += 1) {
      for (let yi = 0; yi <= 1; yi += 1) {
        for (let zi = 0; zi <= 1; zi += 1) {
          _maskCorner.set(
            xi ? box.max.x : box.min.x,
            yi ? box.max.y : box.min.y,
            zi ? box.max.z : box.min.z
          ).project(camera);
          const u = _maskCorner.x * 0.5 + 0.5;
          const v = -_maskCorner.y * 0.5 + 0.5;
          minU = Math.min(minU, u); maxU = Math.max(maxU, u);
          minV = Math.min(minV, v); maxV = Math.max(maxV, v);
        }
      }
    }

    if (!Number.isFinite(minU) || maxU < -0.2 || minU > 1.2 || maxV < -0.2 || minV > 1.2) {
      slot.set(999, 999, 0.001, 0.001);
      return;
    }

    const cx = (minU + maxU) / 2;
    const cy = (minV + maxV) / 2;
    const rx = Math.max((maxU - minU) * 0.5 * scale + (pad?.x || 0), 0.001);
    const ry = Math.max((maxV - minV) * 0.5 * scale + (pad?.y || 0), 0.001);
    slot.set(
      Math.min(1.15, Math.max(-0.15, cx)),
      Math.min(1.15, Math.max(-0.15, cy)),
      Math.min(0.42, rx),
      Math.min(0.42, ry)
    );
  }

  let isVisible = true;
  let looping = false;
  function startLoop() {
    if (looping || !isVisible) return;
    looping = true;
    renderer.setAnimationLoop(frameTick);
  }
  function stopLoop() {
    looping = false;
    renderer.setAnimationLoop(null);
  }

  await renderer.computeAsync(computeInit);
  hero.classList.add('grass-scene-ready');

  if (reduceMotion) {
    // Static cinematic frame: settle one compute pass, render once, no loop.
    renderer.compute(computeUpdate);
    postProcessing.render();
  } else {
    startLoop();
  }

  if ('IntersectionObserver' in window) {
    const vis = new IntersectionObserver((entries) => {
      isVisible = entries.some((e) => e.isIntersecting);
      if (reduceMotion) return;
      if (isVisible) startLoop(); else stopLoop();
    }, { threshold: 0.02 });
    vis.observe(hero);
  }
}

function getPixelRatio() {
  const max = window.innerWidth < 768 ? 1.25 : 1.5;
  return Math.min(window.devicePixelRatio || 1, max);
}
