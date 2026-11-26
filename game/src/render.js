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
  // each depth slice draws its ground band, then the river and runway
  // segments and any mesa that stands in that slice.
  function drawGround(cam) {
    const slices = [];
    let d = 26;
    while (d < 950) {
      slices.push(d);
      d *= 1.14;
    }
    const xs = [-460, -345, -230, -115, 0, 115, 230, 345, 460];
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
      drawRiverSegment(cam, z0, z1, haze);
      drawRunwaySegment(cam, COURSE.startRunway, z0, z1);
      drawRunwaySegment(cam, COURSE.landRunway, z0, z1);
      for (const m of MESAS) {
        if (m.z >= z0 && m.z < z1) drawMesa(cam, m);
      }
    }
  }

  function drawRiverSegment(cam, z0, z1, haze) {
    const rx0 = riverX(z0);
    const rx1 = riverX(z1);
    const a = project(cam, rx0 - 13, groundHeight(rx0, z0) + 0.4, z0);
    const b = project(cam, rx0 + 13, groundHeight(rx0, z0) + 0.4, z0);
    const c = project(cam, rx1 + 13, groundHeight(rx1, z1) + 0.4, z1);
    const e = project(cam, rx1 - 13, groundHeight(rx1, z1) + 0.4, z1);
    if (!a || !b || !c || !e) return;
    ctx.fillStyle = lerpColor(GROUND_COLORS.water, '#e9cda6', haze);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(c.sx, c.sy);
    ctx.lineTo(e.sx, e.sy);
    ctx.closePath();
    ctx.fill();
  }

  function drawRunwaySegment(cam, rw, z0, z1) {
    const a0 = Math.max(rw.z0, z0);
    const a1 = Math.min(rw.z1, z1);
    if (a1 <= a0) return;
    const a = project(cam, rw.x0, 0.4, a0);
    const b = project(cam, rw.x1, 0.4, a0);
    const c = project(cam, rw.x1, 0.4, a1);
    const e = project(cam, rw.x0, 0.4, a1);
    if (!a || !b || !c || !e) return;
    ctx.fillStyle = GROUND_COLORS.runway;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(c.sx, c.sy);
    ctx.lineTo(e.sx, e.sy);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes that fall inside this slice.
    ctx.fillStyle = GROUND_COLORS.runwayLine;
    for (let z = rw.z0 + 12; z < rw.z1 - 8; z += 44) {
      if (z < a0 || z >= a1) continue;
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
    // Face: warm light at the top, deep shadow at the base.
    const fg = ctx.createLinearGradient(0, f4.sy, 0, f1.sy);
    fg.addColorStop(0, '#a9744f');
    fg.addColorStop(1, '#5f3a20');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(f1.sx, f1.sy);
    ctx.lineTo(f2.sx, f2.sy);
    ctx.lineTo(f3.sx, f3.sy);
    ctx.lineTo(f4.sx, f4.sy);
    ctx.closePath();
    ctx.fill();
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
      // Sunlit rim along the front top edge.
      ctx.strokeStyle = 'rgba(255,205,140,0.7)';
      ctx.lineWidth = Math.max(1, (f3.sx - f4.sx) * 0.004);
      ctx.beginPath();
      ctx.moveTo(f4.sx, f4.sy);
      ctx.lineTo(f3.sx, f3.sy);
      ctx.stroke();
    }
  }

  function drawClouds(cam) {
    for (const c of CLOUDS) {
      if (c.z < cam.z - 20 || c.z > cam.z + 1200) continue;
      const p = project(cam, c.x, c.y, c.z);
      if (!p) continue;
      const r = Math.max(4, c.s * p.s * 0.9);
      // One blob, filled once, with a shadow crescent clipped to its lower
      // half: overlapping ellipses in two tones left visible seams.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, r, r * 0.36, 0, 0, Math.PI * 2);
      ctx.ellipse(p.sx - r * 0.7, p.sy + r * 0.08, r * 0.6, r * 0.26, 0, 0, Math.PI * 2);
      ctx.ellipse(p.sx + r * 0.7, p.sy + r * 0.08, r * 0.6, r * 0.26, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,246,232,0.88)';
      ctx.fillRect(p.sx - r * 1.4, p.sy - r * 0.5, r * 2.8, r);
      ctx.fillStyle = 'rgba(200,175,145,0.5)';
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy + r * 0.3, r * 1.05, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
    // Trim / flap state text, right side.
    ctx.fillStyle = '#e8f4ff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(p.onGround ? 'ON GROUND' : 'AIRBORNE', 990, 648);
    ctx.fillStyle = p.fuel < 25 ? '#ff5a4e' : '#9fb6c6';
    ctx.font = '13px monospace';
    ctx.fillText(p.fuel < 25 ? 'LOW FUEL' : 'FUEL OK', 990, 672);
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
    ctx.fillText(`RINGS ${w.ringIndex}/${w.rings.length}`, W - 24, 72);
    const mm = Math.floor(w.time / 60);
    const ss = Math.floor(w.time % 60);
    ctx.fillText(`TIME ${mm}:${String(ss).padStart(2, '0')}`, W - 24, 100);
    // Next target: label, distance, bearing arrow.
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#ffb52e';
    const arrow = target.bearing > 0.25 ? '▶' : target.bearing < -0.25 ? '◀' : '▲';
    ctx.fillText(`${target.label}  ${Math.round(target.dist)} M  ${arrow}`, CX, 40);
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
      drawRings(cam, state.rings);
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
          'Fly the mail through six rings, then land on the far strip.',
          'Arrows fly the nose  •  W / S work the throttle  •  Mouse steers too',
          'Watch the fuel: every ring buys you 12% back. Gentle on the strip.',
          'Press SPACE or click to fly.',
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
