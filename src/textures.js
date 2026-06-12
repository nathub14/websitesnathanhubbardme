import * as THREE from 'three';

const JP_FONT = `'Yu Gothic', 'Meiryo', 'Noto Sans JP', sans-serif`;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function neonStroke(ctx, draw, color, blur) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  draw();
  draw();
  ctx.restore();
}

/**
 * Vertical blade sign — stacked glyphs in a framed box, Hong Kong style.
 */
export function bladeSignTexture(chars, color, { latin = '' } = {}) {
  const W = 128, H = 64 + chars.length * 110 + (latin ? 56 : 0);
  const [c, ctx] = makeCanvas(W, H);

  // Dark panel backing so unlit parts read as a physical sign
  ctx.fillStyle = 'rgba(8,10,16,0.92)';
  ctx.fillRect(0, 0, W, H);

  // Border tube
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  neonStroke(ctx, () => ctx.strokeRect(10, 10, W - 20, H - 20), color, 18);

  // Glyphs
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 78px ${JP_FONT}`;
  chars.split('').forEach((ch, i) => {
    const y = 70 + i * 110;
    neonStroke(ctx, () => ctx.fillText(ch, W / 2, y), color, 22);
    // colored core pass
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = color;
    ctx.fillText(ch, W / 2, y);
    ctx.restore();
  });

  if (latin) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 26px 'Arial', sans-serif`;
    neonStroke(ctx, () => ctx.fillText(latin, W / 2, H - 42), color, 12);
  }

  return { texture: toTexture(c), aspect: W / H };
}

/**
 * Horizontal wall sign — latin + jp combo.
 */
export function wallSignTexture(text, color, { sub = '', w = 512, h = 160 } = {}) {
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = 'rgba(6,8,14,0.9)';
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const mainSize = Math.min(h * 0.52, (w * 1.6) / Math.max(text.length, 1));
  ctx.font = `bold ${mainSize}px ${JP_FONT}`;
  ctx.fillStyle = '#ffffff';
  const mainY = sub ? h * 0.4 : h * 0.5;
  neonStroke(ctx, () => ctx.fillText(text, w / 2, mainY), color, 26);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, mainY);
  ctx.restore();

  if (sub) {
    ctx.font = `500 ${h * 0.18}px 'Arial', sans-serif`;
    ctx.fillStyle = color;
    neonStroke(ctx, () => ctx.fillText(sub, w / 2, h * 0.78), color, 14);
  }
  return { texture: toTexture(c), aspect: w / h };
}

/**
 * Large holographic advertisement texture (content only; scanlines/glitch
 * happen in the shader).
 */
export function holoAdTexture({ title, jp, tagline, accent, w = 512, h = 768 }) {
  const [c, ctx] = makeCanvas(w, h);

  // transparent bg with faint grid
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }

  // Big JP glyph watermark
  if (jp) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${h * 0.52}px ${JP_FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    neonStroke(ctx, () => ctx.fillText(jp[0], w / 2, h * 0.42), accent, 30);
  }

  // Frame
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  neonStroke(ctx, () => ctx.strokeRect(16, 16, w - 32, h - 32), accent, 24);
  // corner ticks
  ctx.fillStyle = accent;
  [[16, 16], [w - 40, 16], [16, h - 40], [w - 40, h - 40]].forEach(([x, y]) => ctx.fillRect(x, y, 24, 24));

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Title
  const tSize = Math.min(w / (title.length * 0.62), h * 0.13);
  ctx.font = `bold ${tSize}px 'Arial Black', 'Arial', sans-serif`;
  ctx.fillStyle = '#ffffff';
  neonStroke(ctx, () => ctx.fillText(title, w / 2, h * 0.62), accent, 28);

  // JP line
  if (jp) {
    ctx.font = `500 ${h * 0.07}px ${JP_FONT}`;
    ctx.fillStyle = accent;
    neonStroke(ctx, () => ctx.fillText(jp, w / 2, h * 0.74), accent, 18);
  }

  if (tagline) {
    ctx.font = `400 ${h * 0.035}px 'Arial', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(tagline.toUpperCase(), w / 2, h * 0.84);
  }

  // barcode strip
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  let bx = w * 0.3;
  while (bx < w * 0.7) {
    const bw = 2 + Math.random() * 6;
    if (Math.random() > 0.4) ctx.fillRect(bx, h * 0.9, bw, h * 0.04);
    bx += bw + 3;
  }

  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Soft round smoke/steam puff. */
export function smokeTexture() {
  const S = 128;
  const [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // break up the perfect circle
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 6 + Math.random() * 18;
    const g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
    g2.addColorStop(0, `rgba(0,0,0,${0.12 + Math.random() * 0.2})`);
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/** Radial glow sprite for lamp pools / sign halos. */
export function glowTexture() {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

/** Tileable RGB noise (used for ground ripple/puddle masks). */
export function noiseTexture(size = 256) {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = Math.random() * 255;
    img.data[i + 1] = Math.random() * 255;
    img.data[i + 2] = Math.random() * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/** Vending machine front panel. */
export function vendingTexture(accentCss, label, jp) {
  const W = 128, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#0a0d14';
  ctx.fillRect(0, 0, W, H);
  // lit display area
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, accentCss);
  g.addColorStop(1, '#10131c');
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(10, 12, W - 20, H * 0.42);
  ctx.globalAlpha = 1;
  // product slots
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 4; col++) {
      ctx.fillStyle = `hsl(${Math.random() * 360}, 80%, ${45 + Math.random() * 25}%)`;
      ctx.fillRect(16 + col * 26, 24 + r * 30, 18, 22);
    }
  }
  // label
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 24px ${JP_FONT}`;
  neonStroke(ctx, () => ctx.fillText(jp, W / 2, H * 0.62), accentCss, 14);
  ctx.font = `bold 13px 'Arial', sans-serif`;
  ctx.fillStyle = accentCss;
  ctx.fillText(label, W / 2, H * 0.72);
  // dispense slot
  ctx.fillStyle = '#000';
  ctx.fillRect(16, H * 0.82, W - 32, H * 0.1);
  ctx.strokeStyle = accentCss;
  ctx.lineWidth = 2;
  ctx.strokeRect(16, H * 0.82, W - 32, H * 0.1);
  return toTexture(c);
}
