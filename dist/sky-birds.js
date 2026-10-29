/** Small ink-wing silhouettes, placed in five loose flocks around the set.
 * Each bird is one open brush stroke, with no solid body or image texture.
 * Motion metadata is consumed by the shared brush vertex shader.
 */
export function skyBirdStrokes() {
  const flocks = [
    { angle: 0.28, radius: 157, height: 52, count: 4 },
    { angle: 1.54, radius: 182, height: 58, count: 3 },
    { angle: 2.83, radius: 147, height: 55, count: 5 },
    { angle: 4.12, radius: 176, height: 59, count: 4 },
    { angle: 5.43, radius: 165, height: 53, count: 4 },
  ];
  const strokes = [];
  // Open M-like wing gesture: gently arched wings dip toward the tiny centre.
  const wing = [
    [-1, 0.06, -0.035], [-0.75, 0.29, 0.015], [-0.48, 0.36, 0.055],
    [-0.23, 0.19, 0.09], [0, -0.08, 0.12],
    [0.23, 0.19, 0.09], [0.48, 0.36, 0.055], [0.75, 0.29, 0.015], [1, 0.06, -0.035],
  ];
  flocks.forEach((flock, groupIndex) => {
    for (let i = 0; i < flock.count; i++) {
      const trail = i - (flock.count - 1) / 2;
      const angle = flock.angle + trail * 0.034;
      const radius = flock.radius + Math.sin(i * 1.73 + groupIndex) * 4.2;
      const x = Math.sin(angle) * radius;
      const y = flock.height - Math.abs(trail) * 1.15 + Math.sin(i * 1.4 + groupIndex) * 0.95;
      const z = Math.cos(angle) * radius;
      const span = 1.25 + ((i * 3 + groupIndex * 2) % 7) * 0.105;
      const lean = Math.sin(i * 1.8 + groupIndex) * 0.075;
      const points = wing.map(([wx, wy, wz]) => [
        x + wx * span,
        y + wy * span + wx * lean,
        z + wz * span,
      ]);
      strokes.push({
        points,
        color: groupIndex % 2 ? 0x2b4947 : 0x263e3b,
        weight: 1.65 + ((i + groupIndex) % 4) * 0.15,
        kind: 'sky-bird',
        opacity: 0.84 + ((i * 2 + groupIndex) % 4) * 0.025,
        wind: 4,
        motionAnchor: [x, y, z],
        motionPhase: groupIndex * 1.37 + i * 0.43,
        motionScale: 0.88 + ((i + groupIndex * 2) % 5) * 0.07,
      });
    }
  });
  return strokes;
}
