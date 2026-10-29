import * as THREE from './vendor/three.module.js';

/** Architectural scenery only: no characters, animals, or photographic textures. */
export function createFortress() {
  const group = new THREE.Group();
  group.name = 'MuKeFortress';
  const materials = {
    stone: new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 0.96 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x3c2920, roughness: 0.86 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x76513b, roughness: 0.83 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x353f3c, roughness: 0.93, side: THREE.DoubleSide }),
    tile: new THREE.MeshStandardMaterial({ color: 0x46514b, roughness: 0.88 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x393c37, roughness: 0.68, metalness: 0.35 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xa88a4c, roughness: 0.55, metalness: 0.35 })
  };
  const batches = new Map();
  const temp = new THREE.Object3D();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const sphereGeometry = new THREE.SphereGeometry(0.5, 10, 7);
  const color = new THREE.Color();
  let randomSeed = 747;
  const random = () => {
    randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0;
    return randomSeed / 4294967296;
  };
  function instance(kind, geometry, position, scale, rotation = [0, 0, 0], tint = 1) {
    const key = `${kind}-${geometry.id}`;
    if (!batches.has(key)) batches.set(key, { geometry, kind, items: [] });
    temp.position.set(...position);
    temp.rotation.set(...rotation);
    temp.scale.set(...scale);
    temp.updateMatrix();
    batches.get(key).items.push({ matrix: temp.matrix.clone(), tint });
  }
  const box = (kind, x, y, z, sx, sy, sz, rotation, tint) => instance(kind, boxGeometry, [x, y, z], [sx, sy, sz], rotation, tint);
  const cylinder = (kind, x, y, z, radius, height, rotation, tint) => instance(kind, cylinderGeometry, [x, y, z], [radius * 2, height, radius * 2], rotation, tint);
  const sphere = (kind, x, y, z, radius, tint) => instance(kind, sphereGeometry, [x, y, z], [radius * 2, radius * 2, radius * 2], undefined, tint);
  function beam(kind, a, b, width = 0.22) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const delta = vb.clone().sub(va);
    temp.position.copy(va.add(vb).multiplyScalar(0.5));
    temp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
    temp.scale.set(width, delta.length(), width);
    temp.updateMatrix();
    const key = `${kind}-${cylinderGeometry.id}`;
    if (!batches.has(key)) batches.set(key, { geometry: cylinderGeometry, kind, items: [] });
    batches.get(key).items.push({ matrix: temp.matrix.clone(), tint: 0.92 + random() * 0.16 });
  }

  // Solid wall cores, with an actual gap through the centre.
  box('stone', -25.5, 4.8, -16, 39, 9.6, 3.4, undefined, 0.75);
  box('stone', 25.5, 4.8, -16, 39, 9.6, 3.4, undefined, 0.75);
  box('stone', 0, 11.15, -16, 13.6, 2.3, 5.4, undefined, 0.83);
  box('trim', 0, 9.9, -13.8, 12.3, 0.42, 0.65);

  function masonryFace(x0, x1, y0, y1, z, blockWidth = 2.3) {
    const rowHeight = 0.76;
    for (let y = y0; y < y1; y += rowHeight) {
      const row = Math.floor((y - y0) / rowHeight);
      for (let x = x0 - (row % 2) * blockWidth * 0.5; x < x1; x += blockWidth) {
        const left = Math.max(x0, x), right = Math.min(x1, x + blockWidth);
        if (right - left < 0.15) continue;
        box('stone', (left + right) / 2, y + rowHeight / 2, z + random() * 0.045,
          right - left - 0.045, rowHeight - 0.045, 0.32 + random() * 0.08,
          undefined, 0.8 + random() * 0.35);
      }
    }
  }
  masonryFace(-45, -6, 0.1, 9.5, -14.18);
  masonryFace(6, 45, 0.1, 9.5, -14.18);
  masonryFace(-45, -6, 0.1, 9.5, -17.82);
  masonryFace(6, 45, 0.1, 9.5, -17.82);
  masonryFace(-6, 6, 10.1, 12.2, -13.14, 2.0);
  for (let side of [-1, 1]) {
    box('stone', side * 25.6, 9.7, -16, 39.5, 0.45, 3.8, undefined, 1.08);
    for (let x = 6.5; x < 45; x += 3.4) {
      box('stone', side * (x + 0.8), 10.55, -14.55, 1.65, 1.3, 1.15, undefined, 0.92 + random() * 0.2);
    }
    // Quoin stones keep the gate surround distinct from the wall courses.
    for (let y = 0.6; y < 10; y += 1.18) {
      box('stone', side * 6.35, y, -13.95, 1.15, 1.08, 0.9, undefined, 1.12);
    }
  }

  const roofPositions = [], roofNormals = [], roofIndices = [];
  function appendGeometry(geometry) {
    const start = roofPositions.length / 3;
    roofPositions.push(...geometry.attributes.position.array);
    roofNormals.push(...geometry.attributes.normal.array);
    if (geometry.index) for (let i of geometry.index.array) roofIndices.push(start + i);
    else for (let i = 0; i < geometry.attributes.position.count; i++) roofIndices.push(start + i);
    geometry.dispose();
  }

  function roof(cx, baseY, cz, width, depth, rise, curl = 0.65) {
    const hx = width / 2, hz = depth / 2;
    const ridge = Math.max(0.3, hx - hz * 0.88);
    const heightAt = (x, z) => {
      const d = Math.min(1, Math.max(Math.abs(z) / hz, (Math.abs(x) - ridge) / (hx - ridge)));
      const corner = Math.pow(Math.abs(x) / hx, 5) * Math.pow(Math.abs(z) / hz, 5);
      return baseY + rise * Math.pow(1 - d, 1.4) + curl * Math.pow(d, 7) + corner * curl * 0.8;
    };
    const nx = Math.max(18, Math.round(width * 2.5)), nz = Math.max(12, Math.round(depth * 2.5));
    const vertices = [], indices = [];
    for (let iz = 0; iz <= nz; iz++) {
      for (let ix = 0; ix <= nx; ix++) {
        const x = -hx + width * ix / nx, z = -hz + depth * iz / nz;
        vertices.push(cx + x, heightAt(x, z), cz + z);
      }
    }
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    appendGeometry(geo);

    // Individual raised ceramic seams follow the curved slopes, with matching
    // edge fascia. These are geometry, so the roof keeps its form when orbiting.
    for (let x = -hx + 0.18; x < hx; x += 0.58) {
      for (let side of [-1, 1]) {
        for (let s = 0; s < 4; s++) {
          const za = side * hz * s / 4, zb = side * hz * (s + 1) / 4;
          beam('tile', [cx + x, heightAt(x, za) + 0.045, cz + za], [cx + x, heightAt(x, zb) + 0.045, cz + zb], 0.075);
        }
      }
    }
    for (let side of [-1, 1]) {
      for (let i = 0; i < 24; i++) {
        const xa = -hx + width * i / 24, xb = -hx + width * (i + 1) / 24;
        beam('wood', [cx + xa, heightAt(xa, side * hz) - 0.08, cz + side * hz], [cx + xb, heightAt(xb, side * hz) - 0.08, cz + side * hz], 0.23);
      }
      for (let i = 0; i < 14; i++) {
        const za = -hz + depth * i / 14, zb = -hz + depth * (i + 1) / 14;
        beam('wood', [cx + side * hx, heightAt(side * hx, za) - 0.08, cz + za], [cx + side * hx, heightAt(side * hx, zb) - 0.08, cz + zb], 0.23);
      }
    }
    beam('tile', [cx - ridge, baseY + rise + 0.12, cz], [cx + ridge, baseY + rise + 0.12, cz], 0.34);
    for (let side of [-1, 1]) {
      beam('tile', [cx + side * ridge, baseY + rise + 0.13, cz], [cx + side * (ridge + 0.8), baseY + rise + 0.75, cz], 0.28);
    }
  }

  // Central gatehouse: stone supports and open timber storey above the passage.
  box('wood', 0, 12.45, -16, 25, 0.65, 9.4);
  for (let x of [-10, -5, 0, 5, 10]) {
    for (let z of [-19.5, -12.5]) {
      cylinder('wood', x, 15, z, 0.35, 5.3);
      box('trim', x, 12.75, z, 0.9, 0.35, 0.9);
      box('trim', x, 17.25, z, 1.8, 0.32, 0.75);
    }
  }
  for (let z of [-19.5, -12.5]) {
    box('wood', 0, 17.6, z, 23, 0.5, 0.65);
    box('trim', 0, 13.75, z, 23, 0.22, 0.23);
    box('wood', 0, 13.0, z, 23, 0.18, 0.2);
    for (let x = -11; x <= 11; x += 1) box('wood', x, 13.35, z, 0.15, 1, 0.16);
  }
  for (let x of [-10, -5, 5, 10]) {
    beam('wood', [x - 1.7, 17.3, -12.5], [x, 15.4, -12.5], 0.25);
    beam('wood', [x + 1.7, 17.3, -12.5], [x, 15.4, -12.5], 0.25);
  }
  roof(0, 17.8, -16, 28, 12.4, 3.1, 0.75);
  // Raised second roof on the central ridge gives the familiar double-eave silhouette.
  box('wood', 0, 20.25, -16, 14, 1.5, 4.5);
  roof(0, 21, -16, 17.5, 7.0, 1.7, 0.45);

  // Open inward doors: the viewer can see through the gateway.
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x4b3022, roughness: 0.92 });
  for (let side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * 5.8, 0, -15.3);
    hinge.rotation.y = -side * 1.24;
    const door = new THREE.Mesh(new THREE.BoxGeometry(5.6, 9.3, 0.36), doorMaterial);
    door.position.set(-side * 2.8, 4.65, 0);
    door.castShadow = true;
    hinge.add(door);
    for (let y of [1.3, 4.8, 8.1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.24, 0.47), materials.metal);
      brace.position.set(-side * 2.8, y, 0);
      hinge.add(brace);
    }
    group.add(hinge);
  }

  // Guard towers terminate the walls; their open sides expose the construction.
  function watchtower(x, z, elevation = 0) {
    box('stone', x, 6.2 + elevation, z, 8.4, 12.4, 7.8, undefined, 0.87);
    masonryFace(x - 4.2, x + 4.2, elevation + 0.2, elevation + 12.1, z + 4.0, 2.0);
    box('wood', x, 12.7 + elevation, z, 10.2, 0.6, 9.4);
    for (let dx of [-3.8, 3.8]) {
      for (let dz of [-3.3, 3.3]) {
        cylinder('wood', x + dx, 15.3 + elevation, z + dz, 0.33, 5.2);
        beam('wood', [x + dx, 13.6 + elevation, z + dz], [x + dx * 0.45, 17.5 + elevation, z + dz], 0.25);
      }
    }
    for (let dz of [-4.05, 4.05]) {
      box('wood', x, 13.8 + elevation, z + dz, 9.6, 0.22, 0.24);
      for (let dx = -4.3; dx <= 4.3; dx += 0.85) box('wood', x + dx, 13.35 + elevation, z + dz, 0.13, 1.1, 0.14);
      box('wood', x, 17.5 + elevation, z + dz * 0.8, 8.4, 0.45, 0.45);
    }
    for (let dx of [-4.4, 4.4]) box('wood', x + dx, 13.8 + elevation, z, 0.25, 0.22, 8.2);
    roof(x, 17.7 + elevation, z, 12, 10.7, 3.3, 0.65);
    cylinder('wood', x, 22.1 + elevation, z, 0.09, 2.6);
  }
  watchtower(-34, -17.5, 0.5);
  watchtower(34, -17.5, 1.3);

  // Low tiled halls glimpsed through and over the walls complete the village depth.
  for (let [x, z, w, d, h] of [[-30, -43, 15, 11, 8], [30, -43, 18, 11, 9], [0, -86, 23, 12, 11]]) {
    box('stone', x, h / 2, z, w - 2, h, d - 2, undefined, 0.83);
    for (let dx = -w / 2 + 1; dx < w / 2; dx += 3) cylinder('wood', x + dx, h * 0.55, z + d / 2 - 0.8, 0.22, h);
    roof(x, h, z, w + 2, d + 2, 3.1, 0.6);
  }

  // Flanking fences and lantern brackets keep the foreground centre empty.
  for (let side of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const z = -9 + i * 2.2;
      const x = side * (18 + i * 0.32);
      cylinder('wood', x, 1.5, z, 0.16, 3.0 + random() * 0.25);
      if (i < 9) for (let y of [0.8, 1.95]) beam('wood', [x, y, z], [side * (18 + (i + 1) * 0.32), y, z + 2.2], 0.15);
    }
  }

  const flags = [];
  function flag(x, y, z, scale = 1, phase = 0) {
    cylinder('wood', x, y + 4.8 * scale, z, 0.09 * scale, 9.6 * scale);
    sphere('brass', x, y + 9.75 * scale, z, 0.15 * scale);
    const geometry = new THREE.PlaneGeometry(3.9 * scale, 2.7 * scale, 26, 14);
    geometry.translate(1.95 * scale, 0, 0);
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        time: { value: 0 }, strength: { value: 1 }, phase: { value: phase },
        width: { value: 3.9 * scale }, red: { value: new THREE.Color(phase > 2 ? 0x754333 : 0x792a24) }
      },
      vertexShader: `
        uniform float time, strength, phase, width;
        varying vec2 vUv;
        varying float fold;
        void main() {
          vUv = uv;
          vec3 p = position;
          float t = p.x / width;
          fold = sin(p.x * 2.8 - time * 1.8 * strength + phase) * 0.20 + sin(p.x * 5.3 + p.y - time * 2.7 + phase) * 0.08;
          p.z += fold * t * strength;
          p.y -= t * 0.13 + t * t * 0.17;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 red;
        varying vec2 vUv;
        varying float fold;
        void main() {
          float edge = step(vUv.x,0.035)+step(0.965,vUv.x)+step(vUv.y,0.04)+step(0.96,vUv.y);
          vec2 q = abs(vUv-vec2(0.47,0.5));
          float diamond = 1.0-smoothstep(0.018,0.027,abs(q.x+q.y*0.67-0.21));
          vec3 c = mix(red,vec3(0.35,0.21,0.08),clamp(edge+diamond*0.75,0.0,1.0));
          c *= 0.9 + fold * 0.8;
          gl_FragColor = vec4(c,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y + 7.6 * scale, z);
    mesh.rotation.y = -0.2 + phase * 0.17;
    mesh.castShadow = true;
    group.add(mesh);
    flags.push(material);
  }
  flag(-15, 0, -11.5, 1.15, 0.0);
  flag(15, 0, -11.5, 1.15, 1.4);
  flag(-34, 20.4, -17.5, 0.72, 2.8);
  flag(34, 21.2, -17.5, 0.72, 4.1);
  flag(-24, 9.8, -16, 0.67, 1.0);
  flag(24, 9.8, -16, 0.67, 3.2);

  // The invisible plaque scaffold supplies depth only; it has no text texture.
  box('wood', 0, 15.35, -11.92, 7.7, 2.1, 0.48);
  for (let y of [14.34, 16.36]) box('brass', 0, y, -11.64, 7.7, 0.07, 0.06);
  for (let x of [-3.78, 3.78]) box('brass', x, 15.35, -11.64, 0.07, 2.05, 0.06);
  box('wood', 0, 15.35, -20.08, 7.7, 2.1, 0.48);
  for (let y of [14.34, 16.36]) box('brass', 0, y, -20.36, 7.7, 0.07, 0.06);
  for (let x of [-3.78, 3.78]) box('brass', x, 15.35, -20.36, 0.07, 2.05, 0.06);

  const lamps = [];
  const glowMaterial = new THREE.MeshStandardMaterial({ color: 0xd0964f, emissive: 0xff9a40, emissiveIntensity: 1.1, roughness: 0.85 });
  for (let side of [-1, 1]) {
    const x = side * 7.55;
    beam('metal', [x, 6.2, -13.8], [x, 6.7, -12.6], 0.12);
    cylinder('metal', x, 5.8, -12.5, 0.44, 1.15);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.72, 10), glowMaterial);
    lamp.position.set(x, 5.85, -12.5);
    group.add(lamp);
    const light = new THREE.PointLight(0xffb86c, 5, 9, 2);
    light.position.set(x, 5.9, -11.8);
    group.add(light);
    lamps.push(light);
  }

  // Collapse repeated masonry, timber, and tile seams into a few draw calls.
  for (let { geometry, kind, items } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, materials[kind], items.length);
    mesh.name = `Fortress_${kind}_${items.length}`;
    mesh.userData.ink = kind !== 'tile';
    mesh.userData.noInk = kind === 'tile';
    mesh.userData.inkColor = kind === 'wood' || kind === 'trim' ? 0x75543d : 0x6d7978;
    items.forEach((item, i) => {
      mesh.setMatrixAt(i, item.matrix);
      color.setRGB(item.tint, item.tint, item.tint);
      mesh.setColorAt(i, color);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  const roofsGeometry = new THREE.BufferGeometry();
  roofsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roofPositions, 3));
  roofsGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(roofNormals, 3));
  roofsGeometry.setIndex(roofIndices);
  const roofs = new THREE.Mesh(roofsGeometry, materials.roof);
  roofs.name = 'ContinuousCurvedRoofs';
  roofs.userData.ink = true;
  roofs.userData.inkColor = 0x405e59;
  roofs.castShadow = true;
  roofs.receiveShadow = true;
  group.add(roofs);

  group.userData.geometryOnly = true;
  group.userData.mainGate = { center: [0, 0, -16], openingWidth: 12, openingHeight: 10 };
  function update(time, mood = 0) {
    const wind = 0.8 + THREE.MathUtils.clamp(mood, 0, 1) * 0.7;
    for (let material of flags) {
      material.uniforms.time.value = time;
      material.uniforms.strength.value = wind;
    }
    lamps.forEach((light, i) => { light.intensity = 4.5 + Math.sin(time * 2.1 + i * 1.7) * 0.35 + mood * 1.5; });
  }
  return { group, update };
}
