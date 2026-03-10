// recognition-core.js — Shared letter recognition logic
// Used by letter_recognition.html and practice.html
// Depends on: stroke-core.js (analyzeStroke, clockAngle)

// ============================================================
// Constants
// ============================================================
const LABEL_MAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const MODEL_URL = 'emnist_model.onnx';
const SEQ_MODEL_URL = 'sequence_model.onnx';
const SEQ_IMG_HEIGHT = 64;
const SEQ_LABEL_MAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ASCENDER_LINE = 4, MIDLINE = 24, BASELINE = 48, DESCENDER_LINE = 60;
const UPPERCASE_SET = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
const ASCENDER_LC_SET = new Set('bdfhklt');
const DESCENDER_LC_SET = new Set('gjpqy');

const TONE_MAP = {
  'a': ['ā', 'á', 'ǎ', 'à'],
  'o': ['ō', 'ó', 'ǒ', 'ò'],
  'e': ['ē', 'é', 'ě', 'è'],
  'u': ['ū', 'ú', 'ǔ', 'ù'],
  'ü': ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

// Reverse map: toned char → {base, tone}
const TONE_DECOMPOSE = {};
for (const [base, toned] of Object.entries(TONE_MAP)) {
  for (let i = 0; i < toned.length; i++) {
    TONE_DECOMPOSE[toned[i]] = { base, tone: i + 1 };
  }
}

// ============================================================
// Pure utility functions
// ============================================================
function strokeBBox(pts) {
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  for (const p of pts) {
    if (p.x < x1) x1 = p.x;
    if (p.x > x2) x2 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.y > y2) y2 = p.y;
  }
  return { x1, x2, y1, y2 };
}

function bboxOverlapX(a, b) {
  return a.x1 <= b.x2 && b.x1 <= a.x2;
}

function unionBBox(a, b) {
  return {
    x1: Math.min(a.x1, b.x1), x2: Math.max(a.x2, b.x2),
    y1: Math.min(a.y1, b.y1), y2: Math.max(a.y2, b.y2),
  };
}

function softmax(arr) {
  const max = Math.max(...arr);
  const exps = arr.map(x => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(x => x / sum);
}

// ============================================================
// Bitmap connectivity (needs canvas context)
// ============================================================
function getBitmapComponents(drawCtx, canvasW, canvasH) {
  const imgData = drawCtx.getImageData(0, 0, canvasW, canvasH);
  const d = imgData.data;
  const label = new Int32Array(canvasW * canvasH).fill(-1);
  let nextLabel = 0;

  for (let y = 0; y < canvasH; y++) {
    for (let x = 0; x < canvasW; x++) {
      const idx = y * canvasW + x;
      if (d[idx * 4 + 3] > 30 && label[idx] === -1) {
        const queue = [idx];
        label[idx] = nextLabel;
        let head = 0;
        while (head < queue.length) {
          const ci = queue[head++];
          const cx = ci % canvasW, cy = (ci - cx) / canvasW;
          for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && nx < canvasW && ny >= 0 && ny < canvasH) {
              const ni = ny * canvasW + nx;
              if (d[ni * 4 + 3] > 30 && label[ni] === -1) {
                label[ni] = nextLabel;
                queue.push(ni);
              }
            }
          }
        }
        nextLabel++;
      }
    }
  }
  return label;
}

function strokeToComponent(stroke, label, canvasW, canvasH) {
  for (const p of stroke) {
    const x = Math.round(p.x), y = Math.round(p.y);
    if (x >= 0 && x < canvasW && y >= 0 && y < canvasH) {
      const l = label[y * canvasW + x];
      if (l >= 0) return l;
    }
  }
  return -1;
}

// ============================================================
// Segmentation: group strokes into letters
// ============================================================
function segmentLettersByStrokes(allStrokes, drawCtx, canvasW, canvasH) {
  if (allStrokes.length === 0) return [];

  const bboxes = allStrokes.map(s => strokeBBox(s));

  const parent = bboxes.map((_, i) => i);
  function find(i) { return parent[i] === i ? i : (parent[i] = find(parent[i])); }
  function unite(a, b) { parent[find(a)] = find(b); }

  const bitmapLabel = getBitmapComponents(drawCtx, canvasW, canvasH);
  const strokeComps = allStrokes.map(s => strokeToComponent(s, bitmapLabel, canvasW, canvasH));
  for (let i = 0; i < allStrokes.length; i++) {
    for (let j = i + 1; j < allStrokes.length; j++) {
      if (strokeComps[i] >= 0 && strokeComps[i] === strokeComps[j]) unite(i, j);
    }
  }

  for (let i = 0; i < bboxes.length; i++) {
    for (let j = i + 1; j < bboxes.length; j++) {
      if (bboxOverlapX(bboxes[i], bboxes[j])) unite(i, j);
    }
  }

  const groups = {};
  for (let i = 0; i < bboxes.length; i++) {
    const root = find(i);
    if (!groups[root]) groups[root] = [];
    groups[root].push(i);
  }

  let letters = Object.values(groups).map(indices => {
    let bbox = bboxes[indices[0]];
    for (let k = 1; k < indices.length; k++) bbox = unionBBox(bbox, bboxes[indices[k]]);
    const strokes = indices.map(i => allStrokes[i]);
    return { bbox, strokes };
  });
  letters.sort((a, b) => a.bbox.x1 - b.bbox.x1);

  // Merge small strokes into nearest letter
  const SMALL_SIZE = 15;
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < letters.length; i++) {
      const b = letters[i].bbox;
      const w = b.x2 - b.x1, h = b.y2 - b.y1;
      if (w < SMALL_SIZE && h < SMALL_SIZE && letters.length > 1) {
        let bestIdx = -1, bestDist = Infinity;
        for (let j = 0; j < letters.length; j++) {
          if (j === i) continue;
          const ob = letters[j].bbox;
          const dist = Math.max(0, b.x1 - ob.x2, ob.x1 - b.x2);
          if (dist < bestDist) { bestDist = dist; bestIdx = j; }
        }
        if (bestIdx >= 0 && bestDist <= 15) {
          letters[bestIdx].strokes = letters[bestIdx].strokes.concat(letters[i].strokes);
          letters[bestIdx].bbox = unionBBox(letters[bestIdx].bbox, b);
          letters.splice(i, 1);
          merged = true;
          break;
        }
      }
    }
  }

  return letters;
}

// ============================================================
// Preprocessing: segment → 28x28 (white on black)
// ============================================================
function segmentTo28x28(bbox, drawCanvas) {
  const { x1, x2, y1, y2 } = bbox;
  const sw = x2 - x1 + 1, sh = y2 - y1 + 1;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = sw; tempCanvas.height = sh;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(drawCanvas, x1, y1, sw, sh, 0, 0, sw, sh);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = 28; outCanvas.height = 28;
  const outCtx = outCanvas.getContext('2d');

  const scale = Math.min(20 / sw, 20 / sh);
  const dw = Math.round(sw * scale), dh = Math.round(sh * scale);
  const dx = Math.round((28 - dw) / 2), dy = Math.round((28 - dh) / 2);
  outCtx.drawImage(tempCanvas, 0, 0, sw, sh, dx, dy, dw, dh);

  const outData = outCtx.getImageData(0, 0, 28, 28);
  const pixels = new Float32Array(28 * 28);
  for (let i = 0; i < 28 * 28; i++) {
    const idx = i * 4;
    const a = outData.data[idx + 3];
    if (a < 30) {
      pixels[i] = 0;
    } else {
      const lum = (outData.data[idx] + outData.data[idx + 1] + outData.data[idx + 2]) / 3;
      pixels[i] = (255 - lum) / 255.0;
    }
  }

  // Preview canvas (black bg, white ink)
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = 28; previewCanvas.height = 28;
  const previewCtx = previewCanvas.getContext('2d');
  previewCtx.fillStyle = '#000';
  previewCtx.fillRect(0, 0, 28, 28);
  const previewData = previewCtx.getImageData(0, 0, 28, 28);
  for (let i = 0; i < 28 * 28; i++) {
    const v = Math.round(pixels[i] * 255);
    const idx = i * 4;
    previewData.data[idx] = v;
    previewData.data[idx + 1] = v;
    previewData.data[idx + 2] = v;
    previewData.data[idx + 3] = 255;
  }
  previewCtx.putImageData(previewData, 0, 0);

  return { pixels, canvas: previewCanvas };
}

// ============================================================
// Stroke intersection check
// ============================================================
function strokesIntersect(s1, s2, margin = 4) {
  const sample = (pts, n) => {
    if (pts.length <= n) return pts;
    const out = [];
    for (let i = 0; i < n; i++) out.push(pts[Math.floor(i * pts.length / n)]);
    return out;
  };
  const a = sample(s1, 30);
  const b = sample(s2, 30);
  for (const p of a) {
    for (const q of b) {
      const dx = p.x - q.x, dy = p.y - q.y;
      if (dx * dx + dy * dy <= margin * margin) return true;
    }
  }
  return false;
}

// ============================================================
// Vertical sub-grouping (tone marks above base letter)
// ============================================================
function subGroupStrokesVertically(strokes, drawCtx, canvasW, canvasH) {
  if (strokes.length <= 1) return null;

  const parent = strokes.map((_, i) => i);
  function find(i) { return parent[i] === i ? i : (parent[i] = find(parent[i])); }
  function unite(a, b) { parent[find(a)] = find(b); }

  const bitmapLabel = getBitmapComponents(drawCtx, canvasW, canvasH);
  const comps = strokes.map(s => strokeToComponent(s, bitmapLabel, canvasW, canvasH));
  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      if (comps[i] >= 0 && comps[i] === comps[j]) unite(i, j);
    }
  }

  const groupMap = {};
  for (let i = 0; i < strokes.length; i++) {
    const root = find(i);
    if (!groupMap[root]) groupMap[root] = [];
    groupMap[root].push(i);
  }

  const groups = Object.values(groupMap).map(indices => {
    const bboxes = indices.map(i => strokeBBox(strokes[i]));
    let bbox = bboxes[0];
    for (let k = 1; k < bboxes.length; k++) bbox = unionBBox(bbox, bboxes[k]);
    return { strokes: indices.map(i => strokes[i]), bbox };
  });

  if (groups.length <= 1) return null;

  groups.sort((a, b) => (a.bbox.y1 + a.bbox.y2) / 2 - (b.bbox.y1 + b.bbox.y2) / 2);

  const base = groups[groups.length - 1].bbox;
  const fullBBox = groups.reduce((acc, g) => unionBBox(acc, g.bbox), groups[0].bbox);
  const midY = (fullBBox.y1 + fullBBox.y2) / 2;
  for (let i = 0; i < groups.length - 1; i++) {
    const g = groups[i].bbox;
    const overlapX = Math.min(base.x2, g.x2) - Math.max(base.x1, g.x1);
    const minWidth = Math.min(base.x2 - base.x1, g.x2 - g.x1);
    if (minWidth > 0 && overlapX / minWidth < 0.3) return null;
    if (g.y2 > midY) return null;
  }

  return groups;
}

// ============================================================
// Tone detection from a single stroke
// ============================================================
function detectTone(stroke) {
  const a = analyzeStroke(stroke);
  if (a.kind === 'multiline') return 3;
  if (a.kind === 'line') {
    const first = stroke[0], last = stroke[stroke.length - 1];
    const left = first.x <= last.x ? first : last;
    const right = first.x <= last.x ? last : first;
    const angle = clockAngle(left, right);
    if (angle >= 80 && angle <= 100) return 1;
    if (angle >= 15 && angle < 80) return 2;
    if (angle > 100 && angle <= 165) return 4;
  }
  return 0;
}

// ============================================================
// Q vs a disambiguation
// ============================================================
function isQByStrokes(strokes, letterBBox, analyses) {
  if (strokes.length < 2) return { isQ: false, reason: 'single stroke' };

  let hasLargeArc = false;
  let hasLine = false;
  let arcData = null, lineStroke = null;

  for (let i = 0; i < analyses.length; i++) {
    const a = analyses[i];
    if (a.kind === 'arc' && Math.abs(a.data.sweepDeg) > 300) {
      hasLargeArc = true;
      arcData = a.data;
    }
    if (a.kind === 'line') {
      hasLine = true;
      lineStroke = strokes[i];
    }
  }

  if (!hasLargeArc) return { isQ: false, reason: 'no large arc (>300deg)' };
  if (!hasLine) return { isQ: false, reason: 'no line stroke' };

  const bw = letterBBox.x2 - letterBBox.x1;
  const bh = letterBBox.y2 - letterBBox.y1;
  const lineBBox = strokeBBox(lineStroke);
  const lineMidX = (lineBBox.x1 + lineBBox.x2) / 2;
  const lineMidY = (lineBBox.y1 + lineBBox.y2) / 2;

  const inBottomHalf = lineMidY > letterBBox.y1 + bh * 0.4;
  const inRightHalf = lineMidX > letterBBox.x1 + bw * 0.3;

  if (!inBottomHalf || !inRightHalf) {
    return { isQ: false, reason: `line not at bottom-right (botHalf=${inBottomHalf}, rightHalf=${inRightHalf})` };
  }
  return { isQ: true, reason: 'arc>300 + line at bottom-right' };
}

// ============================================================
// Left tail detection (g vs q, j vs i)
// ============================================================
function hasLeftTail(strokes) {
  const result = { hasTail: false, tailPts: [], angle: 0 };
  if (strokes.length === 0) return result;

  let lowestStroke = null, lowestY = -Infinity;
  for (const s of strokes) {
    for (const p of s) {
      if (p.y > lowestY) { lowestY = p.y; lowestStroke = s; }
    }
  }
  if (!lowestStroke || lowestStroke.length < 4) return result;

  let minY = Infinity, maxY = -Infinity;
  for (const p of lowestStroke) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const midY = (minY + maxY) / 2;

  const tailPts = [];
  for (let i = lowestStroke.length - 1; i >= 0; i--) {
    tailPts.push(lowestStroke[i]);
    if (lowestStroke[i].y <= midY) break;
  }
  tailPts.reverse();
  result.tailPts = tailPts;
  if (tailPts.length < 3) return result;

  const tailAnalysis = analyzeStroke(tailPts);
  result.tailKind = tailAnalysis.kind;

  if (tailAnalysis.kind === 'line') {
    result.angle = tailAnalysis.data.angle;
    result.hasTail = false;
  } else if (tailAnalysis.kind === 'multiline' && tailAnalysis.data.segments.length >= 2) {
    const segs = tailAnalysis.data.segments;
    const lastSeg = segs[segs.length - 1];
    const rad = lastSeg.angle * Math.PI / 180;
    const dx = lastSeg.length * Math.sin(rad);
    result.angle = lastSeg.angle;
    result.hasTail = dx < -3;
  } else {
    const first = tailPts[0], last = tailPts[tailPts.length - 1];
    const dx = last.x - first.x;
    result.angle = Math.round((Math.atan2(dx, -(last.y - first.y)) * 180 / Math.PI + 360) % 360);
    result.hasTail = dx < -3;
  }
  return result;
}

// ============================================================
// Enclosed region detection (ring/hole in 28x28 bitmap)
// ============================================================
function hasEnclosedRegion(pixels) {
  const S = 28;
  const INK_THRESH = 0.3;
  const grid = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) grid[i] = pixels[i] > INK_THRESH ? 1 : 0;

  const queue = [];
  for (let x = 0; x < S; x++) {
    if (grid[x] === 0) { grid[x] = 2; queue.push(x); }
    const b = (S - 1) * S + x;
    if (grid[b] === 0) { grid[b] = 2; queue.push(b); }
  }
  for (let y = 1; y < S - 1; y++) {
    const l = y * S;
    if (grid[l] === 0) { grid[l] = 2; queue.push(l); }
    const r = y * S + S - 1;
    if (grid[r] === 0) { grid[r] = 2; queue.push(r); }
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % S, y = (idx - x) / S;
    if (x > 0 && grid[idx - 1] === 0) { grid[idx - 1] = 2; queue.push(idx - 1); }
    if (x < S - 1 && grid[idx + 1] === 0) { grid[idx + 1] = 2; queue.push(idx + 1); }
    if (y > 0 && grid[idx - S] === 0) { grid[idx - S] = 2; queue.push(idx - S); }
    if (y < S - 1 && grid[idx + S] === 0) { grid[idx + S] = 2; queue.push(idx + S); }
  }

  let enclosed = 0;
  for (let i = 0; i < S * S; i++) {
    if (grid[i] === 0) enclosed++;
  }
  return enclosed > 3;
}

// ============================================================
// CTC greedy decode
// ============================================================
function ctcGreedyDecode(logits, T, numClasses) {
  const decoded = [];
  let prev = 0;
  for (let t = 0; t < T; t++) {
    let maxVal = -Infinity, maxIdx = 0;
    for (let c = 0; c <= numClasses; c++) {
      const val = logits[t * (numClasses + 1) + c];
      if (val > maxVal) { maxVal = val; maxIdx = c; }
    }
    if (maxIdx !== 0 && maxIdx !== prev) {
      decoded.push(maxIdx - 1);
    }
    prev = maxIdx;
  }
  return decoded;
}

// ============================================================
// Full single-letter recognition with post-processing
// Returns { word, letters, debugLog }
// ============================================================
async function recognizeLetters(allStrokes, drawCanvas, drawCtx, canvasW, canvasH, session, inputName, outputName) {
  const letters = segmentLettersByStrokes(allStrokes, drawCtx, canvasW, canvasH);
  if (letters.length === 0) return { word: '', letters: [], debugLog: '' };

  async function classifyBBox(bbox) {
    const { pixels } = segmentTo28x28(bbox, drawCanvas);
    const tensor = new ort.Tensor('float32', pixels, [1, 1, 28, 28]);
    const feeds = {};
    feeds[inputName] = tensor;
    const results = await session.run(feeds);
    const logits = results[outputName].data;
    const probs = softmax(Array.from(logits));
    const indexed = probs.map((p, i) => ({ ch: LABEL_MAP[i], p, i }));
    indexed.sort((a, b) => b.p - a.p);
    return indexed;
  }

  let debugLog = '';
  let word = '';
  const letterResults = [];

  for (let li = 0; li < letters.length; li++) {
    const letter = letters[li];
    const { pixels, canvas } = segmentTo28x28(letter.bbox, drawCanvas);
    const analyses = letter.strokes.map(s => analyzeStroke(s));
    const fullPreds = await classifyBBox(letter.bbox);
    const top3 = fullPreds.slice(0, 3);

    let ch = top3[0].ch;
    let maxProb = top3[0].p;

    const top3Str = top3.map((t, k) =>
      `  ${k + 1}. '${t.ch}' ${(t.p * 100).toFixed(1)}%`
    ).join('\n');

    debugLog += `=== Letter ${li + 1} (${letter.strokes.length} strokes) ===\n`;
    debugLog += `Full top 3:\n${top3Str}\n`;

    for (let si = 0; si < analyses.length; si++) {
      const a = analyses[si];
      let info = `Stroke ${si + 1}: ${a.kind}`;
      if (a.kind === 'line') info += ` angle=${a.data.angle}° len=${a.data.length}`;
      else if (a.kind === 'arc') info += ` sweep=${a.data.sweepDeg}° r=${a.data.radius} dir=${a.data.direction}`;
      else if (a.kind === 'multiline') info += ` segs=${a.data.segments.length}`;
      debugLog += `  ${info}\n`;
    }

    // Post-processing: Q/a
    const top2ch = top3[1].ch;
    const isQaConfusion = (ch === 'Q' && top2ch === 'a') || (ch === 'a' && top2ch === 'Q');
    if (isQaConfusion) {
      const result = isQByStrokes(letter.strokes, letter.bbox, analyses);
      ch = result.isQ ? 'Q' : 'a';
      debugLog += `  Q/a rule: ${result.reason} → '${ch}'\n`;
    }

    // D/O rule
    if (ch === 'D' || ch === 'O' || ch === 'o') {
      const nStrokes = letter.strokes.length;
      const hasVerticalLine = analyses.some(a =>
        a.kind === 'line' && a.data.angle >= 150 && a.data.angle <= 210
      );
      if (ch === 'D' && (nStrokes === 1 || !hasVerticalLine)) {
        const oMatch = top3.find(t => t.ch === 'O' || t.ch === 'o');
        ch = oMatch ? oMatch.ch : 'O';
        debugLog += `  D/O rule → '${ch}'\n`;
      } else if ((ch === 'O' || ch === 'o') && nStrokes === 2 && hasVerticalLine) {
        if (top3.some(t => t.ch === 'D')) {
          ch = 'D';
          debugLog += `  D/O rule → 'D'\n`;
        }
      }
    }

    // h/b rule
    if (ch === 'b') {
      const hasRing = hasEnclosedRegion(pixels);
      if (!hasRing && top3.some(t => t.ch === 'h')) {
        ch = 'h';
        debugLog += `  h/b rule: no ring → 'h'\n`;
      }
    } else if (ch === 'h') {
      const hasRing = hasEnclosedRegion(pixels);
      if (hasRing && top3.some(t => t.ch === 'b')) {
        ch = 'b';
        debugLog += `  h/b rule: has ring → 'b'\n`;
      }
    }

    // i/j rule
    if ((ch === 'i' || ch === 'j') && top3.some(t => t.ch === 'i') && top3.some(t => t.ch === 'j')) {
      const tail = hasLeftTail(letter.strokes);
      ch = tail.hasTail ? 'j' : 'i';
      debugLog += `  i/j rule: tail ${tail.tailKind} → '${ch}'\n`;
    }

    // g/q rule
    if ((ch === 'g' || ch === 'q') && top3.some(t => t.ch === 'g') && top3.some(t => t.ch === 'q')) {
      const tail = hasLeftTail(letter.strokes);
      ch = tail.hasTail ? 'g' : 'q';
      debugLog += `  g/q rule: tail ${tail.tailKind} → '${ch}'\n`;
    }

    // Pinyin tone detection
    {
      const vGroups = subGroupStrokesVertically(letter.strokes, drawCtx, canvasW, canvasH);
      if (vGroups) {
        if ((ch === 'I' || ch === 'J') && vGroups.length > 1) {
          const tail = hasLeftTail(letter.strokes);
          ch = tail.hasTail ? 'j' : 'i';
          debugLog += `  I/J + dot → '${ch}'\n`;
        } else {
          const lowestGroup = vGroups[vGroups.length - 1];
          const upperGroups = vGroups.slice(0, -1);
          const upperStrokes = upperGroups.flatMap(g => g.strokes);

          const basePreds = await classifyBBox(lowestGroup.bbox);
          const baseTop3 = basePreds.slice(0, 3);
          let baseCh = baseTop3[0].ch;

          debugLog += `  Vertical groups: ${vGroups.length}\n`;
          debugLog += `  Base top 3: ${baseTop3.slice(0, 3).map(t => `'${t.ch}' ${(t.p*100).toFixed(0)}%`).join(', ')}\n`;

          // Base Q/a rule
          const baseTop2 = baseTop3[1].ch;
          const baseQa = (baseCh === 'Q' && baseTop2 === 'a') || (baseCh === 'a' && baseTop2 === 'Q');
          if (baseQa) {
            const baseAnalyses = lowestGroup.strokes.map(s => analyzeStroke(s));
            const result = isQByStrokes(lowestGroup.strokes, lowestGroup.bbox, baseAnalyses);
            baseCh = result.isQ ? 'Q' : 'a';
          }

          // Base D/O rule
          if (baseCh === 'D' || baseCh === 'O' || baseCh === 'o') {
            const baseNStrokes = lowestGroup.strokes.length;
            const baseAnalyses = lowestGroup.strokes.map(s => analyzeStroke(s));
            const baseHasVert = baseAnalyses.some(a =>
              a.kind === 'line' && a.data.angle >= 150 && a.data.angle <= 210
            );
            if (baseCh === 'D' && (baseNStrokes === 1 || !baseHasVert)) {
              const oMatch = baseTop3.find(t => t.ch === 'O' || t.ch === 'o');
              baseCh = oMatch ? oMatch.ch : 'O';
            } else if ((baseCh === 'O' || baseCh === 'o') && baseNStrokes === 2 && baseHasVert) {
              if (baseTop3.some(t => t.ch === 'D')) baseCh = 'D';
            }
          }

          const baseLC = baseCh.toLowerCase();
          if (baseLC === 'i' || baseLC === 'j') {
            ch = baseCh.toLowerCase();
            debugLog += `  Base is '${baseCh}', dot confirmed → '${ch}'\n`;
          } else if (baseLC === 'a' || baseLC === 'o' || baseLC === 'e' || baseLC === 'u') {
            const numUpper = upperStrokes.length;
            if (baseLC === 'u' && numUpper >= 2) {
              if (numUpper === 2) {
                ch = 'ü';
                debugLog += `  Pinyin: u + 2 dots → ü\n`;
              } else {
                const upperWithBBox = upperStrokes.map(s => ({ s, bbox: strokeBBox(s) }));
                upperWithBBox.sort((a, b) => a.bbox.y1 - b.bbox.y1);
                const tone = detectTone(upperWithBBox[0].s);
                if (tone >= 1 && tone <= 4) {
                  ch = TONE_MAP['ü'][tone - 1];
                  debugLog += `  Pinyin: ü + tone ${tone} → ${ch}\n`;
                } else {
                  ch = 'ü';
                }
              }
            } else if (numUpper >= 1) {
              let toneStroke = upperStrokes[0];
              if (upperStrokes.length > 1) {
                const sorted = upperStrokes.map(s => ({ s, bbox: strokeBBox(s) }));
                sorted.sort((a, b) => a.bbox.y1 - b.bbox.y1);
                toneStroke = sorted[0].s;
              }
              const tone = detectTone(toneStroke);
              if (tone >= 1 && tone <= 4 && TONE_MAP[baseLC]) {
                ch = TONE_MAP[baseLC][tone - 1];
                debugLog += `  Pinyin: ${baseLC} + tone ${tone} → ${ch}\n`;
              } else {
                ch = baseCh;
              }
            }
          } else {
            // Base not a vowel — check if full result is
            const fullLC = ch.toLowerCase();
            if (fullLC === 'a' || fullLC === 'o' || fullLC === 'e' || fullLC === 'u') {
              debugLog += `  Base '${baseCh}' not vowel, full '${ch}' is — using full for tone\n`;
              const numUpper = upperStrokes.length;
              if (fullLC === 'u' && numUpper >= 2) {
                if (numUpper === 2) {
                  ch = 'ü';
                } else {
                  const upperWithBBox = upperStrokes.map(s => ({ s, bbox: strokeBBox(s) }));
                  upperWithBBox.sort((a, b) => a.bbox.y1 - b.bbox.y1);
                  const tone = detectTone(upperWithBBox[0].s);
                  ch = (tone >= 1 && tone <= 4) ? TONE_MAP['ü'][tone - 1] : 'ü';
                }
              } else if (numUpper >= 1) {
                let toneStroke = upperStrokes[0];
                if (upperStrokes.length > 1) {
                  const sorted = upperStrokes.map(s => ({ s, bbox: strokeBBox(s) }));
                  sorted.sort((a, b) => a.bbox.y1 - b.bbox.y1);
                  toneStroke = sorted[0].s;
                }
                const tone = detectTone(toneStroke);
                if (tone >= 1 && tone <= 4 && TONE_MAP[fullLC]) {
                  ch = TONE_MAP[fullLC][tone - 1];
                  debugLog += `  Pinyin: ${fullLC} + tone ${tone} → ${ch}\n`;
                }
              }
            } else {
              debugLog += `  Base '${baseCh}' not a vowel, keeping '${ch}'\n`;
            }
          }
        }
      }
    }

    debugLog += `  → Chosen: '${ch}'\n\n`;
    word += ch;
    letterResults.push({ ch, prob: maxProb, bbox: letter.bbox, strokes: letter.strokes, canvas, analyses });
  }

  return { word, letters: letterResults, debugLog };
}

// ============================================================
// Guide line drawing helper
// ============================================================
function drawGuideLines(ctx, canvasW, canvasH, showLabels) {
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);

  const lines = [
    { y: Math.round(canvasH * ASCENDER_LINE / SEQ_IMG_HEIGHT), color: 'rgba(255,80,80,0.25)', label: 'ascender' },
    { y: Math.round(canvasH * MIDLINE / SEQ_IMG_HEIGHT), color: 'rgba(80,80,255,0.3)', label: 'x-height' },
    { y: Math.round(canvasH * BASELINE / SEQ_IMG_HEIGHT), color: 'rgba(80,200,80,0.35)', label: 'baseline' },
    { y: Math.round(canvasH * DESCENDER_LINE / SEQ_IMG_HEIGHT), color: 'rgba(200,200,80,0.25)', label: 'descender' },
  ];
  for (const { y, color, label } of lines) {
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y); ctx.stroke();
    if (showLabels) {
      ctx.fillStyle = color;
      ctx.font = '10px sans-serif';
      ctx.fillText(label, 4, y - 2);
    }
  }
  ctx.setLineDash([]);
}

// ============================================================
// Drawing setup helper — returns { allStrokes, bindCanvas, clearCanvas }
// ============================================================
function setupDrawing(drawCanvas, drawCtx, penSize, onStrokeEnd) {
  let isDrawing = false;
  let allStrokes = [];
  let currentStroke = null;
  const canvasW = drawCanvas.width;
  const canvasH = drawCanvas.height;

  function getPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const sx = canvasW / rect.width, sy = canvasH / rect.height;
    if (e.touches) return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy };
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function mouseFromTouch(e) {
    const t = e.touches[0] || e.changedTouches[0];
    return { clientX: t.clientX, clientY: t.clientY, button: 0 };
  }

  drawCanvas.addEventListener('mousedown', e => {
    isDrawing = true;
    const p = getPos(e);
    currentStroke = [p];
    drawCtx.lineWidth = penSize();
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';
    drawCtx.strokeStyle = '#222';
    drawCtx.beginPath();
    drawCtx.moveTo(p.x, p.y);
  });

  drawCanvas.addEventListener('mousemove', e => {
    if (!isDrawing) return;
    const p = getPos(e);
    currentStroke.push(p);
    drawCtx.lineTo(p.x, p.y);
    drawCtx.stroke();
    drawCtx.beginPath();
    drawCtx.moveTo(p.x, p.y);
  });

  function endStroke() {
    if (isDrawing && currentStroke && currentStroke.length >= 2) {
      allStrokes.push(currentStroke);
      if (onStrokeEnd) onStrokeEnd(allStrokes);
    }
    isDrawing = false;
    currentStroke = null;
  }

  drawCanvas.addEventListener('mouseup', endStroke);
  drawCanvas.addEventListener('mouseleave', endStroke);

  drawCanvas.addEventListener('touchstart', e => { e.preventDefault(); drawCanvas.dispatchEvent(new MouseEvent('mousedown', mouseFromTouch(e))); }, { passive: false });
  drawCanvas.addEventListener('touchmove', e => { e.preventDefault(); drawCanvas.dispatchEvent(new MouseEvent('mousemove', mouseFromTouch(e))); }, { passive: false });
  drawCanvas.addEventListener('touchend', e => { e.preventDefault(); endStroke(); }, { passive: false });

  function redrawAllStrokes() {
    drawCtx.clearRect(0, 0, canvasW, canvasH);
    drawCtx.beginPath(); // reset any stale path state
    for (const stroke of allStrokes) {
      if (stroke.length < 2) continue;
      drawCtx.lineWidth = penSize();
      drawCtx.lineCap = 'round';
      drawCtx.lineJoin = 'round';
      drawCtx.strokeStyle = '#222';
      drawCtx.beginPath();
      drawCtx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        drawCtx.lineTo(stroke[i].x, stroke[i].y);
      }
      drawCtx.stroke();
    }
  }

  return {
    getStrokes: () => allStrokes,
    clearStrokes: () => {
      allStrokes = [];
      currentStroke = null;
      drawCtx.clearRect(0, 0, canvasW, canvasH);
    },
    undoStroke: () => {
      console.log('undoStroke called, allStrokes.length:', allStrokes.length);
      if (allStrokes.length === 0) return;
      allStrokes.pop();
      console.log('after pop, allStrokes.length:', allStrokes.length);
      redrawAllStrokes();
      if (onStrokeEnd) onStrokeEnd(allStrokes);
    },
  };
}
