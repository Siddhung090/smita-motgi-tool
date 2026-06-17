// Vector-drawn cute characters (Bubu the bear, Dudu the panda, plus two pastel
// friends) plus scene backgrounds and props — all rendered and animated on a 2D
// canvas, no image assets required. Built in the soft, round "Bubu and Dudu"
// style: round bodies, rosy cheeks, blinking eyes, lip-sync, and emotions.

// Character presets. `type` controls panda-vs-bear styling; colors define the look.
export const CHARACTERS = {
  Dudu: { label: 'Dudu', type: 'panda', fur: '#ffffff', shade: '#e7ecf3', ear: '#3b3b40', cheek: '#ffb0c8', accent: '#3b3b40' },
  Bubu: { label: 'Bubu', type: 'bear',  fur: '#cf9466', shade: '#b97e51', ear: '#a96b3d', cheek: '#ff97a6', accent: '#4f3220' },
  Momo: { label: 'Momo', type: 'bear',  fur: '#ffc2da', shade: '#f6a8c6', ear: '#ef8fb3', cheek: '#ff7ba3', accent: '#7c4a5c' },
  Zara: { label: 'Zara', type: 'panda', fur: '#bfe6d8', shade: '#a4d8c7', ear: '#7cc6ae', cheek: '#ff9aa6', accent: '#355a4d' },
}

// Who appears alongside each character (the duo / couple).
const PAIRS = { Dudu: 'Bubu', Bubu: 'Dudu', Momo: 'Zara', Zara: 'Momo' }

export function getCharacter(name) {
  return CHARACTERS[name] || CHARACTERS.Dudu
}

export function getPartner(name) {
  return getCharacter(PAIRS[name] || 'Bubu')
}

// Allowed values — kept in sync with the AI scene schema in analyze-story.
export const EMOTIONS = ['happy', 'love', 'sad', 'surprised', 'angry', 'sleepy', 'excited', 'neutral']
export const SETTINGS = [
  'plain', 'chai', 'street', 'home', 'diwali', 'monsoon',
  'park', 'bedroom', 'kitchen', 'cafe', 'night', 'beach', 'rain',
]
export const PROPS = ['none', 'heart', 'gift', 'food', 'balloon', 'flower', 'coffee']

// --- small drawing helpers ---------------------------------------------------

function fillCircle(ctx, x, y, r, color) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
}
function fillEllipse(ctx, x, y, rx, ry, color, rot = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
}
function fillRoundRect(ctx, x, y, w, h, r, color) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath(); ctx.fillStyle = color; ctx.fill()
}

function drawHeart(ctx, x, y, s, color) {
  ctx.save(); ctx.translate(x, y)
  ctx.beginPath()
  ctx.moveTo(0, s * 0.35)
  ctx.bezierCurveTo(s, -s * 0.6, s * 1.1, s * 0.5, 0, s * 1.15)
  ctx.bezierCurveTo(-s * 1.1, s * 0.5, -s, -s * 0.6, 0, s * 0.35)
  ctx.fillStyle = color; ctx.fill(); ctx.restore()
}

function drawStar(ctx, x, y, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * s, Math.sin(a) * s)
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore()
}

function drawCloud(ctx, x, y, s, color) {
  ctx.save(); ctx.globalAlpha = 0.95
  fillCircle(ctx, x, y, s, color)
  fillCircle(ctx, x + s * 0.9, y + s * 0.1, s * 0.8, color)
  fillCircle(ctx, x - s * 0.9, y + s * 0.15, s * 0.7, color)
  fillRoundRect(ctx, x - s * 1.5, y, s * 3, s, s, color)
  ctx.restore()
}

// --- scene backgrounds -------------------------------------------------------

export function drawSceneBackground(ctx, W, H, t, setting = 'plain', tint) {
  switch (setting) {
    case 'chai':    return bgChai(ctx, W, H, t)
    case 'street':  return bgStreet(ctx, W, H, t)
    case 'home':    return bgHome(ctx, W, H, t)
    case 'diwali':  return bgDiwali(ctx, W, H, t)
    case 'monsoon': return bgMonsoon(ctx, W, H, t)
    case 'park':    return bgPark(ctx, W, H, t)
    case 'bedroom': return bgRoom(ctx, W, H, t, '#ffe9d6', '#ffd1a8')
    case 'kitchen': return bgRoom(ctx, W, H, t, '#e6f3ff', '#cfe6ff', true)
    case 'cafe':    return bgCafe(ctx, W, H, t)
    case 'night':   return bgNight(ctx, W, H, t)
    case 'beach':   return bgBeach(ctx, W, H, t)
    case 'rain':    return bgRain(ctx, W, H, t)
    default:        return bgPlain(ctx, W, H, t, tint)
  }
}

// Backwards-compatible name used by the live previews.
export function drawBackground(ctx, W, H, t, tint) {
  bgPlain(ctx, W, H, t, tint)
}

function bgPlain(ctx, W, H, t, tint) {
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, tint || '#fde4ef')
  grad.addColorStop(1, '#ece7ff')
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)
  ctx.save(); ctx.globalAlpha = 0.5
  for (let i = 0; i < 7; i++) {
    const x = W * (0.08 + ((i * 0.13) % 0.9))
    const drift = Math.sin(t * 0.6 + i * 1.7) * 18
    const y = H - ((t * 22 + i * 90) % (H + 60)) + 30
    drawHeart(ctx, x + drift, y, 9 + (i % 3) * 3, i % 2 ? '#ffd0e2' : '#fff2c2')
  }
  ctx.restore()
}

function bgPark(ctx, W, H, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#bfe9ff'); sky.addColorStop(1, '#e9f9ff')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
  fillCircle(ctx, W - 70, 70, 38, '#fff3b0')          // sun
  drawCloud(ctx, (t * 14) % (W + 120) - 60, 80, 22, '#ffffff')
  drawCloud(ctx, (t * 9 + W * 0.5) % (W + 160) - 80, 140, 18, '#ffffff')
  fillEllipse(ctx, W * 0.5, H + 60, W * 0.75, 160, '#bfe6a0')   // grass hill
  // a little tree
  fillRoundRect(ctx, W * 0.12 - 8, H * 0.55, 16, 120, 6, '#a9734a')
  fillCircle(ctx, W * 0.12, H * 0.54, 46, '#8fd07a')
}

function bgRoom(ctx, W, H, t, top, bottom, kitchen) {
  const wall = ctx.createLinearGradient(0, 0, 0, H)
  wall.addColorStop(0, top); wall.addColorStop(1, bottom)
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, H)
  fillRoundRect(ctx, 0, H * 0.72, W, H * 0.28, 0, 'rgba(120,80,50,0.18)') // floor
  // window
  fillRoundRect(ctx, W * 0.62, H * 0.16, W * 0.26, H * 0.34, 12, '#ffffff')
  fillRoundRect(ctx, W * 0.64, H * 0.18, W * 0.22, H * 0.30, 8, '#cdefff')
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(W * 0.75, H * 0.18); ctx.lineTo(W * 0.75, H * 0.48)
  ctx.moveTo(W * 0.64, H * 0.33); ctx.lineTo(W * 0.86, H * 0.33); ctx.stroke()
  if (kitchen) fillRoundRect(ctx, W * 0.08, H * 0.7, W * 0.4, 16, 6, '#d8c4a0') // counter
}

function bgCafe(ctx, W, H, t) {
  const wall = ctx.createLinearGradient(0, 0, 0, H)
  wall.addColorStop(0, '#f3e3cf'); wall.addColorStop(1, '#e3c9a8')
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, H)
  // warm bokeh window
  ctx.save(); ctx.globalAlpha = 0.5
  for (let i = 0; i < 6; i++) fillCircle(ctx, W * (0.1 + i * 0.15), 60 + (i % 2) * 26, 16, '#fff0c8')
  ctx.restore()
  fillRoundRect(ctx, 0, H * 0.74, W, H * 0.26, 0, '#a9734a')  // table
}

function bgNight(ctx, W, H, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#2b2a55'); sky.addColorStop(1, '#5a4a86')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
  fillCircle(ctx, W - 80, 80, 34, '#fff6cf')           // moon
  fillCircle(ctx, W - 66, 70, 30, '#5a4a86')           // crescent shadow
  for (let i = 0; i < 22; i++) {
    const x = (i * 97) % W
    const y = (i * 53) % (H * 0.6)
    const tw = 0.5 + 0.5 * Math.sin(t * 2 + i)
    ctx.globalAlpha = 0.4 + tw * 0.6
    drawStar(ctx, x, y, 4 + (i % 2) * 2, '#fff6cf')
  }
  ctx.globalAlpha = 1
}

function bgBeach(ctx, W, H, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#bfe9ff'); sky.addColorStop(1, '#ffe9c2')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
  fillCircle(ctx, 80, 80, 36, '#fff3b0')
  fillRoundRect(ctx, 0, H * 0.6, W, H * 0.18, 0, '#7fd1e6')  // sea
  for (let i = 0; i < 5; i++) {                              // waves
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3
    ctx.beginPath()
    const yy = H * 0.64 + i * 12 + Math.sin(t * 2 + i) * 2
    ctx.moveTo(0, yy); ctx.quadraticCurveTo(W / 2, yy + 8, W, yy); ctx.stroke()
  }
  fillRoundRect(ctx, 0, H * 0.78, W, H * 0.22, 0, '#ffe3a8')  // sand
}

function bgRain(ctx, W, H, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#9fb0c4'); sky.addColorStop(1, '#cdd6e2')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
  drawCloud(ctx, W * 0.3, 70, 26, '#eef2f7')
  drawCloud(ctx, W * 0.7, 100, 22, '#e3e9f0')
  ctx.strokeStyle = 'rgba(120,150,190,0.55)'; ctx.lineWidth = 2
  for (let i = 0; i < 40; i++) {
    const x = (i * 79 + (t * 220) % W) % W
    const y = ((i * 53) + (t * 320)) % H
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 14); ctx.stroke()
  }
}

// --- Indian-themed decorations + scenes -------------------------------------

function drawDiya(ctx, x, y, s, t) {
  ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.45, 0, 0, Math.PI); ctx.fillStyle = '#9a5a32'; ctx.fill()
  fillEllipse(ctx, x, y, s, s * 0.22, '#7a4527')
  const f = 1 + Math.sin(t * 12 + x) * 0.18
  fillEllipse(ctx, x, y - s * 0.7 * f, s * 0.3, s * 0.62 * f, '#ffb33a')
  fillEllipse(ctx, x, y - s * 0.6 * f, s * 0.15, s * 0.34 * f, '#fff1a8')
}

function drawStringLights(ctx, W, y, t) {
  ctx.strokeStyle = 'rgba(60,40,30,0.5)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(W / 2, y + 40, W, y); ctx.stroke()
  const colors = ['#ff5d7a', '#ffd23a', '#5ad1ff', '#8fe07a', '#c08bff']
  for (let i = 0; i <= 12; i++) {
    const px = (i / 12) * W
    const py = y + Math.sin((i / 12) * Math.PI) * 40 + 8
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4 + i)
    fillCircle(ctx, px, py, 6, colors[i % colors.length])
  }
  ctx.globalAlpha = 1
}

function drawToran(ctx, W, y) {
  const colors = ['#ff8a3a', '#ffd23a', '#ff5d7a', '#8fe07a']
  const n = 14, w = W / n
  for (let i = 0; i < n; i++) {
    ctx.beginPath()
    ctx.moveTo(i * w, y); ctx.lineTo((i + 1) * w, y); ctx.lineTo(i * w + w / 2, y + 26)
    ctx.closePath(); ctx.fillStyle = colors[i % colors.length]; ctx.fill()
  }
}

function drawRangoli(ctx, x, y, s, t) {
  const colors = ['#ff5d7a', '#ffd23a', '#5ad1ff', '#8fe07a', '#ff8a3a']
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5); ctx.rotate(t * 0.3)
  for (let ring = 3; ring >= 1; ring--) {
    const r = (s * ring) / 3
    for (let i = 0; i < ring * 6; i++) {
      const a = (i / (ring * 6)) * Math.PI * 2
      fillCircle(ctx, Math.cos(a) * r, Math.sin(a) * r, s * 0.09, colors[ring % colors.length])
    }
  }
  fillCircle(ctx, 0, 0, s * 0.12, '#ffd23a')
  ctx.restore()
}

function drawRickshaw(ctx, x, y, s) {
  fillCircle(ctx, x - s * 0.6, y, s * 0.28, '#2d2d33')
  fillCircle(ctx, x + s * 0.6, y, s * 0.28, '#2d2d33')
  fillCircle(ctx, x - s * 0.6, y, s * 0.12, '#9a9aa0')
  fillCircle(ctx, x + s * 0.6, y, s * 0.12, '#9a9aa0')
  fillRoundRect(ctx, x - s, y - s, s * 2, s, s * 0.3, '#ffd23a')
  ctx.beginPath(); ctx.ellipse(x, y - s, s * 0.95, s * 0.7, 0, Math.PI, 0); ctx.fillStyle = '#1f1f24'; ctx.fill()
  fillRoundRect(ctx, x - s, y - s * 0.25, s * 2, s * 0.3, s * 0.1, '#3a9a5a')
  fillCircle(ctx, x - s * 0.9, y - s * 0.4, s * 0.12, '#fff6cf')
}

function drawBuildings(ctx, W, baseY, silhouette) {
  const colors = ['#f2b8c6', '#bcd9f2', '#f7e3a8', '#c8e6c0', '#e0c8f0', '#f2c8a8']
  let x = -10, i = 0
  while (x < W) {
    const bw = 70 + (i % 3) * 26
    const bh = 120 + (i % 4) * 40
    const by = baseY - bh
    ctx.fillStyle = silhouette ? '#1c1430' : colors[i % colors.length]
    ctx.fillRect(x, by, bw, bh)
    ctx.fillStyle = silhouette ? '#ffce6a' : 'rgba(255,255,255,0.7)'
    for (let wy = by + 16; wy < baseY - 16; wy += 34) {
      for (let wx = x + 12; wx < x + bw - 12; wx += 28) {
        if (silhouette && (wx + wy) % 3 === 0) continue
        ctx.fillRect(wx, wy, 14, 18)
      }
    }
    x += bw + 6; i++
  }
}

function drawFireworks(ctx, W, H, t) {
  const bursts = [
    { x: W * 0.25, y: H * 0.2, c: '#ff5d7a' },
    { x: W * 0.6, y: H * 0.13, c: '#ffd23a' },
    { x: W * 0.82, y: H * 0.26, c: '#5ad1ff' },
  ]
  bursts.forEach((b, k) => {
    const phase = (t * 0.8 + k * 0.5) % 1
    const r = phase * 48
    ctx.globalAlpha = 1 - phase
    ctx.strokeStyle = b.c; ctx.lineWidth = 2
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(b.x + Math.cos(a) * r * 0.4, b.y + Math.sin(a) * r * 0.4)
      ctx.lineTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r)
      ctx.stroke()
    }
  })
  ctx.globalAlpha = 1
}

// Roadside chai tapri at golden hour.
function bgChai(ctx, W, H, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#ffd49e'); sky.addColorStop(1, '#f6885f')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
  drawToran(ctx, W, 0)
  fillRoundRect(ctx, 0, H * 0.74, W, H * 0.26, 0, '#9a6b48')
  fillRoundRect(ctx, W * 0.04, H * 0.6, W * 0.42, H * 0.16, 8, '#8a5a36')
  const aw = W * 0.46
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 ? '#ff5d5d' : '#fff2e0'
    const sx = W * 0.02 + (aw / 9) * i
    ctx.beginPath()
    ctx.moveTo(sx, H * 0.5); ctx.lineTo(sx + aw / 9, H * 0.5)
    ctx.lineTo(sx + aw / 9, H * 0.55); ctx.lineTo(sx + aw / 18, H * 0.585); ctx.lineTo(sx, H * 0.55)
    ctx.closePath(); ctx.fill()
  }
  const kx = W * 0.16, ky = H * 0.56
  fillRoundRect(ctx, kx - 22, ky - 16, 44, 30, 10, '#c0c4cc')
  fillRoundRect(ctx, kx - 6, ky - 26, 12, 12, 4, '#c0c4cc')
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 3
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath()
    ctx.moveTo(kx + i * 8, ky - 28)
    ctx.quadraticCurveTo(kx + i * 8 + 8 + Math.sin(t * 3 + i) * 4, ky - 46, kx + i * 8, ky - 62)
    ctx.stroke()
  }
}

// Busy Indian street with an auto-rickshaw driving by.
function bgStreet(ctx, W, H, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#bfe0ff'); sky.addColorStop(1, '#ffe6c2')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
  drawBuildings(ctx, W, H * 0.78, false)
  fillRoundRect(ctx, 0, H * 0.78, W, H * 0.22, 0, '#6b6b73')
  ctx.fillStyle = '#ffd23a'
  for (let x = 10; x < W; x += 60) ctx.fillRect(x, H * 0.88, 30, 5)
  drawToran(ctx, W, 0)
  const rx = ((t * 34) % (W + 220)) - 110
  drawRickshaw(ctx, rx, H * 0.87, 34)
}

// Cozy Indian living room with rangoli + diya.
function bgHome(ctx, W, H, t) {
  const wall = ctx.createLinearGradient(0, 0, 0, H)
  wall.addColorStop(0, '#fbe6cf'); wall.addColorStop(1, '#f4cfa6')
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, H)
  fillRoundRect(ctx, 0, H * 0.72, W, H * 0.28, 0, '#c89a6a')
  fillRoundRect(ctx, W * 0.62, H * 0.14, W * 0.26, H * 0.32, 10, '#ffffff')
  fillRoundRect(ctx, W * 0.64, H * 0.16, W * 0.22, H * 0.28, 6, '#bfe6ff')
  fillRoundRect(ctx, W * 0.61, H * 0.13, W * 0.05, H * 0.34, 6, '#e06a8a')
  fillRoundRect(ctx, W * 0.84, H * 0.13, W * 0.05, H * 0.34, 6, '#e06a8a')
  fillRoundRect(ctx, W * 0.12, H * 0.18, W * 0.16, H * 0.18, 6, '#a9734a')
  fillRoundRect(ctx, W * 0.135, H * 0.2, W * 0.13, H * 0.14, 4, '#cdeac0')
  drawRangoli(ctx, W * 0.3, H * 0.87, 42, t)
  drawDiya(ctx, W * 0.72, H * 0.8, 14, t)
}

// Diwali night: fireworks, string lights, diyas.
function bgDiwali(ctx, W, H, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#2a1f4a'); sky.addColorStop(1, '#5a3a6a')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 16; i++) {
    ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i))
    drawStar(ctx, (i * 71) % W, (i * 47) % (H * 0.4), 3, '#fff6cf')
  }
  ctx.globalAlpha = 1
  drawBuildings(ctx, W, H * 0.82, true)
  drawFireworks(ctx, W, H, t)
  drawStringLights(ctx, W, H * 0.1, t)
  for (let i = 0; i < 7; i++) drawDiya(ctx, W * (0.1 + i * 0.13), H * 0.85, 13, t + i)
}

// Rainy monsoon street.
function bgMonsoon(ctx, W, H, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#8a93a8'); sky.addColorStop(1, '#b7bfce')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
  drawBuildings(ctx, W, H * 0.78, true)
  fillRoundRect(ctx, 0, H * 0.78, W, H * 0.22, 0, '#565b66')
  fillEllipse(ctx, W * 0.35, H * 0.93, 90, 12, 'rgba(190,205,225,0.35)')
  fillEllipse(ctx, W * 0.7, H * 0.88, 60, 9, 'rgba(190,205,225,0.3)')
  ctx.strokeStyle = 'rgba(210,225,245,0.6)'; ctx.lineWidth = 2
  for (let i = 0; i < 50; i++) {
    const x = (i * 79 + (t * 240) % W) % W
    const y = ((i * 53) + (t * 360)) % H
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 16); ctx.stroke()
  }
}

// --- props -------------------------------------------------------------------

export function drawProp(ctx, prop, { cx, cy, t, scale = 1 }) {
  if (!prop || prop === 'none') return
  const bob = Math.sin(t * 3) * 6 * scale
  const x = cx, y = cy + bob
  switch (prop) {
    case 'heart':
      drawHeart(ctx, x, y, 26 * scale, '#ff6f91')
      drawHeart(ctx, x - 34 * scale, y + 14 * scale, 14 * scale, '#ffb0c8')
      drawHeart(ctx, x + 34 * scale, y + 8 * scale, 16 * scale, '#ff9aae')
      break
    case 'gift':
      fillRoundRect(ctx, x - 26 * scale, y - 20 * scale, 52 * scale, 46 * scale, 8 * scale, '#ff8fa3')
      fillRoundRect(ctx, x - 5 * scale, y - 20 * scale, 10 * scale, 46 * scale, 2 * scale, '#fff2c2')
      fillRoundRect(ctx, x - 26 * scale, y - 4 * scale, 52 * scale, 8 * scale, 2 * scale, '#fff2c2')
      fillCircle(ctx, x, y - 24 * scale, 8 * scale, '#fff2c2')
      break
    case 'food':   // a cute rice ball / donut
      fillCircle(ctx, x, y, 24 * scale, '#fff4d6')
      fillCircle(ctx, x, y, 9 * scale, '#ffd9a0')
      fillEllipse(ctx, x - 6 * scale, y - 6 * scale, 5 * scale, 3 * scale, '#3b3b40')
      fillEllipse(ctx, x + 6 * scale, y - 6 * scale, 5 * scale, 3 * scale, '#3b3b40')
      break
    case 'balloon': {
      ctx.strokeStyle = '#9a9ab0'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 60 * scale); ctx.stroke()
      fillEllipse(ctx, x, y - 18 * scale, 24 * scale, 30 * scale, '#ff8fb0')
      break
    }
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        fillCircle(ctx, x + Math.cos(a) * 16 * scale, y + Math.sin(a) * 16 * scale, 11 * scale, '#ffd1e0')
      }
      fillCircle(ctx, x, y, 11 * scale, '#ffe08a')
      break
    case 'coffee':
      fillRoundRect(ctx, x - 20 * scale, y - 16 * scale, 40 * scale, 34 * scale, 8 * scale, '#ffffff')
      fillRoundRect(ctx, x - 14 * scale, y - 12 * scale, 28 * scale, 12 * scale, 4 * scale, '#a9734a')
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath()
        ctx.moveTo(x + i * 8 * scale, y - 20 * scale)
        ctx.quadraticCurveTo(x + i * 8 * scale + 6 * scale, y - 32 * scale, x + i * 8 * scale, y - 44 * scale)
        ctx.stroke()
      }
      break
  }
}

// --- the character -----------------------------------------------------------

// Draws one animated character. (cx, cy) is the HEAD centre.
//   t       : seconds (idle/blink/wave)
//   mouth   : 0..1 mouth openness (lip-sync); 0 = idle/closed
//   emotion : one of EMOTIONS
//   scale   : size multiplier
export function drawCharacter(ctx, cfg, { cx, cy, t, mouth = 0, scale = 1, emotion = 'neutral' }) {
  const headR = 92 * scale
  const speaking = mouth > 0.12
  const bob = Math.sin(t * 2) * 4 * scale + (speaking ? Math.sin(t * 9) * 2 * scale : 0)
  const breathe = 1 + Math.sin(t * 2) * 0.012
  const blink = (t % 3.2) < 0.14 && emotion !== 'love' && emotion !== 'sleepy'
  const wave = Math.sin(t * 6) * (0.12 + mouth * 0.5)

  ctx.save()
  ctx.translate(cx, cy + bob)
  ctx.scale(breathe, breathe)

  const bodyCy = headR + 96 * scale
  const bodyRx = 82 * scale
  const bodyRy = 96 * scale

  fillEllipse(ctx, 0, bodyCy + bodyRy - 6, bodyRx * 0.95, 20 * scale, 'rgba(80,60,90,0.12)')
  fillEllipse(ctx, -42 * scale, bodyCy + bodyRy - 14, 30 * scale, 20 * scale, cfg.shade)
  fillEllipse(ctx,  42 * scale, bodyCy + bodyRy - 14, 30 * scale, 20 * scale, cfg.shade)

  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(side * (bodyRx - 6 * scale), bodyCy - 8 * scale)
    ctx.rotate(side * wave)
    fillEllipse(ctx, side * 16 * scale, 24 * scale, 20 * scale, 34 * scale, cfg.fur)
    ctx.restore()
  }

  fillEllipse(ctx, 0, bodyCy, bodyRx, bodyRy, cfg.fur)
  fillEllipse(ctx, 0, bodyCy + 14 * scale, bodyRx * 0.62, bodyRy * 0.66, cfg.shade)

  const earY = -headR * 0.78
  fillCircle(ctx, -headR * 0.66, earY, 34 * scale, cfg.ear)
  fillCircle(ctx,  headR * 0.66, earY, 34 * scale, cfg.ear)
  fillCircle(ctx, -headR * 0.66, earY, 17 * scale, cfg.cheek)
  fillCircle(ctx,  headR * 0.66, earY, 17 * scale, cfg.cheek)

  fillCircle(ctx, 0, 0, headR, cfg.fur)
  if (cfg.type === 'panda') {
    fillEllipse(ctx, -32 * scale, -4 * scale, 22 * scale, 26 * scale, 'rgba(60,60,70,0.10)')
    fillEllipse(ctx,  32 * scale, -4 * scale, 22 * scale, 26 * scale, 'rgba(60,60,70,0.10)')
  }

  // Cheeks — brighter for happy/love.
  const blush = emotion === 'love' || emotion === 'happy' || emotion === 'excited' ? 14 : 12
  fillEllipse(ctx, -52 * scale, 24 * scale, 19 * scale, blush * scale, cfg.cheek)
  fillEllipse(ctx,  52 * scale, 24 * scale, 19 * scale, blush * scale, cfg.cheek)

  drawEyes(ctx, 32 * scale, -4 * scale, scale, emotion, blink, cfg)
  drawBrows(ctx, 32 * scale, -26 * scale, scale, emotion, cfg)
  fillEllipse(ctx, 0, 16 * scale, 7 * scale, 5 * scale, cfg.accent)
  drawMouth(ctx, 0, 30 * scale, mouth, scale, cfg.accent, emotion)

  // a teardrop for sad
  if (emotion === 'sad') fillEllipse(ctx, 44 * scale, 6 * scale, 5 * scale, 8 * scale, '#8fd0ff')

  ctx.restore()
}

function drawEyes(ctx, eyeX, eyeY, scale, emotion, blink, cfg) {
  const c = cfg.accent
  if (blink) {
    ctx.strokeStyle = c; ctx.lineWidth = 5 * scale; ctx.lineCap = 'round'
    for (const sx of [-eyeX, eyeX]) {
      ctx.beginPath(); ctx.arc(sx, eyeY + 2 * scale, 9 * scale, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke()
    }
    return
  }
  if (emotion === 'love') {
    drawHeart(ctx, -eyeX, eyeY - 6 * scale, 10 * scale, '#ff5d7a')
    drawHeart(ctx,  eyeX, eyeY - 6 * scale, 10 * scale, '#ff5d7a')
    return
  }
  if (emotion === 'happy' || emotion === 'excited') { // upward happy arcs ^ ^
    ctx.strokeStyle = c; ctx.lineWidth = 5 * scale; ctx.lineCap = 'round'
    for (const sx of [-eyeX, eyeX]) {
      ctx.beginPath(); ctx.arc(sx, eyeY + 6 * scale, 9 * scale, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke()
    }
    return
  }
  if (emotion === 'sleepy') {
    ctx.strokeStyle = c; ctx.lineWidth = 5 * scale; ctx.lineCap = 'round'
    for (const sx of [-eyeX, eyeX]) {
      ctx.beginPath(); ctx.moveTo(sx - 8 * scale, eyeY); ctx.lineTo(sx + 8 * scale, eyeY); ctx.stroke()
    }
    return
  }
  const r = emotion === 'surprised' ? 12 * scale : 9 * scale
  fillCircle(ctx, -eyeX, eyeY, r, c)
  fillCircle(ctx,  eyeX, eyeY, r, c)
  fillCircle(ctx, -eyeX + 3 * scale, eyeY - 3 * scale, 3 * scale, 'rgba(255,255,255,0.9)')
  fillCircle(ctx,  eyeX + 3 * scale, eyeY - 3 * scale, 3 * scale, 'rgba(255,255,255,0.9)')
}

function drawBrows(ctx, eyeX, browY, scale, emotion, cfg) {
  if (emotion !== 'angry' && emotion !== 'sad') return
  ctx.strokeStyle = cfg.accent; ctx.lineWidth = 4 * scale; ctx.lineCap = 'round'
  const innerDown = emotion === 'angry' // angry: inner ends slant down toward the nose
  for (const s of [-1, 1]) {
    const innerX = s * (eyeX - 9 * scale)
    const outerX = s * (eyeX + 9 * scale)
    const innerY = browY + (innerDown ? 5 * scale : -5 * scale)
    const outerY = browY + (innerDown ? -3 * scale : 4 * scale)
    ctx.beginPath(); ctx.moveTo(outerX, outerY); ctx.lineTo(innerX, innerY); ctx.stroke()
  }
}

function drawMouth(ctx, x, y, open, scale, color, emotion) {
  ctx.save(); ctx.translate(x, y)
  ctx.strokeStyle = color; ctx.lineWidth = 4 * scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  if (open > 0.14) {
    const w = (10 + open * 6) * scale
    const h = (4 + open * 18) * scale
    fillEllipse(ctx, 0, h * 0.4, w, h, '#5b2a32')
    fillEllipse(ctx, 0, h * 0.9, w * 0.7, h * 0.45, '#ff8aa0')
  } else if (emotion === 'sad' || emotion === 'angry') {
    ctx.beginPath()
    ctx.moveTo(-8 * scale, 4 * scale)
    ctx.quadraticCurveTo(0, -3 * scale, 8 * scale, 4 * scale)
    ctx.stroke()
  } else if (emotion === 'surprised') {
    fillEllipse(ctx, 0, 2 * scale, 6 * scale, 8 * scale, '#5b2a32')
  } else { // happy little "ω"
    const s = scale
    ctx.beginPath()
    ctx.moveTo(-9 * s, 0)
    ctx.quadraticCurveTo(-4.5 * s, 6 * s, 0, 0)
    ctx.quadraticCurveTo(4.5 * s, 6 * s, 9 * s, 0)
    ctx.stroke()
  }
  ctx.restore()
}
