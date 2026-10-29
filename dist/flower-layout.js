import {isRiverPoint,riverHeight} from './river-layout.js';

// Spring flowers share the terrain sampler with the ink landscape. This layout
// is generated once, then reused by the GPU through every seasonal cycle.
const clamp01 = value => Math.max(0, Math.min(1, value));

// Roof footprints, including a little breathing room for swaying flower crowns.
// The wall and gate positions match fortress.js, including their rear faces.
const BUILDINGS = [
  [-46.5, 46.5, -19.5, -12.4], // front wall
  [-15.2, 15.2, -23.4, -8.6], // double-eaved gatehouse
  [-41.2, -26.8, -24.1, -10.9], [26.8, 41.2, -24.1, -10.9], // towers
  [-39.6, -20.4, -50.6, -35.4], [19.0, 41.0, -50.6, -35.4], // side halls
  [-13.7, 13.7, -94.2, -77.8], // rear hall
];

/** Keep every bloom on dry, gentle ground, outside architecture and the path. */
export function isFlowerSiteAllowed(x, z, groundHeight) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || typeof groundHeight !== 'function') return false;
  if (Math.abs(x) <= 8.8 && z >= -29 && z <= 61) return false;
  if (BUILDINGS.some(([left, right, back, front]) => x >= left && x <= right && z >= back && z <= front)) return false;
  if (Math.hypot(x + 13, z - 10) < 5.8 || Math.hypot(x - 15, z - 13) < 5.8) return false;
  // Low fences flank the open approach; keep stems away from their railings.
  if (z > -10.5 && z < 12.5 && Math.abs(Math.abs(x) - (18 + (z + 9) * .32 / 2.2)) < 1.3) return false;
  if (isRiverPoint(x,z,2.5)) return false;
  const y = groundHeight(x, z);
  if (!Number.isFinite(y)) return false;
  // The bank transition can be submerged even outside the nominal channel;
  // leave an extra dry margin above the river's gently sloping water plane.
  if (isRiverPoint(x,z,9) && y < riverHeight(z)+.4) return false;
  const dx = (groundHeight(x + .8, z) - groundHeight(x - .8, z)) / 1.6;
  const dz = (groundHeight(x, z + .8) - groundHeight(x, z - .8)) / 1.6;
  return Number.isFinite(dx) && Number.isFinite(dz) && Math.hypot(dx, dz) <= 1;
}

// [centre x/z, ellipse radii x/z, count, rotation, colour family, bloom wave].
// Overlapping lobes form banks of colour, with intentional empty ground between
// beds. They surround the set so an orbit never reveals a camera-facing strip.
const BEDS = [
  [-27, 28, 10, 8, 125, -.35, .04, .08],
  [-31, 42, 9, 9, 125, .30, .22, .15],
  [-18, 47, 6, 7, 80, -.50, .44, .23],
  [-39, 17, 8, 10, 75, -.15, .13, .29],
  [30, 28, 9, 8, 120, .35, .65, .10],
  [38, 42, 8, 10, 115, -.25, .82, .18],
  [22, 44, 6, 8, 85, .20, .55, .25],
  [11.7, 54, 3.3, 5.7, 32, -.20, .29, .34],
  [-44, -1, 6, 8, 55, -.25, .72, .31],
  [44, 10, 5.8, 10, 65, .10, .91, .36],
  [45, -31, 5, 7, 48, .10, .47, .42],
  [35, -61, 5.8, 8, 55, -.15, .02, .49],
  [68, 33, 7, 11, 70, -.25, .37, .37],
  [67, 65, 9, 9, 60, .45, .71, .50],
  [66, -5, 7, 11, 65, .25, .91, .44],
  [-52, 57, 10, 9, 65, -.50, .52, .47],
  [-62, 22, 12, 10, 60, .30, .30, .54],
  [-58, -32, 11, 10, 65, -.30, .81, .58],
  [-48, -63, 10, 8, 55, .20, .60, .64],
  [67, -58, 9, 9, 55, .10, .23, .65],
  [-34, 73, 11, 8, 50, -.20, .09, .60],
  [29, 73, 12, 8, 50, .20, .67, .63],
  [-24, -65, 6, 7, 28, -.30, .43, .47],
  [23, -65, 6, 6, 28, .20, .89, .53],
  [-15, -33, 3.7, 4.4, 20, .25, .14, .39],
  [14, -32, 3.8, 4.2, 20, -.25, .62, .43],
];

/**
 * Return fixed world-space flower anchors for a single instanced GPU batch.
 * y is the terrain anchor, not the tip; height and size describe the stem and
 * crown separately. seed/palette/opening all remain in [0, 1].
 */
export function createFlowerLayout(groundHeight) {
  if (typeof groundHeight !== 'function') throw new TypeError('A groundHeight sampler is required');
  let state = 0x5f3759df;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const flowers = [];
  const cells = new Map();
  const separation = .48;
  const cellKey = (x, z) => `${x},${z}`;
  function hasSpace(x, z) {
    const ix = Math.floor(x / separation), iz = Math.floor(z / separation);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const p of cells.get(cellKey(ix + dx, iz + dz)) || []) {
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < separation ** 2) return false;
      }
    }
    return true;
  }

  for (let bedIndex = 0; bedIndex < BEDS.length; bedIndex++) {
    const [cx, cz, rx, rz, count, rotation, colour, wave] = BEDS[bedIndex];
    const c = Math.cos(rotation), s = Math.sin(rotation);
    let planted = 0;
    // Hard cap keeps initialization finite even with an unsuitable sampler.
    for (let attempt = 0; planted < count && attempt < count * 90; attempt++) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random());
      const edge = .84 + .12 * Math.sin(angle * 3 + bedIndex * 1.37)
        + .09 * Math.sin(angle * 5 - bedIndex * .77);
      const u = Math.cos(angle) * radius * rx * edge;
      const v = Math.sin(angle) * radius * rz * edge;
      const x = cx + u * c - v * s, z = cz + u * s + v * c;
      // Low-frequency gaps break up each bed into naturally joined bouquets.
      const patch = Math.sin(x * .43 + bedIndex) * Math.cos(z * .37 - bedIndex * .6);
      if (patch < -.47 && random() < .88) continue;
      if (!isFlowerSiteAllowed(x, z, groundHeight) || !hasSpace(x, z)) continue;
      const seed = random(), far = clamp01((Math.hypot(x, z - 18) - 30) / 58);
      const flower = {
        x, y: groundHeight(x, z) + .48, z,
        height: 1 + random() * 1.05 + far * .3,
        size: .35 + random() * .37 + far * .22,
        seed,
        palette: ((colour + (random() - .5) * .24) % 1 + 1) % 1,
        opening: clamp01(wave + radius * .12 + random() * .18),
      };
      flowers.push(flower);
      const key = cellKey(Math.floor(x / separation), Math.floor(z / separation));
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(flower);
      planted++;
    }
  }
  return flowers;
}
