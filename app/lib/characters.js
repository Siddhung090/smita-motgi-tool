// Vector-drawn cute characters (Bubu the bear, Dudu the panda, plus two pastel
// friends) rendered and animated on a 2D canvas — no image assets required.
// Each character is built from simple shapes (circles + ellipses) in the soft,
// round "Bubu and Dudu" style, then animated: idle breathing bob, eye blinks,
// rosy cheeks, swinging arms, and a mouth that lip-syncs to the voice.

// Character presets. `type` controls panda-vs-bear styling; the colors define
// the look. Add new characters here and they show up everywhere automatically.
export const CHARACTERS = {
  Dudu: { label: 'Dudu', type: 'panda', fur: '#ffffff', shade: '#e7ecf3', ear: '#3b3b40', cheek: '#ffb0c8', accent: '#3b3b40' },
  Bubu: { label: 'Bubu', type: 'bear',  fur: '#cf9466', shade: '#b97e51', ear: '#a96b3d', cheek: '#ff97a6', accent: '#4f3220' },
  Momo: { label: 'Momo', type: 'bear',  fur: '#ffc2da', shade: '#f6a8c6', ear: '#ef8fb3', cheek: '#ff7ba3', accent: '#7c4a5c' },
  Zara: { label: 'Zara', type: 'panda', fur: '#bfe6d8', shade: '#a4d8c7', ear: '#7cc6ae', cheek: '#ff9aa6', accent: '#355a4d' },
}

export function getCharacter(name) {
  return CHARACTERS[name] || CHARACTERS.Dudu
}

// --- small drawing helpers ---------------------------------------------------

function fillCircle(ctx, x, y, r, color) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

function fillEllipse(ctx, x, y, rx, ry, color, rot = 0) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

// --- soft pastel background with floating hearts/sparkles --------------------

export function drawBackground(ctx, W, H, t, baseColor) {
  const top = baseColor || '#fde4ef'
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, top)
  grad.addColorStop(1, '#ece7ff')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Gentle floating hearts that drift upward and wrap around.
  ctx.save()
  ctx.globalAlpha = 0.5
  for (let i = 0; i < 7; i++) {
    const seed = i * 53.13
    const x = (W * (0.08 + (i * 0.13) % 0.9))
    const drift = Math.sin(t * 0.6 + seed) * 18
    const y = H - ((t * 22 + i * 90) % (H + 60)) + 30
    drawHeart(ctx, x + drift, y, 9 + (i % 3) * 3, i % 2 ? '#ffd0e2' : '#fff2c2')
  }
  ctx.restore()
}

function drawHeart(ctx, x, y, s, color) {
  ctx.save()
  ctx.translate(x, y)
  ctx.beginPath()
  ctx.moveTo(0, s * 0.35)
  ctx.bezierCurveTo(s, -s * 0.6, s * 1.1, s * 0.5, 0, s * 1.15)
  ctx.bezierCurveTo(-s * 1.1, s * 0.5, -s, -s * 0.6, 0, s * 0.35)
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

// --- the character -----------------------------------------------------------

// Draws one animated character centred at (cx, cy is the HEAD centre).
//   cfg   : a CHARACTERS entry
//   t     : time in seconds (drives idle/blink/wave)
//   mouth : 0..1 how wide the mouth is open (drives lip-sync)
//   scale : overall size multiplier (1 = default)
export function drawCharacter(ctx, cfg, { cx, cy, t, mouth = 0, scale = 1 }) {
  const headR = 92 * scale

  // Idle "breathing" — the whole character bobs and squashes a touch.
  const bob = Math.sin(t * 2) * 4 * scale
  const breathe = 1 + Math.sin(t * 2) * 0.012
  // Blink: eyes close briefly on a ~3.2s cycle.
  const blink = (t % 3.2) < 0.14
  // Arms swing more while talking.
  const wave = Math.sin(t * 6) * (0.12 + mouth * 0.5)

  ctx.save()
  ctx.translate(cx, cy + bob)
  ctx.scale(breathe, breathe)
  // From here on everything is relative to the head centre at (0, 0).

  const bodyCy = headR + 96 * scale
  const bodyRx = 82 * scale
  const bodyRy = 96 * scale

  // Soft drop shadow on the ground.
  fillEllipse(ctx, 0, bodyCy + bodyRy - 6, bodyRx * 0.95, 20 * scale, 'rgba(80,60,90,0.12)')

  // Feet.
  fillEllipse(ctx, -42 * scale, bodyCy + bodyRy - 14, 30 * scale, 20 * scale, cfg.shade)
  fillEllipse(ctx,  42 * scale, bodyCy + bodyRy - 14, 30 * scale, 20 * scale, cfg.shade)

  // Arms (drawn behind the body, swinging).
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(side * (bodyRx - 6 * scale), bodyCy - 8 * scale)
    ctx.rotate(side * wave)
    fillEllipse(ctx, side * 16 * scale, 24 * scale, 20 * scale, 34 * scale, cfg.fur)
    fillEllipse(ctx, side * 16 * scale, 24 * scale, 20 * scale, 34 * scale, 'rgba(0,0,0,0.04)')
    ctx.restore()
  }

  // Body.
  fillEllipse(ctx, 0, bodyCy, bodyRx, bodyRy, cfg.fur)
  // Lighter tummy patch.
  fillEllipse(ctx, 0, bodyCy + 14 * scale, bodyRx * 0.62, bodyRy * 0.66, cfg.shade)

  // Ears.
  const earR = 34 * scale
  const earY = -headR * 0.78
  fillCircle(ctx, -headR * 0.66, earY, earR, cfg.ear)
  fillCircle(ctx,  headR * 0.66, earY, earR, cfg.ear)
  fillCircle(ctx, -headR * 0.66, earY, earR * 0.5, cfg.cheek)
  fillCircle(ctx,  headR * 0.66, earY, earR * 0.5, cfg.cheek)

  // Head.
  fillCircle(ctx, 0, 0, headR, cfg.fur)

  // Panda-style soft eye patches.
  if (cfg.type === 'panda') {
    fillEllipse(ctx, -32 * scale, -4 * scale, 22 * scale, 26 * scale, 'rgba(60,60,70,0.10)')
    fillEllipse(ctx,  32 * scale, -4 * scale, 22 * scale, 26 * scale, 'rgba(60,60,70,0.10)')
  }

  // Cheeks (rosy blush).
  fillEllipse(ctx, -52 * scale, 24 * scale, 19 * scale, 12 * scale, cfg.cheek)
  fillEllipse(ctx,  52 * scale, 24 * scale, 19 * scale, 12 * scale, cfg.cheek)

  // Eyes — dots normally, short happy arcs when blinking.
  const eyeX = 32 * scale
  const eyeY = -4 * scale
  if (blink) {
    ctx.strokeStyle = cfg.accent
    ctx.lineWidth = 5 * scale
    ctx.lineCap = 'round'
    for (const sx of [-eyeX, eyeX]) {
      ctx.beginPath()
      ctx.arc(sx, eyeY + 2 * scale, 9 * scale, Math.PI * 0.15, Math.PI * 0.85)
      ctx.stroke()
    }
  } else {
    fillCircle(ctx, -eyeX, eyeY, 9 * scale, cfg.accent)
    fillCircle(ctx,  eyeX, eyeY, 9 * scale, cfg.accent)
    // Tiny catch-light sparkle.
    fillCircle(ctx, -eyeX + 3 * scale, eyeY - 3 * scale, 3 * scale, 'rgba(255,255,255,0.9)')
    fillCircle(ctx,  eyeX + 3 * scale, eyeY - 3 * scale, 3 * scale, 'rgba(255,255,255,0.9)')
  }

  // Nose.
  fillEllipse(ctx, 0, 16 * scale, 7 * scale, 5 * scale, cfg.accent)

  // Mouth — lip-syncs to the voice.
  drawMouth(ctx, 0, 30 * scale, mouth, scale, cfg.accent)

  ctx.restore()
}

function drawMouth(ctx, x, y, open, scale, color) {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = color
  ctx.lineWidth = 4 * scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (open > 0.14) {
    // Open mouth: a soft dark oval with a little tongue.
    const w = (10 + open * 6) * scale
    const h = (4 + open * 18) * scale
    fillEllipse(ctx, 0, h * 0.4, w, h, '#5b2a32')
    fillEllipse(ctx, 0, h * 0.9, w * 0.7, h * 0.45, '#ff8aa0')
  } else {
    // Closed: a tiny cat-like "ω" smile.
    const s = scale
    ctx.beginPath()
    ctx.moveTo(-9 * s, 0)
    ctx.quadraticCurveTo(-4.5 * s, 6 * s, 0, 0)
    ctx.quadraticCurveTo(4.5 * s, 6 * s, 9 * s, 0)
    ctx.stroke()
  }
  ctx.restore()
}
