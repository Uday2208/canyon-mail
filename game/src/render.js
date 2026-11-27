// The renderer: everything the pilot sees, painted on one canvas. A chase
// camera rides behind the mail plane over a projected canyon: sky, sun,
// clouds, ground bands, river, runways, mesas, glowing rings, the plane
// itself, then lit instruments and the HUD. All vector drawing, no images.
import { CAMERA, COURSE } from './config.js';
import { groundHeight, groundType, riverX, GROUND_COLORS, MESAS } from './terrain.js';

const W = 1280;
const H = 720;
const CX = W / 2;
const CY = 300; // projection centre height: the horizon sits here

// Fixed clouds, seeded once so the sky never changes between runs.
const CLOUDS = [];
for (let i = 0; i < 16; i += 1) {
  const h1 = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  const h2 = Math.sin(i * 269.5 + 183.3) * 43758.5453;
  CLOUDS.push({
    x: ((h1 - Math.floor(h1)) * 2 - 1) * 760,
    y: 150 + ((h2 - Math.floor(h2)) * 110),
    z: 300 + i * 360,
    s: 46 + ((h1 * 7 - Math.floor(h1 * 7)) * 40),
  });
}

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
  const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
  const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
  return `rgb(${r},${g},${bl})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  /** Project a world point into screen space. Null when behind the camera. */
  function project(cam, x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const ch = Math.cos(cam.heading);
    const sh = Math.sin(cam.heading);
    const X = dx * ch - dz * sh;
    const Z = dx * sh + dz * ch;
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    const Yc = dy * cp - Z * sp;
    const Zc = dy * sp + Z * cp;
    if (Zc < 2) return null;
    return { sx: CX + (X / Zc) * CAMERA.focal, sy: CY - (Yc / Zc) * CAMERA.focal, s: CAMERA.focal / Zc };
  }

  function cameraFor(p) {
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    return {
      x: p.x - fx * CAMERA.behind,
      y: p.y + CAMERA.above,
      z: p.z - fz * CAMERA.behind,
      heading: p.heading,
      pitch: p.pitch * 0.4 + 0.05,
    };
  }

  function drawSky(cam, now) {
    // Golden hour: deep blue overhead warming to a gold band at the horizon,
    // the sun low and large. The whole scene is lit by this hour.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3a68a8');
    g.addColorStop(0.38, '#7ba7cf');
    g.addColorStop(0.58, '#f2b877');
    g.addColorStop(0.72, '#f7a55c');
    g.addColorStop(1, '#e8c9a0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun, placed by heading so turning moves it across the sky.
    const sunA = 0.9 - cam.heading * 0.35;
    const sx = CX + Math.sin(sunA) * 420;
    const sy = 168 - Math.cos(sunA) * 20;
    const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 150);
    sg.addColorStop(0, 'rgba(255,236,180,0.95)');
    sg.addColorStop(0.3, 'rgba(255,190,100,0.5)');
    sg.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 155, sy - 155, 310, 310);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(sx, sy, 34, 0, Math.PI * 2);
    ctx.fill();
    // Two ridge layers for depth: a far purple-hazed range and a nearer,
    // darker one, each with its own parallax against the heading.
    drawRidge(cam, 900, 0.011, 26, 300, 0.004, 34, '#9a86a8', CY + 2);
    drawRidge(cam, 500, 0.014, 18, 160, 0.006, 22, '#6f5a72', CY + 6);
  }

  function drawRidge(cam, p1, f1, a1, p2, f2, a2, color, baseY) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, baseY + 4);
    for (let x = 0; x <= W; x += 32) {
      const ridge = Math.sin((x + cam.heading * p1) * f1) * a1 + Math.sin((x + cam.heading * p2) * f2) * a2;
      ctx.lineTo(x, baseY - Math.abs(ridge));
    }
    ctx.lineTo(W, baseY + 4);
    ctx.closePath();
    ctx.fill();
  }

  // Ground, painted far to near so nearer ground covers farther ground:
  // each depth slice draws its ground band. The river, the runways and
  // the mesas are drawn after the whole ground, as continuous shapes:
  // a runway drawn slice by slice came out as a zipper of black triangles,
  // because the ground quads of nearer slices lean across the strip and
  // eat into it. What the pilot sees is the flat strip, so the strip is
  // painted last over the lean, and the mesas after it so rock still
  // occludes asphalt where it stands in front.
  function drawGround(cam) {
    const slices = [];
    let d = 26;
    while (d < 950) {
      slices.push(d);
      d *= 1.14;
    }
    const xs = [-460, -402.5, -345, -287.5, -230, -172.5, -115, -57.5, 0, 57.5, 115, 172.5, 230, 287.5, 345, 402.5, 460];
    for (let s = slices.length - 2; s >= 0; s -= 1) {
      const z0 = cam.z + slices[s];
      const z1 = cam.z + slices[s + 1];
      const haze = Math.min(0.5, slices[s] / 950 * 0.7);
      for (let i = 0; i < xs.length - 1; i += 1) {
        const mx = (xs[i] + xs[i + 1]) / 2;
        const mz = (z0 + z1) / 2;
        const type = groundType(mx, mz);
        let base = GROUND_COLORS[type] ?? GROUND_COLORS.sand;
        // Wide 230 m fields, barely darker than the sand: the checker reads
        // as patchwork farmland, not a chessboard.
        if ((Math.floor(mx / 230) + Math.floor(mz / 230)) % 2 === 0 && type === 'sand') base = GROUND_COLORS.sandDark;
        if (type === 'rock' && (Math.floor(mx / 230) + Math.floor(mz / 230)) % 2 === 0) base = GROUND_COLORS.rockDark;
        const a = project(cam, xs[i], groundHeight(xs[i], z0), z0);
        const b = project(cam, xs[i + 1], groundHeight(xs[i + 1], z0), z0);
        const c = project(cam, xs[i + 1], groundHeight(xs[i + 1], z1), z1);
        const e = project(cam, xs[i], groundHeight(xs[i], z1), z1);
        if (!a || !b || !c || !e) continue;
        ctx.fillStyle = lerpColor(base, '#e9cda6', haze);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.lineTo(c.sx, c.sy);
        ctx.lineTo(e.sx, e.sy);
        ctx.closePath();
        ctx.fill();
      }
    }
    drawRiverStrip(cam);
    drawRunwayFull(cam, COURSE.startRunway);
    drawRunwayFull(cam, COURSE.landRunway);
    const inView = MESAS.filter((m) => m.z > cam.z - 50 && m.z < cam.z + 950)
      .sort((a, b) => b.z - a.z);
    for (const m of inView) drawMesa(cam, m);
  }

  // The river as one continuous strip, sampled every 25 m and faded in
  // 100 m chunks: no slice boundaries, so no hard rectangular edge where
  // a chunk ends — the far end dissolves into the haze instead of
  // stopping at a straight line.
  function drawRiverStrip(cam) {
    const zStart = cam.z + 20;
    const zEnd = cam.z + 950;
    for (let z0 = zStart; z0 < zEnd; z0 += 100) {
      const z1 = Math.min(zEnd, z0 + 100);
      const haze = Math.min(0.5, ((z0 + z1) / 2 - cam.z) / 950 * 0.7);
      const left = [];
      const right = [];
      let ok = true;
      for (let z = z0; z <= z1; z += 25) {
        const rx = riverX(z);
        const y = groundHeight(rx, z) + 0.4;
        const l = project(cam, rx - 13, y, z);
        const r = project(cam, rx + 13, y, z);
        if (!l || !r) { ok = false; break; }
        left.push(l);
        right.push(r);
      }
      if (!ok || left.length < 2) continue;
      ctx.fillStyle = lerpColor(GROUND_COLORS.water, '#e9cda6', haze);
      ctx.beginPath();
      ctx.moveTo(left[0].sx, left[0].sy);
      for (let i = 1; i < left.length; i += 1) ctx.lineTo(left[i].sx, left[i].sy);
      for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i].sx, right[i].sy);
      ctx.closePath();
      ctx.fill();
    }
  }

  // One runway, one polygon from threshold to threshold: a continuous
  // strip with its centreline dashes, painted over the ground in a
  // single pass so it never zippers.
  function drawRunwayFull(cam, rw) {
    const a = project(cam, rw.x0, 0.4, rw.z0);
    const b = project(cam, rw.x1, 0.4, rw.z0);
    const c = project(cam, rw.x1, 0.4, rw.z1);
    const e = project(cam, rw.x0, 0.4, rw.z1);
    if (!a || !b || !c || !e) return;
    ctx.fillStyle = GROUND_COLORS.runway;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(c.sx, c.sy);
    ctx.lineTo(e.sx, e.sy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = GROUND_COLORS.runwayLine;
    for (let z = rw.z0 + 12; z < rw.z1 - 8; z += 44) {
      const d1 = project(cam, -1.2, 0.6, z);
      const d2 = project(cam, 1.2, 0.6, z);
      const d3 = project(cam, 1.2, 0.6, z + 20);
      const d4 = project(cam, -1.2, 0.6, z + 20);
      if (!d1 || !d2 || !d3 || !d4) continue;
      ctx.beginPath();
      ctx.moveTo(d1.sx, d1.sy);
      ctx.lineTo(d2.sx, d2.sy);
      ctx.lineTo(d3.sx, d3.sy);
      ctx.lineTo(d4.sx, d4.sy);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawMesa(cam, m) {
    const base = groundHeight(m.x, m.z) - 4;
    const top = base + m.h;
    const f1 = project(cam, m.x - m.r, base, m.z);
    const f2 = project(cam, m.x + m.r, base, m.z);
    const f3 = project(cam, m.x + m.r, top, m.z);
    const f4 = project(cam, m.x - m.r, top, m.z);
    if (!f1 || !f2 || !f3 || !f4) return;
    // Soft shadow where the mesa meets the valley floor, so it sits on the
    // ground instead of floating over it.
    const shC = project(cam, m.x, base + 1, m.z + m.r * 0.4);
    if (shC) {
      ctx.fillStyle = 'rgba(40,24,12,0.20)';
      ctx.beginPath();
      ctx.ellipse(shC.sx, shC.sy, Math.abs(f2.sx - f1.sx) * 0.55, Math.max(4, 8 * shC.s), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Face: warm light at the top, deep shadow at the base. The top edge is
    // stepped, not straight — a mesa rim is broken rock, not a roofline —
    // with a small deterministic jog per segment so the same mesa keeps
    // the same silhouette every run.
    const steps = 5;
    const topPts = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const jog = (Math.sin(m.x * 0.37 + m.z * 0.11 + i * 2.7) * 0.5 + 0.5 - 0.5) * (f1.sy - f4.sy) * 0.09;
      topPts.push({ sx: f4.sx + (f3.sx - f4.sx) * t, sy: f4.sy + (f3.sy - f4.sy) * t - jog });
    }
    const fg = ctx.createLinearGradient(0, f4.sy, 0, f1.sy);
    fg.addColorStop(0, '#a9744f');
    fg.addColorStop(1, '#5f3a20');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(f1.sx, f1.sy);
    ctx.lineTo(f2.sx, f2.sy);
    ctx.lineTo(f3.sx, f3.sy);
    for (let i = steps - 1; i >= 0; i -= 1) ctx.lineTo(topPts[i].sx, topPts[i].sy);
    ctx.closePath();
    ctx.fill();
    // Strata: horizontal bands of rock laid over the face, clipped to it,
    // so the mesa reads as layered stone instead of a painted box.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(f1.sx, f1.sy);
    ctx.lineTo(f2.sx, f2.sy);
    ctx.lineTo(f3.sx, f3.sy);
    for (let i = steps - 1; i >= 0; i -= 1) ctx.lineTo(topPts[i].sx, topPts[i].sy);
    ctx.closePath();
    ctx.clip();
    const bands = ['rgba(70,42,22,0.35)', 'rgba(214,150,96,0.30)', 'rgba(70,42,22,0.28)'];
    for (let i = 0; i < 3; i += 1) {
      const fy = f4.sy + (f1.sy - f4.sy) * (0.3 + i * 0.22);
      ctx.fillStyle = bands[i];
      ctx.fillRect(Math.min(f1.sx, f4.sx) - 10, fy, Math.abs(f2.sx - f1.sx) + 20, Math.max(2, (f1.sy - f4.sy) * 0.05));
    }
    ctx.restore();
    const t1 = project(cam, m.x - m.r, top, m.z - m.r * 0.6);
    const t2 = project(cam, m.x + m.r, top, m.z - m.r * 0.6);
    if (t1 && t2) {
      const tg = ctx.createLinearGradient(0, f4.sy, 0, t1.sy);
      tg.addColorStop(0, '#c08a5e');
      tg.addColorStop(1, '#a9744f');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(f4.sx, f4.sy);
      ctx.lineTo(f3.sx, f3.sy);
      ctx.lineTo(t2.sx, t2.sy);
      ctx.lineTo(t1.sx, t1.sy);
      ctx.closePath();
      ctx.fill();
      // Sunlit rim along the stepped front top edge.
      ctx.strokeStyle = 'rgba(255,205,140,0.7)';
      ctx.lineWidth = Math.max(1, (f3.sx - f4.sx) * 0.004);
      ctx.beginPath();
      ctx.moveTo(topPts[0].sx, topPts[0].sy);
      for (let i = 1; i <= steps; i += 1) ctx.lineTo(topPts[i].sx, topPts[i].sy);
      ctx.stroke();
    }
  }

  function drawClouds(cam) {
    for (const c of CLOUDS) {
      if (c.z < cam.z - 20 || c.z > cam.z + 1200) continue;
      const p = project(cam, c.x, c.y, c.z);
      if (!p) continue;
      const r = Math.max(4, c.s * p.s * 0.9);
      // A puff, not a saucer: a tall main lobe with a top lobe and two
      // side lobes, and only a soft shadow underneath — the old flat disc
      // with a hard crescent read as a flying saucer over the sun.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, r, r * 0.52, 0, 0, Math.PI * 2);
      ctx.ellipse(p.sx - r * 0.7, p.sy + r * 0.06, r * 0.6, r * 0.34, 0, 0, Math.PI * 2);
      ctx.ellipse(p.sx + r * 0.7, p.sy + r * 0.06, r * 0.6, r * 0.34, 0, 0, Math.PI * 2);
      ctx.ellipse(p.sx, p.sy - r * 0.2, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,246,232,0.88)';
      ctx.fillRect(p.sx - r * 1.4, p.sy - r * 0.6, r * 2.8, r * 1.1);
      ctx.fillStyle = 'rgba(200,175,145,0.3)';
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy + r * 0.32, r * 1.05, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // The Mail Drop outposts: an amber ring painted on the ground around
  // each camp, with a smoke column rising over it so the pilot can find
  // it from far away. A delivered outpost goes quiet — its ring and smoke
  // are gone, and the next one is the only beacon left.
  function drawDropZones(cam, zones, now) {
    for (const zone of zones) {
      if (zone.delivered) continue;
      const gy = groundHeight(zone.x, zone.z);
      const pts = [];
      let ok = true;
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        const q = project(cam, zone.x + Math.cos(a) * zone.r, gy + 0.6, zone.z + Math.sin(a) * zone.r);
        if (!q) { ok = false; break; }
        pts.push(q);
      }
      if (ok) {
        ctx.strokeStyle = '#ffb52e';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(pts[0].sx, pts[0].sy);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].sx, pts[i].sy);
        ctx.closePath();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pts[0].sx, pts[0].sy);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].sx, pts[i].sy);
        ctx.closePath();
        ctx.stroke();
      }
      // Smoke column: three puffs drifting up over the camp, swaying a
      // little with the clock so the beacon feels alive.
      for (let i = 0; i < 3; i += 1) {
        const sway = Math.sin(now * 0.7 + i * 1.9) * 4;
        const q = project(cam, zone.x + sway, gy + 14 + i * 13, zone.z);
        if (!q) continue;
        const r = Math.max(3, (10 + i * 5) * q.s);
        ctx.fillStyle = `rgba(235,228,218,${0.5 - i * 0.12})`;
        ctx.beginPath();
        ctx.ellipse(q.sx, q.sy, r, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawRings(cam, rings) {
    for (const ring of rings) {
      if (ring.passed) continue;
      if (ring.z < cam.z + 6 || ring.z > cam.z + 950) continue;
      const p = project(cam, ring.x, ring.y, ring.z);
      if (!p) continue;
      const r = Math.max(3, ring.r * p.s);
      // Faint outer halo: the next ring reads as a beacon from far away.
      ctx.strokeStyle = 'rgba(255,181,46,0.28)';
      ctx.lineWidth = Math.max(2, r * 0.2);
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, r * 1.22, r * 1.15, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.shadowColor = '#ffb52e';
      ctx.shadowBlur = 22;
      ctx.strokeStyle = '#ffb52e';
      ctx.lineWidth = Math.max(2.5, r * 0.14);
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, r, r * 0.94, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, r * 0.03);
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, r * 0.82, r * 0.77, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlane(p, now) {
    const px = CX;
    const py = 498 + Math.sin(p.pitch) * 26;
    // Shadow on the ground below.
    const cam = cameraFor(p);
    const sh = project(cam, p.x, groundHeight(p.x, p.z) + 0.6, p.z);
    if (sh && !p.onGround) {
      ctx.fillStyle = 'rgba(20,16,10,0.28)';
      ctx.beginPath();
      ctx.ellipse(sh.sx, sh.sy, 26 * sh.s, 7 * sh.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.bank);
    // Main wing: the wide horizontal element — red, with a white centre.
    ctx.fillStyle = '#d8433a';
    ctx.beginPath();
    ctx.ellipse(0, 12, 128, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f1e6';
    ctx.beginPath();
    ctx.ellipse(0, 12, 96, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wingtip navigation lights: red left, green right.
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-124, 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#35d461';
    ctx.beginPath();
    ctx.arc(124, 12, 4, 0, Math.PI * 2);
    ctx.fill();
    // Fuselage, seen from behind: short and stout, nose away from us.
    const body = ctx.createLinearGradient(-13, 0, 13, 0);
    body.addColorStop(0, '#e8e2d2');
    body.addColorStop(0.5, '#ffffff');
    body.addColorStop(1, '#cfc8b4');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-12, 46);
    ctx.quadraticCurveTo(-15, -6, -8, -40);
    ctx.lineTo(8, -40);
    ctx.quadraticCurveTo(15, -6, 12, 46);
    ctx.quadraticCurveTo(0, 53, -12, 46);
    ctx.fill();
    // Red mail stripe along the fuselage.
    ctx.fillStyle = '#d8433a';
    ctx.fillRect(-8, -26, 16, 6);
    ctx.fillRect(-10, 14, 20, 5);
    // Tail fin above the fuselage.
    ctx.fillStyle = '#d8433a';
    ctx.beginPath();
    ctx.moveTo(-6, -36);
    ctx.lineTo(0, -60);
    ctx.lineTo(6, -36);
    ctx.closePath();
    ctx.fill();
    // Horizontal stabilizer at the tail.
    ctx.fillStyle = '#f4f1e6';
    ctx.beginPath();
    ctx.ellipse(0, 38, 48, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8433a';
    ctx.beginPath();
    ctx.ellipse(-44, 38, 8, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(44, 38, 8, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // Spinning prop disc at the far nose.
    const spin = now * 26;
    ctx.save();
    ctx.translate(0, -44);
    ctx.fillStyle = 'rgba(40,40,50,0.30)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 38, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,30,40,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(spin) * 34, Math.sin(spin) * 7);
    ctx.lineTo(-Math.cos(spin) * 34, -Math.sin(spin) * 7);
    ctx.moveTo(Math.cos(spin + 1.1) * 34, Math.sin(spin + 1.1) * 7);
    ctx.lineTo(-Math.cos(spin + 1.1) * 34, -Math.sin(spin + 1.1) * 7);
    ctx.stroke();
    ctx.restore();
    // AIR MAIL on the fuselage.
    ctx.fillStyle = '#20242c';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AIR MAIL', 0, 30);
    ctx.restore();
  }

  function gauge(x, y, r, label, value, max, unit) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#10151d';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a4552';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#8fe3ff';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i += 1) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r - 9), Math.sin(a) * (r - 9));
      ctx.lineTo(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3));
      ctx.stroke();
    }
    const a = Math.PI * 0.75 + (value / max) * Math.PI * 1.5;
    ctx.shadowColor = '#8fe3ff';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ffb52e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * (r - 12), Math.sin(a) * (r - 12));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e8f4ff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(value)), 0, r * 0.42);
    ctx.fillStyle = '#9fb6c6';
    ctx.font = '10px monospace';
    ctx.fillText(label, 0, -r - 8);
    ctx.fillText(unit, 0, r + 16);
    ctx.restore();
  }

  function drawInstruments(p, now) {
    // Panel.
    ctx.fillStyle = 'rgba(10,14,20,0.88)';
    ctx.fillRect(0, 606, W, 114);
    ctx.fillStyle = '#2c3644';
    ctx.fillRect(0, 606, W, 3);
    // Attitude indicator.
    const ax = 92;
    const ay = 664;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, 44, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(ax, ay);
    ctx.rotate(-p.bank);
    ctx.translate(0, p.pitch * 90);
    ctx.fillStyle = '#4a90c4';
    ctx.fillRect(-46, -90, 92, 90);
    ctx.fillStyle = '#8a5a30';
    ctx.fillRect(-46, 0, 92, 90);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-46, 0);
    ctx.lineTo(46, 0);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(ax, ay);
    ctx.strokeStyle = '#ffb52e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(-4, 0);
    ctx.lineTo(0, -5);
    ctx.lineTo(4, 0);
    ctx.lineTo(16, 0);
    ctx.lineTo(16, 3);
    ctx.lineTo(-16, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9fb6c6';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', 0, -52);
    ctx.restore();
    // Airspeed + altimeter.
    gauge(216, 664, 42, 'AIRSPEED', p.speed * 1.94, 200, 'KT');
    gauge(336, 664, 42, 'ALTITUDE', Math.max(0, p.y - 1), 600, 'M');
    // Compass tape: labels sit at fixed compass points, positioned by their
    // offset from the current heading, so they show at every heading.
    const cx0 = 470;
    const cx1 = 812;
    const headingDeg = ((p.heading * 180) / Math.PI % 360 + 360) % 360;
    const points = ['N', '030', '060', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'];
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx0, 624, cx1 - cx0, 76);
    ctx.clip();
    ctx.fillStyle = '#10151d';
    ctx.fillRect(cx0, 624, cx1 - cx0, 76);
    for (let L = 0; L < 360; L += 15) {
      let off = L - headingDeg;
      while (off > 180) off -= 360;
      while (off < -180) off += 360;
      const sx = (cx0 + cx1) / 2 + off * 2.1;
      if (sx < cx0 - 24 || sx > cx1 + 24) continue;
      const isCard = L % 90 === 0;
      ctx.strokeStyle = isCard ? '#ffb52e' : '#5b6b7c';
      ctx.lineWidth = isCard ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, 648);
      ctx.lineTo(sx, isCard ? 668 : 660);
      ctx.stroke();
      if (L % 30 === 0) {
        ctx.fillStyle = '#e8f4ff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(points[Math.round(L / 30) % 12], sx, 686);
      }
    }
    ctx.restore();
    ctx.strokeStyle = '#3a4552';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx0, 624, cx1 - cx0, 76);
    ctx.fillStyle = '#ffb52e';
    ctx.beginPath();
    ctx.moveTo((cx0 + cx1) / 2, 624);
    ctx.lineTo((cx0 + cx1) / 2 - 6, 614);
    ctx.lineTo((cx0 + cx1) / 2 + 6, 614);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9fb6c6';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HEADING', (cx0 + cx1) / 2, 616);
    // Fuel and throttle bars.
    function bar(x, label, frac, color) {
      ctx.fillStyle = '#10151d';
      ctx.fillRect(x, 624, 26, 76);
      ctx.strokeStyle = '#3a4552';
      ctx.strokeRect(x, 624, 26, 76);
      const h = 72 * Math.max(0, Math.min(1, frac));
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillRect(x + 2, 624 + 74 - h, 22, h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#9fb6c6';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + 13, 616);
    }
    bar(880, 'FUEL', p.fuel / 100, p.fuel < 25 ? '#ff5a4e' : '#4ecb71');
    bar(930, 'THR', p.throttle, '#ffb52e');
    // The numbers the bars stand for: fuel is a decision, so it reads in
    // percent, not just as a green bar.
    ctx.fillStyle = '#e8f4ff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(p.fuel)}%`, 893, 714);
    ctx.fillText(`${Math.round(p.throttle * 100)}%`, 943, 714);
    // Trim / flap state text, right side.
    ctx.fillStyle = '#e8f4ff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(p.onGround ? 'ON GROUND' : 'AIRBORNE', 990, 648);
    ctx.fillStyle = p.fuel < 25 ? '#ff5a4e' : '#9fb6c6';
    ctx.font = '13px monospace';
    ctx.fillText(p.fuel < 25 ? 'LOW FUEL' : 'FUEL OK', 990, 672);
  }

  // Ring guide: the one number the old HUD never showed — how high the next
  // target sits, and whether to climb or descend to it. A pilot steering
  // onto the bearing alone could still fly 20 m over or under the ring and
  // orbit it until the tanks ran dry; this line closes that gap. On the
  // final approach it becomes the glide slope instead: the ideal 3-degree
  // path to the threshold, and where the plane sits against it.
  function drawRingGuide(w, target) {
    const p = w.plane;
    const altM = Math.max(0, Math.round(p.y - 1));
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#8fe3ff';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    if (target.isRunway && target.label !== 'LANDED') {
      const idealAlt = 2 + target.dist * 0.055;
      const diff = Math.round(altM - idealAlt);
      const cue = diff > 6 ? `▲ ${diff} M ABOVE GLIDE` : diff < -6 ? `▼ ${-diff} M BELOW GLIDE` : '◆ ON GLIDE PATH';
      ctx.fillText(`GLIDE PATH  ${cue}`, CX, 64);
    } else {
      const diff = target.alt - altM;
      const cue = diff > 8 ? `▲ CLIMB ${diff} M` : diff < -8 ? `▼ DESCEND ${-diff} M` : '◆ ON ALTITUDE';
      ctx.fillText(`TARGET ALT ${target.alt} M  ${cue}`, CX, 64);
    }
    ctx.shadowBlur = 0;
  }

  function drawHUD(w, target) {
    const p = w.plane;
    ctx.textAlign = 'left';
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    const altM = Math.max(0, Math.round(p.y - 1));
    const spdKt = Math.round(p.speed * 1.94);
    const hdg = Math.round(((p.heading * 180) / Math.PI % 360 + 360) % 360);
    ctx.fillText(`ALT ${altM} M`, 24, 44);
    ctx.fillText(`SPD ${spdKt} KT`, 24, 74);
    ctx.fillText(`HDG ${String(hdg).padStart(3, '0')}`, 24, 104);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'right';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`SCORE ${w.score}`, W - 24, 44);
    ctx.font = '18px monospace';
    ctx.fillText(w.mode === 'drop' ? `DROPS ${w.dropIndex}/${w.zones.length}` : `RINGS ${w.ringIndex}/${w.rings.length}`, W - 24, 72);
    const mm = Math.floor(w.time / 60);
    const ss = Math.floor(w.time % 60);
    ctx.fillText(`TIME ${mm}:${String(ss).padStart(2, '0')}`, W - 24, 100);
    // Next target: label, distance, bearing arrow.
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#ffb52e';
    const arrow = target.bearing > 0.25 ? '▶' : target.bearing < -0.25 ? '◀' : '▲';
    ctx.fillText(`${target.label}  ${Math.round(target.dist)} M  ${arrow}`, CX, 40);
    drawRingGuide(w, target);
    // Centre reticle.
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CX, 300, 12, 0, Math.PI * 2);
    ctx.moveTo(CX - 20, 300);
    ctx.lineTo(CX - 8, 300);
    ctx.moveTo(CX + 8, 300);
    ctx.lineTo(CX + 20, 300);
    ctx.moveTo(CX, 280);
    ctx.lineTo(CX, 292);
    ctx.moveTo(CX, 308);
    ctx.lineTo(CX, 320);
    ctx.stroke();
  }

  function drawOverlay(title, lines, accent, dim = 0.62) {
    ctx.fillStyle = `rgba(8,12,18,${dim})`;
    ctx.fillRect(0, 0, W, 606);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 54px monospace';
    ctx.fillText(title, CX, 210);
    ctx.fillStyle = '#f2f7fb';
    ctx.font = '20px monospace';
    let y = 268;
    for (const line of lines) {
      ctx.fillText(line, CX, y);
      y += 34;
    }
  }

  return {
    draw(state, screen, best, target, now) {
      const p = state.plane;
      const cam = cameraFor(p);
      drawSky(cam, now);
      drawGround(cam);
      drawClouds(cam);
      if (state.mode === 'drop') drawDropZones(cam, state.zones, now);
      else drawRings(cam, state.rings);
      if (screen === 'play' || screen === 'paused' || screen === 'over' || screen === 'complete') {
        drawPlane(p, now);
      } else {
        // Title: the plane sits on the runway, seen from the chase camera.
        drawPlane(p, now);
      }
      // Cinematic vignette: soft dark corners, the eye stays on the plane.
      const vg = ctx.createRadialGradient(CX, 320, 320, CX, 320, 760);
      vg.addColorStop(0, 'rgba(10,8,6,0)');
      vg.addColorStop(1, 'rgba(10,8,6,0.20)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, 606);
      drawHUD(state, target);
      drawInstruments(p, now);
      if (screen === 'title') {
        drawOverlay('CANYON MAIL', [
          'Two missions, one valley:',
          '1 — RING RUN: six rings, then land on the far strip.',
          '2 — MAIL DROP: three parcels to the outposts, then land.',
          'Arrows or mouse fly the nose  •  W / S work the throttle  •  SPACE drops a parcel',
          'Watch the fuel: every ring or drop buys you 10% back. Gentle on the strip.',
          'Press 1, 2 or SPACE to fly.',
          best > 0 ? `Best score: ${best}` : 'First flight: the canyon is waiting.',
        ], '#ffb52e', 0.45);
      } else if (screen === 'paused') {
        drawOverlay('PAUSED', ['Press P or SPACE to keep flying.'], '#8fe3ff');
      } else if (screen === 'over') {
        drawOverlay('CRASHED', [state.message, `Score ${state.score}  •  Best ${best}`, 'Press SPACE to fly again.'], '#ff5a4e');
      } else if (screen === 'complete') {
        drawOverlay('MISSION COMPLETE', [state.message, `Score ${state.score}  •  Best ${best}`, 'Press SPACE to fly again.'], '#4ecb71', 0.45);
      }
      if (state.status === 'flying' && p.fuel > 0 && p.fuel < 25 && screen === 'play') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff5a4e';
        ctx.font = 'bold 20px monospace';
        ctx.fillText('LOW FUEL — find the next ring', CX, 560);
      }
    },
  };
}

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_COMPLETE = 'complete';
