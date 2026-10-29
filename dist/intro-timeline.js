// A seekable, stateless schedule. All public times are integer milliseconds;
// creditTime/storyTime deliberately remain negative or exceed their local clip.
const MAX_TIME = Number.MAX_SAFE_INTEGER;
const clamp01 = value => Math.max(0, Math.min(1, value));

function milliseconds(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new RangeError(`${name} must be finite`);
  const rounded = Math.max(0, Math.round(number));
  if (!Number.isSafeInteger(rounded)) throw new RangeError(`${name} exceeds safe millisecond precision`);
  return rounded;
}

function safeSum(...values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total) || total > MAX_TIME) {
    throw new RangeError('Timeline exceeds safe millisecond precision');
  }
  return total;
}

export function createIntroTimeline({
  drawingMs = 6000,
  rotationMs = 11000,
  creditsMs = 0,
  storyMs = 0,
  showAtRotation = .28,
  storyGapMs = 350,
} = {}) {
  const drawing = milliseconds(drawingMs, 'drawingMs');
  const rotation = milliseconds(rotationMs, 'rotationMs');
  const credits = milliseconds(creditsMs, 'creditsMs');
  const story = milliseconds(storyMs, 'storyMs');
  const requestedGap = milliseconds(storyGapMs, 'storyGapMs');
  const rawStart = Number(showAtRotation);
  if (!Number.isFinite(rawStart)) throw new RangeError('showAtRotation must be finite');
  const start = clamp01(rawStart);
  // At or beyond .62, the text holds the current angle instead of rotating back.
  const end = Math.max(start, Math.min(.62, start + .16));
  const before = Math.round(rotation * start);
  const through = Math.round(rotation * end);
  const naturalTextSpan = through - before;
  const after = rotation - through;
  const hasText = credits > 0 || story > 0;
  const gap = credits > 0 && story > 0 ? requestedGap : 0;
  const textWindow = safeSum(credits, gap, story);
  // Very short text must not speed up the sketch rotation. Its unused natural
  // span is retained; long text extends that span exactly as much as required.
  const textSpan = hasText ? Math.max(naturalTextSpan, textWindow) : 0;
  const creditStartMs = safeSum(drawing, before);
  const storyStartMs = safeSum(creditStartMs, credits, gap);
  const durationMs = hasText
    ? safeSum(drawing, before, textSpan, after)
    : safeSum(drawing, rotation);

  function sample(millisecondsFromStart) {
    const raw = Number(millisecondsFromStart);
    if (!Number.isFinite(raw)) throw new RangeError('sample time must be finite');
    const time = Math.round(raw);
    if (!Number.isSafeInteger(time)) throw new RangeError('sample time exceeds safe millisecond precision');
    const drawingProgress = drawing > 0 ? clamp01(time / drawing) : time < 0 ? 0 : 1;
    let rotationProgress;
    if (time < drawing) rotationProgress = 0;
    else if (time >= durationMs) rotationProgress = 1;
    else if (!hasText) rotationProgress = rotation > 0 ? clamp01((time - drawing) / rotation) : 1;
    else {
      const elapsed = time - drawing;
      if (elapsed < before) rotationProgress = start * elapsed / before;
      else if (elapsed < before + textSpan) {
        rotationProgress = start + (end - start) * (elapsed - before) / textSpan;
      } else {
        rotationProgress = after > 0 ? end + (1 - end) * (elapsed - before - textSpan) / after : 1;
      }
    }
    const creditTime = time - creditStartMs;
    const storyTime = time - storyStartMs;
    return {
      drawingProgress,
      rotationProgress: clamp01(rotationProgress),
      creditTime,
      storyTime,
      creditsActive: credits > 0 && creditTime >= 0 && creditTime < credits,
      storyActive: story > 0 && storyTime >= 0 && storyTime < story,
      phase: time < drawing ? 'drawing' : time < durationMs ? 'rotation' : 'scene',
    };
  }

  return { durationMs, creditStartMs, storyStartMs, sample };
}
