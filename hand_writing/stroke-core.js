// ============================================================
// Stroke Analysis Core
//
// Three basic types:
//   1. LINE       - all points lie close to the start->end line
//   2. MULTILINE  - points form connected straight segments with sharp corners
//   3. CURVE      - neither line nor multiline (smooth deviation)
//
// For line/multiline segments, output:
//   - start point (x, y)
//   - clock angle (0° = 12 o'clock / up, clockwise)
//   - length in px
//
// Detection logic:
//   1. Compute max deviation of all points from the start->end line
//   2. If maxDev / length < threshold → LINE
//   3. Else, RDP simplify → find sharp corners in simplified polyline
//   4. If corners found → MULTILINE (each sub-segment is a line)
//   5. Otherwise → try arc fit, then CURVE
// ============================================================

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Perpendicular distance from point p to line segment a-b
function ptLineDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

// Max deviation of pts from the line (first -> last)
function maxDeviation(pts) {
  const a = pts[0], b = pts[pts.length - 1];
  let maxD = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    maxD = Math.max(maxD, ptLineDist(pts[i], a, b));
  }
  return maxD;
}

// Ramer-Douglas-Peucker simplification
function rdp(pts, eps) {
  if (pts.length <= 2) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  let maxD = 0, maxI = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptLineDist(pts[i], a, b);
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD > eps) {
    const left = rdp(pts.slice(0, maxI + 1), eps);
    const right = rdp(pts.slice(maxI), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

// Find sharp corners in the raw points.
// Uses RDP simplified polyline to find candidate corners, then validates
// each corner against the original raw points: a true corner has raw points
// tightly following two straight lines meeting at a sharp angle.
// A smooth curve will have high deviation from the two-line fit near the corner.
function findCorners(poly, angleThr, rawPts) {
  const candidates = [];
  for (let i = 1; i < poly.length - 1; i++) {
    const p = poly[i - 1], c = poly[i], n = poly[i + 1];
    const a1 = Math.atan2(c.y - p.y, c.x - p.x);
    const a2 = Math.atan2(n.y - c.y, n.x - c.x);
    let diff = Math.abs(a2 - a1);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > angleThr && dist(p, c) > 10 && dist(c, n) > 10) {
      candidates.push({ idx: i, p, c, n });
    }
  }
  if (candidates.length === 0 || !rawPts) return [];

  // Validate each candidate against raw points
  const corners = [];
  for (const cand of candidates) {
    // Find the raw point closest to the candidate corner
    let bestRI = 0, bestD = Infinity;
    for (let ri = 0; ri < rawPts.length; ri++) {
      const d = dist(rawPts[ri], cand.c);
      if (d < bestD) { bestD = d; bestRI = ri; }
    }
    // Look at raw points in a window around the corner
    const winSize = Math.max(5, Math.floor(rawPts.length * 0.15));
    const lo = Math.max(0, bestRI - winSize);
    const hi = Math.min(rawPts.length - 1, bestRI + winSize);

    // Measure how well the raw points fit the two-line model (p->c, c->n)
    // vs. how much they deviate (which means smooth curve)
    let totalDev = 0, count = 0;
    for (let ri = lo; ri <= hi; ri++) {
      const rp = rawPts[ri];
      // Distance to the closer of the two line segments (p->c) and (c->n)
      const d1 = ptLineDist(rp, cand.p, cand.c);
      const d2 = ptLineDist(rp, cand.c, cand.n);
      totalDev += Math.min(d1, d2);
      count++;
    }
    const avgDev = totalDev / count;
    // A true sharp corner: raw points hug the two lines tightly (low deviation)
    // A smooth curve: raw points arc away from the two-line fit (high deviation)
    if (avgDev < 8) {
      corners.push(cand.idx);
    }
  }

  if (corners.length === 0) return corners;

  // Also filter tail/head noise
  const lastIdx = poly.length - 1;
  const allInTail = corners.every(c => c / lastIdx > 0.75);
  const allInHead = corners.every(c => c / lastIdx < 0.25);
  if (allInTail || allInHead) return [];

  return corners;
}

// Clock angle: 0° = 12 o'clock (up), clockwise
// In canvas coords (y-down): atan2(dy,dx) gives math angle
// clockAngle = (mathAngleDeg + 90 + 360) % 360
function clockAngle(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const mathDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  return ((mathDeg + 90) % 360 + 360) % 360;
}

// Build a line-segment descriptor
function makeLineSeg(start, end) {
  return {
    start: { x: Math.round(start.x), y: Math.round(start.y) },
    angle: Math.round(clockAngle(start, end)),
    length: Math.round(dist(start, end)),
  };
}

// --- Circle / Arc fitting (Kasa algebraic fit) ---
// Fits a circle to points, returns { cx, cy, r, error }
// error = mean absolute deviation of points from the fitted circle
function fitCircle(pts) {
  const n = pts.length;
  if (n < 3) return null;
  // Sample up to 60 points evenly for performance
  let sample = pts;
  if (n > 60) {
    sample = [];
    for (let i = 0; i < 60; i++) sample.push(pts[Math.floor(i * n / 60)]);
  }
  const m = sample.length;
  // Kasa method: minimize sum( (x-cx)^2 + (y-cy)^2 - r^2 )^2
  // Linearized: x^2+y^2 = 2*cx*x + 2*cy*y + (r^2 - cx^2 - cy^2)
  // Let A*[cx, cy, c]^T = b where each row is [2x, 2y, 1] and b = x^2+y^2
  let sx = 0, sy = 0, sx2 = 0, sy2 = 0, sxy = 0, sx3 = 0, sy3 = 0, sx2y = 0, sxy2 = 0;
  for (const p of sample) {
    const x = p.x, y = p.y;
    sx += x; sy += y;
    sx2 += x * x; sy2 += y * y; sxy += x * y;
    sx3 += x * x * x; sy3 += y * y * y;
    sx2y += x * x * y; sxy2 += x * y * y;
  }
  // Normal equations for least squares:
  // [sx2  sxy  sx] [a]   [0.5*(sx3+sxy2)]
  // [sxy  sy2  sy] [b] = [0.5*(sx2y+sy3)]
  // [sx   sy   m ] [c]   [0.5*(sx2+sy2) ]
  // where a=cx, b=cy, c = r^2 - cx^2 - cy^2
  const A = [
    [sx2, sxy, sx],
    [sxy, sy2, sy],
    [sx, sy, m],
  ];
  const B = [
    0.5 * (sx3 + sxy2),
    0.5 * (sx2y + sy3),
    0.5 * (sx2 + sy2),
  ];
  // Solve 3x3 with Cramer's rule
  const det3 = (m) =>
    m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])
   -m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])
   +m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  const D = det3(A);
  if (Math.abs(D) < 1e-10) return null;
  const Dx = det3([[B[0],A[0][1],A[0][2]],[B[1],A[1][1],A[1][2]],[B[2],A[2][1],A[2][2]]]);
  const Dy = det3([[A[0][0],B[0],A[0][2]],[A[1][0],B[1],A[1][2]],[A[2][0],B[2],A[2][2]]]);
  const cx = Dx / D;
  const cy = Dy / D;
  const Dc = det3([[A[0][0],A[0][1],B[0]],[A[1][0],A[1][1],B[1]],[A[2][0],A[2][1],B[2]]]);
  const c = Dc / D;
  // c = (r² - cx² - cy²) / 2, so r² = 2c + cx² + cy²
  const rSq = 2 * c + cx * cx + cy * cy;
  if (rSq < 1) return null;
  const r = Math.sqrt(rSq);
  if (!isFinite(r)) return null;

  // Compute mean absolute deviation from circle
  let totalErr = 0;
  for (const p of sample) {
    totalErr += Math.abs(dist(p, { x: cx, y: cy }) - r);
  }
  const error = totalErr / m;
  return { cx, cy, r, error };
}

// Compute sweep angle of an arc: from start to end around center
// direction: 'cw' (clockwise) or 'ccw'
function arcSweep(pts, cx, cy) {
  const first = pts[0], last = pts[pts.length - 1];
  const startAngle = Math.atan2(first.y - cy, first.x - cx);
  const endAngle = Math.atan2(last.y - cy, last.x - cx);

  // Determine direction by checking cross product of consecutive segments
  // relative to center
  let cwCount = 0, ccwCount = 0;
  const step = Math.max(1, Math.floor(pts.length / 20));
  for (let i = 0; i < pts.length - step; i += step) {
    const a1 = Math.atan2(pts[i].y - cy, pts[i].x - cx);
    const a2 = Math.atan2(pts[i + step].y - cy, pts[i + step].x - cx);
    let d = a2 - a1;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    if (d > 0) cwCount++;   // canvas y-down: positive angle change = clockwise
    else ccwCount++;
  }
  const clockwise = cwCount >= ccwCount;

  let sweep = endAngle - startAngle;
  if (clockwise) {
    if (sweep < 0) sweep += 2 * Math.PI;
  } else {
    if (sweep > 0) sweep -= 2 * Math.PI;
  }

  // Convert start angle to clock angle
  const startClock = ((startAngle * 180 / Math.PI + 90) % 360 + 360) % 360;
  const sweepDeg = sweep * 180 / Math.PI;

  return { startClock: Math.round(startClock), sweepDeg: Math.round(sweepDeg), clockwise };
}

// --- Main analysis ---
const LINE_THRESH = 0.12; // maxDeviation / length ratio
const CORNER_ANGLE = 1.05; // ~60 degrees in radians
const RDP_EPS = 8;
const ARC_ERR_THRESH = 0.12; // error / radius ratio for arc detection

function analyzeStroke(rawPts) {
  if (rawPts.length < 2) {
    return { kind: 'line', data: makeLineSeg(rawPts[0], rawPts[0]) };
  }

  const first = rawPts[0], last = rawPts[rawPts.length - 1];
  const totalLen = dist(first, last);

  // Very short stroke — but check for closed loop (circle) first
  if (totalLen < 10) {
    // If there are enough points, try arc fit (closed circle has start≈end)
    if (rawPts.length > 10) {
      const circle = fitCircle(rawPts);
      if (circle && circle.error / circle.r < ARC_ERR_THRESH) {
        const sweep = arcSweep(rawPts, circle.cx, circle.cy);
        if (Math.abs(sweep.sweepDeg) >= 120) {
          return {
            kind: 'arc',
            data: {
              center: { x: Math.round(circle.cx), y: Math.round(circle.cy) },
              radius: Math.round(circle.r),
              startAngle: sweep.startClock,
              sweepDeg: sweep.sweepDeg,
              direction: sweep.clockwise ? 'CW' : 'CCW',
            },
            debug: { circleErr: circle.error, circleR: circle.r, ratio: circle.error / circle.r },
          };
        }
      }
    }
    return { kind: 'line', data: makeLineSeg(first, last) };
  }

  // Step 1: Is it a line?
  const maxDev = maxDeviation(rawPts);
  if (maxDev / totalLen < LINE_THRESH) {
    return { kind: 'line', data: makeLineSeg(first, last), debug: { maxDev, totalLen, ratio: maxDev/totalLen } };
  }

  // Step 2: Simplify and look for corners → multiline (takes priority over arc)
  const simplified = rdp(rawPts, RDP_EPS);
  const corners = findCorners(simplified, CORNER_ANGLE, rawPts);

  if (corners.length > 0) {
    const breaks = [0, ...corners, simplified.length - 1];
    const segments = [];
    for (let i = 0; i < breaks.length - 1; i++) {
      segments.push(makeLineSeg(simplified[breaks[i]], simplified[breaks[i + 1]]));
    }
    return { kind: 'multiline', data: { segments }, debug: { corners: corners.length } };
  }

  // Step 3: Try arc fit (only if no polyline corners found)
  const circle = fitCircle(rawPts);
  if (circle && circle.error / circle.r < ARC_ERR_THRESH) {
    const sweep = arcSweep(rawPts, circle.cx, circle.cy);
    // If arc sweep < 120 degrees, treat as a line (start->end)
    if (Math.abs(sweep.sweepDeg) < 120) {
      return { kind: 'line', data: makeLineSeg(first, last), debug: { arcDemoted: true, sweepDeg: sweep.sweepDeg } };
    }
    return {
      kind: 'arc',
      data: {
        center: { x: Math.round(circle.cx), y: Math.round(circle.cy) },
        radius: Math.round(circle.r),
        startAngle: sweep.startClock,
        sweepDeg: sweep.sweepDeg,
        direction: sweep.clockwise ? 'CW' : 'CCW',
      },
      debug: { circleErr: circle.error, circleR: circle.r, ratio: circle.error / circle.r },
    };
  }

  const circleDebug = circle
    ? { circleErr: circle.error, circleR: circle.r, ratio: circle.error / circle.r }
    : { circleErr: null, circleR: null, ratio: null };

  // Step 4: Free-form curve
  return {
    kind: 'curve',
    data: {
      start: { x: Math.round(first.x), y: Math.round(first.y) },
      end: { x: Math.round(last.x), y: Math.round(last.y) },
    },
    debug: circleDebug,
  };
}

// ============================================================
// Stroke-to-number mapping (1-5)
// 1=横/提  2=竖/竖钩  3=撇  4=捺/点  5=折
// ============================================================
const STROKE_NAMES = { 1: '横', 2: '竖', 3: '撇', 4: '捺', 5: '折' };

// expected: optional expected stroke number (1-5), used for dynamic thresholding
function strokeToNumber(s, expected) {
  // Multiline/arc → 5 (折), with one exception
  if (s.kind === 'arc') return 5;
  if (s.kind === 'multiline') {
    // Special case: vertical first segment + short second segment going
    // bottom-right to top-left → 竖钩 → treat as 2
    const segs = s.data.segments;
    if (segs.length === 2) {
      const first = segs[0], second = segs[1];
      const firstVert = first.angle > 150 && first.angle < 210;
      const secondUpLeft = second.angle > 280 && second.angle < 360;
      const secondShort = second.length < first.length * 0.7;
      if (firstVert && secondUpLeft && secondShort) return 2; // 竖钩
    }
    return 5;
  }
  if (s.kind === 'curve') return 5;

  // Line type: determine by clock angle with dynamic thresholds
  // Clock angle: 0=up(12h), 90=right(3h), 180=down(6h), 270=left(9h)
  //
  // Default boundaries:
  //   1(横/提): 30 - 100   (rightward / upper-right)
  //   4(捺/点): 100 - 170  (lower-right)
  //   2(竖):    170 - 190  (downward)
  //   3(撇):    190 - 270  (down-left, must not exceed 270=pure left)
  //
  // Dynamic: when expecting a specific type, expand its range by BIAS degrees.
  const BIAS = 20;
  const angle = s.data.angle;

  let hengLo = 30,  hengHi = 100;   // 1
  let naLo   = 100, naHi   = 170;   // 4
  let shuLo  = 170, shuHi  = 190;   // 2
  let pieLo  = 190, pieHi  = 270;   // 3

  if (expected === 1) {
    hengLo -= BIAS; hengHi += BIAS;
  } else if (expected === 2) {
    shuLo -= BIAS; shuHi += BIAS;
  } else if (expected === 3) {
    pieLo -= BIAS; pieHi += BIAS;
  } else if (expected === 4) {
    naLo -= BIAS; naHi += BIAS;
  }

  // 1 横/提
  if (angle >= hengLo && angle <= hengHi) return 1;

  // 4 捺/点
  if (angle > naLo && angle < naHi) return 4;

  // 2 竖
  if (angle >= shuLo && angle <= shuHi) return 2;

  // 3 撇
  if (angle > pieLo && angle <= pieHi) return 3;

  // Fallback (270-330 up-left, 330-30 upward — invalid strokes)
  return 5;
}
