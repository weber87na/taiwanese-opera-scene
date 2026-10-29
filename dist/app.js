import * as THREE from './vendor/three.module.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const app = $('app');
const slider = $('progress');
const playButton = $('play');
const canvas = $('scene-canvas');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const TURN = 148 * Math.PI / 180;
let progress = 0;
let playing = false;
let ready = false;
let renderer;
let frame = 0;
let stageWidth = 1;
let stageHeight = 1;
let pointerX = 0;
let pointerY = 0;
let dragging = false;
let startX = 0;
let startProgress = 0;
let previousPhase = '';
let animationStart = 0;
let animationFrom = 0;
const duration = reducedMotion ? 14000 : 10000;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 80);
camera.position.set(0, 0, 20);
const art = new THREE.Group();
scene.add(art);
let paper, ink, landscape;
let artworkWidth = 8.6;
let artworkHeight = 6;

function loadTexture(path) {
  return new Promise((resolve, reject) => new THREE.TextureLoader().load(path, resolve, undefined, reject));
}

function readPixels(image) {
  const scratch = document.createElement('canvas');
  scratch.width = image.width;
  scratch.height = image.height;
  const context = scratch.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height).data;
}

function buildInk(texture) {
  // Every point comes from a non-white pixel of the supplied drawing.
  const img = texture.image;
  const pixels = readPixels(img);
  const positions = [], colors = [], depths = [], seeds = [];
  const color = new THREE.Color();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
      if (Math.min(r, g, b) > 0.88) continue;
      const nx = x / (img.width - 1), ny = y / (img.height - 1);
      positions.push((nx - 0.5) * artworkWidth, (0.5 - ny) * artworkHeight, 0);
      color.setRGB(r, g, b, THREE.SRGBColorSpace);
      colors.push(color.r, color.g, color.b);
      const region = b > r + 0.08 ? 1.25 : g > r + 0.07 ? -0.45 : r > b + 0.06 ? 2.1 : -1.4;
      depths.push(region + Math.sin(nx * 18 + ny * 11) * 0.35);
      seeds.push(nx * 13.4 + ny * 7.8);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('depth', new THREE.Float32BufferAttribute(depths, 1));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, vertexColors: true,
    uniforms: { spread: { value: 0 }, opacity: { value: 0 }, pointSize: { value: 1 }, angle: { value: 0 } },
    vertexShader: `
      attribute float depth;
      attribute float seed;
      uniform float spread, pointSize, angle;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec3 p = position;
        p.z += depth * spread;
        p.x += sin(seed * 1.7) * 0.2 * spread;
        p.y += cos(seed * 1.2) * 0.12 * spread;
        float c = cos(angle), s = sin(angle);
        p = vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = pointSize;
      }`,
    fragmentShader: `
      uniform float opacity;
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float alpha = 1.0 - smoothstep(0.32, 0.5, length(d));
        // Lift the original ink gently while it floats against the dark gallery.
        gl_FragColor = vec4(mix(vColor, vec3(0.62,0.70,0.56), 0.27), alpha * opacity);
        #include <colorspace_fragment>
      }`
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  canvas.dataset.inkPoints = String(depths.length);
  return points;
}

function buildLandscape(texture) {
  const geometry = new THREE.PlaneGeometry(artworkWidth, artworkHeight, 100, 70).toNonIndexed();
  const positions = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const pixels = readPixels(texture.image);
  const iw = texture.image.width, ih = texture.image.height;
  const centers = [], seeds = [], depths = [];
  for (let t = 0; t < positions.count; t += 3) {
    const cx = (positions.getX(t) + positions.getX(t + 1) + positions.getX(t + 2)) / 3;
    const cy = (positions.getY(t) + positions.getY(t + 1) + positions.getY(t + 2)) / 3;
    const seed = Math.sin(cx * 27.17 + cy * 91.7) * 43758.5453 % 1;
    for (let j = 0; j < 3; j++) {
      const u = uv.getX(t + j), v = uv.getY(t + j);
      const px = Math.min(iw - 1, Math.floor(u * iw));
      const py = Math.min(ih - 1, Math.floor((1 - v) * ih));
      const index = (py * iw + px) * 4;
      const r = pixels[index] / 255, g = pixels[index + 1] / 255, b = pixels[index + 2] / 255;
      // A restrained illustrative relief; the source remains an intact photograph.
      const sky = v > 0.68 && b > r * 1.03 && b > g * 0.96;
      const depth = sky ? -0.48 : (1 - v) * 0.85 + Math.max(0, g - b) * 0.38;
      centers.push(cx, cy, 0);
      seeds.push(Math.abs(seed));
      depths.push(depth);
    }
  }
  geometry.setAttribute('tileCenter', new THREE.Float32BufferAttribute(centers, 3));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute('depth', new THREE.Float32BufferAttribute(depths, 1));
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: true,
    uniforms: {
      image: { value: texture }, angle: { value: -TURN }, assemble: { value: 0 },
      reveal: { value: 0 }, time: { value: 0 }, motion: { value: reducedMotion ? 0 : 1 }
    },
    vertexShader: `
      attribute vec3 tileCenter;
      attribute float seed, depth;
      uniform float angle, assemble;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vUv = uv;
        vSeed = seed;
        float spread = 1.0 - assemble;
        vec3 p = position;
        vec3 local = p - tileCenter;
        float spin = spread * (seed - 0.5) * 4.0;
        float cs = cos(spin), sn = sin(spin);
        p = tileCenter + vec3(cs*local.x - sn*local.y, sn*local.x + cs*local.y, 0.0);
        p.xy += vec2(sin(seed*51.2), cos(seed*67.9)) * spread * 0.7;
        p.z = depth + (seed - 0.5) * spread * 4.2;
        float c = cos(angle), s = sin(angle);
        p = vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D image;
      uniform float reveal, time, motion;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        float alpha = smoothstep(vSeed * 0.48, vSeed * 0.48 + 0.30, reveal);
        if(alpha < 0.003) discard;
        vec4 sampleColor = texture2D(image, vUv);
        float river = smoothstep(0.025,0.13,sampleColor.b-sampleColor.r)
          * smoothstep(0.01,0.10,sampleColor.g-sampleColor.r)
          * (1.0-smoothstep(0.50,0.60,vUv.y));
        vec2 ripple = vec2(sin(vUv.y*160.0+time*0.70), cos(vUv.x*115.0-time*0.5))
          * 0.00032 * river * motion * smoothstep(0.8,1.0,reveal);
        vec3 col = texture2D(image, clamp(vUv + ripple,0.0,1.0)).rgb;
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

function updateUI() {
  slider.value = String(Math.round(progress * 1000));
  slider.style.setProperty('--progress', `${progress * 100}%`);
  const phase = progress < 0.16 ? '01 / 紙上塗鴉' : progress < 0.48 ? '02 / 筆畫走進空間' : progress < 0.88 ? '03 / 山河逐漸成形' : '04 / 一幅山河，藏在筆畫裡';
  if (phase !== previousPhase) {
    $('phase').textContent = phase;
    previousPhase = phase;
  }
  $('angle').textContent = `${Math.round(smooth(0, 1, progress) * 148)}°`;
  slider.setAttribute('aria-valuetext', `${Math.round(progress * 100)}%，${phase.slice(5)}`);
  playButton.innerHTML = playing ? '<span aria-hidden="true">Ⅱ</span><span>暫停旋轉</span>' : progress >= 0.999 ? '<span aria-hidden="true">↻</span><span>再看一次</span>' : '<span aria-hidden="true">▶</span><span>播放旋轉</span>';
  playButton.setAttribute('aria-pressed', String(playing));
  canvas.dataset.progress = progress.toFixed(4);
  canvas.dataset.state = playing ? 'playing' : 'paused';
}

function resize() {
  if (!renderer) return;
  const box = stage.getBoundingClientRect();
  stageWidth = Math.max(1, box.width);
  stageHeight = Math.max(1, box.height);
  renderer.setSize(stageWidth, stageHeight, false);
  const aspect = stageWidth / stageHeight;
  const h = Math.max(artworkHeight, artworkWidth / aspect) * 1.055;
  camera.left = -h * aspect / 2;
  camera.right = h * aspect / 2;
  camera.top = h / 2;
  camera.bottom = -h / 2;
  camera.updateProjectionMatrix();
  requestFrame();
}

function requestFrame() {
  if (!frame && ready && !document.hidden) frame = requestAnimationFrame(render);
}

function render(now) {
  frame = 0;
  if (!ready || document.hidden) return;
  if (playing) {
    progress = Math.min(1, animationFrom + (now - animationStart) / duration);
    if (progress === 1) playing = false;
    updateUI();
  }
  const p = progress;
  const turn = smooth(0, 1, p);
  const arc = Math.sin(Math.PI * p);
  const scale = 1 - arc * 0.17;
  art.scale.setScalar(scale);
  const pointerAmount = smooth(0.88, 1, p) * 0.025;
  art.rotation.set(-pointerY * pointerAmount, pointerX * pointerAmount, 0);
  paper.rotation.y = TURN * turn;
  paper.material.opacity = 1 - smooth(0.08, 0.34, p);
  paper.visible = p < 0.34;
  ink.material.uniforms.angle.value = TURN * turn;
  ink.material.uniforms.spread.value = smooth(0.04, 0.30, p) * (1 - smooth(0.65, 0.90, p));
  ink.material.uniforms.opacity.value = smooth(0.06, 0.22, p) * (1 - smooth(0.53, 0.82, p));
  ink.material.uniforms.pointSize.value = Math.max(1.1, (stageHeight / 825) * renderer.getPixelRatio() * (1.35 + arc * 0.5));
  ink.visible = p > 0.03 && p < 0.84;
  landscape.material.uniforms.angle.value = -TURN * (1 - turn);
  landscape.material.uniforms.assemble.value = smooth(0.38, 0.90, p);
  landscape.material.uniforms.reveal.value = smooth(0.35, 0.88, p);
  landscape.material.uniforms.time.value = now / 1000;
  landscape.visible = p > 0.35;
  renderer.render(scene, camera);
  canvas.dataset.rendered = 'true';
  if (playing || (!reducedMotion && p > 0.98)) requestFrame();
}

function setProgress(value) {
  playing = false;
  progress = clamp(value, 0, 1);
  updateUI();
  requestFrame();
}

playButton.addEventListener('click', () => {
  if (!ready) return;
  if (playing) playing = false;
  else {
    if (progress >= 0.999) progress = 0;
    animationFrom = progress;
    animationStart = performance.now();
    playing = true;
  }
  updateUI();
  requestFrame();
});
$('reset').addEventListener('click', () => setProgress(0));
slider.addEventListener('input', () => setProgress(Number(slider.value) / 1000));
stage.addEventListener('pointerdown', (event) => {
  if (!ready || event.button > 0) return;
  dragging = true;
  playing = false;
  startX = event.clientX;
  startProgress = progress;
  stage.setPointerCapture(event.pointerId);
  updateUI();
});
stage.addEventListener('pointermove', (event) => {
  const rect = stage.getBoundingClientRect();
  pointerX = (event.clientX - rect.left) / rect.width - 0.5;
  pointerY = (event.clientY - rect.top) / rect.height - 0.5;
  if (dragging) setProgress(startProgress + (event.clientX - startX) / Math.min(stageWidth * 0.72, 750));
  else requestFrame();
});
const stopDrag = () => { dragging = false; };
stage.addEventListener('pointerup', stopDrag);
stage.addEventListener('pointercancel', stopDrag);
stage.addEventListener('lostpointercapture', stopDrag);
stage.addEventListener('pointerleave', () => {
  pointerX = pointerY = 0;
  requestFrame();
});
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (app.requestFullscreen) await app.requestFullscreen();
    else throw new Error('Fullscreen unavailable');
  } catch {
    $('error').textContent = '此瀏覽器未開放全螢幕，仍可直接使用旋轉與播放。';
    $('error').hidden = false;
    setTimeout(() => { $('error').hidden = true; }, 3500);
  }
});
document.addEventListener('fullscreenchange', () => {
  const active = Boolean(document.fullscreenElement);
  $('fullscreen').setAttribute('aria-label', active ? '離開全螢幕' : '進入全螢幕');
  $('fullscreen').innerHTML = `<span aria-hidden="true">⛶</span><span>${active ? '離開全螢幕' : '全螢幕'}</span>`;
  resize();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    playing = false;
    if(frame) cancelAnimationFrame(frame);
    frame = 0;
    updateUI();
  } else requestFrame();
});
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  playing = false;
  ready = false;
  app.classList.remove('is-ready');
  $('loading').hidden = true;
  $('error').textContent = '圖形連線暫時中斷，請重新整理以恢復旋轉效果。';
  $('error').hidden = false;
});

async function initialize() {
  playButton.disabled = true;
  slider.disabled = true;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x18201b, 0);
    const [drawingTexture, photoTexture] = await Promise.all([
      loadTexture('./assets/doodle.png'), loadTexture('./assets/landscape.png')
    ]);
    for (const texture of [drawingTexture, photoTexture]) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    artworkHeight = artworkWidth * drawingTexture.image.height / drawingTexture.image.width;
    paper = new THREE.Mesh(
      new THREE.PlaneGeometry(artworkWidth, artworkHeight),
      new THREE.MeshBasicMaterial({ map: drawingTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    paper.renderOrder = 1;
    ink = buildInk(drawingTexture);
    landscape = buildLandscape(photoTexture);
    art.add(paper, ink, landscape);
    ready = true;
    new ResizeObserver(resize).observe(stage);
    resize();
    updateUI();
    renderer.compile(scene, camera);
    app.classList.add('is-ready');
    playButton.disabled = false;
    slider.disabled = false;
    requestFrame();
  } catch (error) {
    console.error('Scene initialization failed:', error);
    $('loading').hidden = true;
    $('error').hidden = false;
    $('error').textContent = '無法啟動 3D 場景。請使用支援 WebGL 2 的瀏覽器，並確認圖片已載入。';
  }
}

initialize();
