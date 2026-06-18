// Builds a downloadable multi-scene "cartoon story" video entirely in the
// browser — no paid services. It fetches free TTS audio (via our /api/tts
// proxy), animates two characters (the duo) across scenes with changing
// backgrounds, emotions and props in sync with the audio, and records the
// canvas + audio to a downloadable WebM with MediaRecorder.

import {
  getCharacter, getPartner, drawSceneBackground, drawCharacter, drawProp,
  computePose, voiceForCharacter, EMOTIONS, SETTINGS, ACTIONS,
} from './characters'

// --- uploaded-artwork rendering ----------------------------------------------

function loadImage(src) {
  return new Promise((resolve) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => resolve(null)
    im.src = src
  })
}

function heartShape(ctx, x, y, s, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.beginPath()
  ctx.moveTo(0, s * 0.35)
  ctx.bezierCurveTo(s, -s * 0.6, s * 1.1, s * 0.5, 0, s * 1.15)
  ctx.bezierCurveTo(-s * 1.1, s * 0.5, -s, -s * 0.6, 0, s * 0.35)
  ctx.fillStyle = '#ff5d7a'; ctx.fill(); ctx.restore()
}

function starShape(ctx, x, y, s, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * s, Math.sin(a) * s)
  }
  ctx.closePath(); ctx.fillStyle = '#ffd23a'; ctx.fill(); ctx.restore()
}

// Floating effects drawn above an uploaded character (x = its centre, headY = top area).
function drawArtFx(ctx, fx, x, headY, t) {
  if (!fx || !fx.length) return
  for (const f of fx) {
    if (f === 'hearts') {
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.6 + i * 0.33) % 1
        heartShape(ctx, x + (i - 1) * 26 + Math.sin(t * 2 + i) * 14, headY - p * 60, 8 + i * 2, 1 - p)
      }
    } else if (f === 'tears') {
      for (const sx of [-1, 1]) {
        const p = (t * 1.6 + (sx > 0 ? 0.5 : 0)) % 1
        ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = '#8fd0ff'
        ctx.beginPath(); ctx.ellipse(x + sx * 22, headY + 34 + p * 44, 5, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      }
    } else if (f === 'dizzy') {
      for (let i = 0; i < 3; i++) {
        const a = t * 4 + i * 2.1
        starShape(ctx, x + Math.cos(a) * 26, headY - 10 + Math.sin(a) * 8, 6, 1)
      }
    } else if (f === 'sparkle') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * 6.283 + t
        starShape(ctx, x + Math.cos(a) * 42, headY + Math.sin(a) * 32, 6, 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i)))
      }
    } else if (f === 'anger') {
      ctx.save(); ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 3
      const px = x + 36, py = headY - 4
      for (const [a, b] of [[-1, -1], [1, -1], [0, 1]]) {
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + a * 9, py + b * 9); ctx.stroke()
      }
      ctx.restore()
    } else if (f === 'notes') {
      for (let i = 0; i < 2; i++) {
        const p = (t * 0.7 + i * 0.5) % 1
        const nx = x + (i ? 30 : -30), ny = headY - p * 50
        ctx.save(); ctx.globalAlpha = 1 - p; ctx.fillStyle = '#6a5acd'
        ctx.beginPath(); ctx.arc(nx, ny, 5, 0, 6.283); ctx.fill(); ctx.fillRect(nx + 3, ny - 16, 2, 16); ctx.restore()
      }
    } else if (f === 'exclaim') {
      ctx.save(); ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2
      ctx.font = 'bold 42px sans-serif'; ctx.textAlign = 'center'
      const bob = Math.sin(t * 6) * 3
      ctx.fillText('!', x, headY - 6 + bob); ctx.strokeText('!', x, headY - 6 + bob); ctx.restore()
    } else if (f === 'zzz') {
      ctx.save(); ctx.fillStyle = '#8fb0ff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'left'
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.5 + i * 0.33) % 1
        ctx.globalAlpha = 1 - p
        ctx.fillText('z', x + 12 + i * 12, headY - 6 - p * 40 - i * 6)
      }
      ctx.restore()
    }
  }
}

// Draw an uploaded character image, puppeted by the pose. Picks the image that
// best matches the scene: an expression image for the emotion, the "talking"
// image while the mouth is open (lip-sync), else the normal image.
const EMOTION_SLOT = { happy: 'happy', excited: 'happy', love: 'love', sad: 'sad', angry: 'angry', surprised: 'surprised' }
// In one-photo mode, the emotion always adds a floating cue so the face reacts.
const EMO_FX = { sad: 'tears', angry: 'anger', love: 'hearts', happy: 'sparkle', excited: 'sparkle', surprised: 'exclaim', sleepy: 'zzz' }

function drawArtworkChar(ctx, imgs, pose, { cx, baselineY, maxW, maxH, mouth, emotion, action, t }) {
  let im = imgs.base
  const es = EMOTION_SLOT[emotion]
  if (es && imgs[es]) im = imgs[es]
  if (action === 'cry' && imgs.cry) im = imgs.cry
  if ((action === 'hit' || action === 'beat') && imgs.angry) im = imgs.angry
  if (pose.turnAway && imgs.angry) im = imgs.angry
  const speaking = mouth > 0.15
  if (speaking && imgs.talk) im = imgs.talk
  if (!im) { for (const k in imgs) { im = imgs[k]; break } }
  if (!im || !im.height) return
  // Fit the image inside a box (both width and height) so wide or boxy images
  // never blow up or overlap the other character.
  const s = Math.min(maxH / im.height, maxW / im.width)
  const w = im.width * s, h = im.height * s

  // --- layered motion so a flat photo really "comes alive" -------------------
  // 1. Idle breathing + a gentle sway/rock, always on (even when listening).
  const breathe = 1 + Math.sin(t * 1.8) * 0.012
  let sway = Math.sin(t * 1.1) * 3            // horizontal drift (px)
  let bob = Math.sin(t * 1.8) * 3             // vertical bob (px)
  let tilt = Math.sin(t * 0.9) * 0.02         // gentle head/body rock (rad)
  let squash = pose.squash
  let stretchY = 1

  // 2. Talking: a livelier bob + a subtle vertical "jaw" stretch tied to volume.
  //    (When a dedicated "talk" image exists we keep it gentler — the swap
  //    already sells the speech.)
  if (speaking) {
    const amp = 0.5 + mouth
    const fast = Math.sin(t * 24)
    bob += fast * (imgs.talk ? 1.2 : 2.4) * amp
    stretchY = 1 + (imgs.talk ? 0.01 : 0.03) * amp * (0.5 + 0.5 * fast)
    tilt += Math.sin(t * 12) * 0.01 * amp
  }

  // 3. Emotion gives the whole body a posture / accent on top of the action.
  switch (emotion) {
    case 'sad':
      bob += 5; tilt += 0.05; squash += 0.02; break               // droop + lean
    case 'sleepy':
      bob += 6; tilt += Math.sin(t * 0.7) * 0.06; break            // slow nod-off
    case 'happy': case 'excited':
      bob -= Math.abs(Math.sin(t * 4)) * 6; break                  // little hops
    case 'love':
      tilt += Math.sin(t * 1.6) * 0.04; break                      // sway dreamily
    case 'surprised':
      bob -= 4; squash -= 0.03; break                              // pull up, startled
    case 'angry':
      sway += Math.sin(t * 22) * 2; tilt += Math.sin(t * 22) * 0.015; break // tense shake
    default: break
  }

  ctx.save()
  ctx.translate(cx + pose.dx * 1.3 + sway, baselineY + pose.dy * 1.4 + bob)
  ctx.rotate(-pose.lean + tilt)
  ctx.scale(breathe, breathe * (1 - squash) * stretchY)
  if (pose.turnAway) ctx.scale(-1, 1)
  ctx.drawImage(im, -w / 2, -h, w, h)
  ctx.restore()
}

// Pick a fitting action when the AI didn't specify one (or for the no-AI path).
function actionForEmotion(emotion) {
  switch (emotion) {
    case 'love': return 'hug'
    case 'sad': return 'cry'
    case 'angry': return 'sulk'
    case 'surprised': return 'jump'
    case 'excited': return 'dance'
    case 'happy': return 'wave'
    default: return 'idle'
  }
}

// No-AI path: read keywords in a sentence to choose a fitting background,
// emotion, action and prop — so the typed story actually drives the video.
function detectScene(sentence) {
  const s = ' ' + sentence.toLowerCase() + ' '
  const has = (re) => re.test(s)

  let setting = 'plain'
  if (has(/chai|\btea\b|coffee|cafe|tapri/)) setting = 'chai'
  else if (has(/auto|rickshaw|street|road|market|bazaar|shop/)) setting = 'street'
  else if (has(/rain|baarish|monsoon|umbrella|wet/)) setting = 'monsoon'
  else if (has(/diwali|festival|firework|cracker|diya|celebrat/)) setting = 'diwali'
  else if (has(/home|ghar|room|house|\bbed\b|kitchen/)) setting = 'home'
  else if (has(/park|garden|tree|outside/)) setting = 'park'
  else if (has(/night|star|moon|sky/)) setting = 'night'
  else if (has(/beach|\bsea\b|ocean|sand/)) setting = 'beach'

  let emotion = 'happy'
  let action = 'wave'
  if (has(/\bhit\b|beat|maar|punch|fight|thappad|slap|jhagda|jhagra/)) { emotion = 'angry'; action = 'hit' }
  else if (has(/angry|naraz|gussa|huff|upset with|annoy/)) { emotion = 'angry'; action = 'sulk' }
  else if (has(/sorry|maaf|forgive|apolog|please don/)) { emotion = 'love'; action = 'give' }
  else if (has(/love|pyaar|hug|miss you|\bdear\b|jaan|sweet/)) { emotion = 'love'; action = 'hug' }
  else if (has(/\bsee\b|dekh|look at|eyes|stare|gaze|notice/)) { emotion = 'love'; action = 'look' }
  else if (has(/sad|cry|rote|tear|forgot|alone|lonely|hurt/)) { emotion = 'sad'; action = 'cry' }
  else if (has(/dance|party|celebrat|naach|enjoy/)) { emotion = 'excited'; action = 'dance' }
  else if (has(/wow|surprise|arre|sudden|shock|woah|oh no/)) { emotion = 'surprised'; action = 'jump' }
  else if (has(/yay|hurray|happy|friend|best|togeth|hello|\bhi\b|namaste/)) { emotion = 'happy'; action = 'clap' }

  let prop = 'none'
  if (has(/\bstick\b|danda|cane|baton|lakdi/)) prop = 'stick'
  else if (has(/hammer|mallet|hathoda/)) prop = 'hammer'
  else if (has(/gift|present|surprise box/)) prop = 'gift'
  else if (has(/flower|rose|gulab/)) prop = 'flower'
  else if (has(/balloon/)) prop = 'balloon'
  else if (has(/samosa|cake|food|\beat\b|khana|biscuit|sweets|laddu|chocolate/)) prop = 'food'
  else if (has(/chai|\btea\b|coffee/)) prop = 'coffee'
  else if (has(/love|pyaar|heart/)) prop = 'heart'

  return { setting, emotion, action, prop }
}

// Split text into chunks that fit the free TTS length limit (~200 chars),
// breaking on sentence boundaries where possible.
function splitIntoChunks(text, max = 180) {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g) || [text]
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    const s = sentence.trim()
    if (!s) continue
    if (s.length > max) {
      if (current) { chunks.push(current.trim()); current = '' }
      for (let i = 0; i < s.length; i += max) chunks.push(s.slice(i, i + max))
      continue
    }
    if ((current + ' ' + s).trim().length > max) { chunks.push(current.trim()); current = s }
    else current = (current + ' ' + s).trim()
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

function pickMimeType() {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type
  }
  return 'video/webm'
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word }
    else line = test
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Turn the AI analysis (or plain text) into a list of renderable scenes.
// Each scene: { narration, speaker: 'main'|'partner'|'both', emotion, setting, prop }
function buildScenes(scenes, script, mainName, partnerName) {
  const main = mainName.toLowerCase()
  const partner = partnerName.toLowerCase()

  const speakerSide = (raw) => {
    const s = (raw || '').toLowerCase()
    if (s.includes('both')) return 'both'
    if (s.includes(partner)) return 'partner'
    return 'main'
  }
  const clean = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback)

  if (Array.isArray(scenes) && scenes.length) {
    return scenes
      .filter((s) => (s.narration || '').trim())
      .map((s) => {
        const emotion = clean(s.emotion, EMOTIONS, 'happy')
        return {
          narration: s.narration.trim(),
          speaker: speakerSide(s.speaker),
          emotion,
          setting: clean(s.setting, SETTINGS, 'plain'),
          prop: s.prop || 'none',
          action: clean(s.action, ACTIONS, actionForEmotion(emotion)),
        }
      })
  }

  // No AI scenes. If the user wrote a "Name: dialogue" script we honour who
  // speaks each line; lines like "Both: ..." make both speak. Lines without a
  // name simply alternate. Keywords in each line pick background/action/prop.
  const rawLines = script.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const lines = rawLines.length > 1 ? rawLines : splitIntoChunks(script, 120)
  const out = []
  let last = 'partner'
  for (const line of lines) {
    let speaker = null
    let text = line
    let tag = ''
    const m = line.match(/^([A-Za-z]+)\s*(?:[([]([^)\]]*)[)\]])?\s*:\s*(.*)$/)
    if (m) {
      const nm = m[1].toLowerCase()
      tag = (m[2] || '').toLowerCase().trim()
      text = m[3]
      if (nm === main) speaker = 'main'
      else if (nm === partner) speaker = 'partner'
      else if (nm === 'both') speaker = 'both'
    }
    text = text.trim()
    if (!text) continue
    if (!speaker) speaker = last === 'main' ? 'partner' : 'main'
    if (speaker !== 'both') last = speaker
    const scene = { narration: text, speaker, ...detectScene(text) }
    const tg = TAG_MAP[tag]
    if (tg) { scene.emotion = tg.emotion; scene.action = tg.action; if (tg.prop) scene.prop = tg.prop }
    out.push(scene)
  }
  return out.length ? out : [{ narration: script.trim(), speaker: 'main', ...detectScene(script) }]
}

// Resolve a script/analysis into an ordered list of spoken lines with the
// actual character NAME for each line. Used by the paid "movie" pipeline so the
// right face speaks each line. ('both' lines are spoken by the main character.)
export function planConversation({ scenes, script, character }) {
  const mainCfg = getCharacter(character)
  const partnerCfg = getPartner(character)
  const story = buildScenes(scenes, script, mainCfg.label, partnerCfg.label)
  return story
    .filter((s) => (s.narration || '').trim())
    .map((s) => ({
      name: s.speaker === 'partner' ? partnerCfg.label : mainCfg.label,
      narration: s.narration.trim(),
      emotion: s.emotion,
    }))
}

// Optional "(tag)" after a name in a dialogue line sets the emotion + action
// explicitly, e.g.  Bubu (beat): I will hit you!   or   Dudu (cry): It hurts!
const TAG_MAP = {
  happy: { emotion: 'happy', action: 'wave' }, smile: { emotion: 'happy', action: 'wave' },
  sad: { emotion: 'sad', action: 'cry' }, cry: { emotion: 'sad', action: 'cry' }, crying: { emotion: 'sad', action: 'cry' },
  angry: { emotion: 'angry', action: 'sulk' }, mad: { emotion: 'angry', action: 'sulk' },
  love: { emotion: 'love', action: 'look' }, romantic: { emotion: 'love', action: 'look' },
  hug: { emotion: 'love', action: 'hug' }, kiss: { emotion: 'love', action: 'look' },
  surprised: { emotion: 'surprised', action: 'jump' }, wow: { emotion: 'surprised', action: 'jump' },
  shock: { emotion: 'surprised', action: 'jump' }, shocked: { emotion: 'surprised', action: 'jump' },
  excited: { emotion: 'excited', action: 'jump' }, jump: { emotion: 'excited', action: 'jump' },
  dance: { emotion: 'excited', action: 'dance' }, clap: { emotion: 'happy', action: 'clap' },
  wave: { emotion: 'happy', action: 'wave' }, hit: { emotion: 'angry', action: 'hit' },
  beat: { emotion: 'angry', action: 'beat', prop: 'stick' }, stick: { emotion: 'angry', action: 'beat', prop: 'stick' },
  hammer: { emotion: 'angry', action: 'beat', prop: 'hammer' },
  chase: { emotion: 'angry', action: 'chase' }, run: { emotion: 'surprised', action: 'run' },
  sulk: { emotion: 'angry', action: 'sulk' }, sorry: { emotion: 'love', action: 'give' },
  give: { emotion: 'happy', action: 'give' }, gift: { emotion: 'happy', action: 'give', prop: 'gift' },
  point: { emotion: 'neutral', action: 'point' }, look: { emotion: 'love', action: 'look' },
  nod: { emotion: 'happy', action: 'nod' }, shake: { emotion: 'angry', action: 'shake' },
  sleepy: { emotion: 'sleepy', action: 'idle' },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function createTalkingVideo({ script, scenes, character, canvas, onStatus, mode, artwork, showCaptions = false, voices }) {
  if (typeof window === 'undefined') throw new Error('Must run in the browser.')
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx || typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
    throw new Error('Your browser does not support in-browser video recording. Try Chrome or Edge.')
  }

  const mainCfg = getCharacter(character)
  const partnerCfg = getPartner(character)
  const story = buildScenes(scenes, script, mainCfg.label, partnerCfg.label)
  if (!story.length) throw new Error('Nothing to say — please add some story text.')

  const audioCtx = new AudioCtx()

  // 1. Generate TTS for each scene (a scene may need several chunks).
  let total = 0
  story.forEach((s) => (total += splitIntoChunks(s.narration).length))
  let done = 0
  for (const scene of story) {
    scene.buffers = []
    // Voice belongs to whoever speaks this scene ('both' uses the main voice).
    // Honour any per-character voice chosen in the UI.
    const whoName = scene.speaker === 'partner' ? partnerCfg.label : mainCfg.label
    const preset = voiceForCharacter(whoName, voices)
    scene.voice = preset.voice
    let src = 'edge'
    for (const chunk of splitIntoChunks(scene.narration)) {
      if (onStatus) onStatus(`Generating voice ${++done}/${total}...`)
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the scene emotion + the preset's base prosody so the voice
        // actually sounds happy/sad/angry per scene.
        body: JSON.stringify({
          text: chunk,
          voice: preset.voice,
          emotion: scene.emotion,
          rate: preset.rate,
          pitch: preset.pitch,
        }),
      })
      if (!res.ok) {
        const info = await res.json().catch(() => ({}))
        throw new Error(info.message || 'Voice generation failed.')
      }
      src = res.headers.get('X-TTS-Source') || src
      const arr = await res.arrayBuffer()
      scene.buffers.push(await audioCtx.decodeAudioData(arr))
    }
    // Edge voices already carry the pitch/expression in the audio (via SSML), so
    // we play them at normal rate. The generic Google fallback can't do that, so
    // we apply the preset's playbackRate tweak to keep voices distinct.
    scene.pitch = src === 'google' ? (preset.fallbackPitch || 1) : 1
  }

  // 2. Audio graph: clip → analyser (mouth) + speakers + recording dest.
  const dest = audioCtx.createMediaStreamDestination()
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 256
  const freq = new Uint8Array(analyser.frequencyBinCount)

  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height

  // Preload any uploaded artwork for the two cast members.
  // GIFs only animate while attached to the page, so we mount them off-screen
  // and draw the live frame each tick; remove them when we're done.
  const domImgs = []
  const loadArtImage = (src) => {
    if (typeof src === 'string' && src.startsWith('data:image/gif')) {
      return new Promise((resolve) => {
        const im = new Image()
        im.onload = () => resolve(im)
        im.onerror = () => resolve(null)
        im.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;opacity:0.01;'
        document.body.appendChild(im)
        domImgs.push(im)
        im.src = src
      })
    }
    return loadImage(src)
  }

  const art = {}
  if (artwork) {
    for (const cfg of [mainCfg, partnerCfg]) {
      const a = artwork[cfg.label]
      if (a) {
        const imgs = {}
        for (const slot of Object.keys(a)) {
          if (a[slot]) { const im = await loadArtImage(a[slot]); if (im) imgs[slot] = im }
        }
        if (Object.keys(imgs).length) art[cfg.label] = imgs
      }
    }
  }
  const hasArt = !!(art[mainCfg.label] || art[partnerCfg.label])

  // Optional 3D stage (skipped when using uploaded artwork). Falls back to 2D.
  let scene3d = null
  if (mode === '3d' && !hasArt) {
    try {
      if (onStatus) onStatus('Loading 3D stage...')
      const { createScene3D } = await import('./scene3d')
      scene3d = await createScene3D(W, H, mainCfg, partnerCfg)
    } catch (e) {
      scene3d = null
    }
  }

  // 3. Combine canvas video + TTS audio into one stream and record.
  const canvasStream = canvas.captureStream(30)
  const mixed = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ])
  const recorder = new MediaRecorder(mixed, { mimeType: pickMimeType() })
  const recorded = []
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) recorded.push(e.data) }
  const stopped = new Promise((resolve) => { recorder.onstop = resolve })
  recorder.start()

  // 4. Shared animation state, updated as scenes play.
  const state = { scene: story[0], caption: '', mouth: 0, flashStart: -1, sceneStart: 0 }
  let rafId = null
  const start = performance.now()

  const draw = () => {
    const t = (performance.now() - start) / 1000
    const lt = t - state.sceneStart // seconds since this scene began
    const sc = state.scene

    analyser.getByteFrequencyData(freq)
    const avg = freq.reduce((a, b) => a + b, 0) / freq.length
    state.mouth = state.mouth * 0.55 + (avg / 255) * 0.45

    drawSceneBackground(ctx, W, H, t, sc.setting, mainCfg.cheek + '55')

    const speakMouth = state.mouth
    const mainSpeaks = sc.speaker === 'main' || sc.speaker === 'both'
    const partnerSpeaks = sc.speaker === 'partner' || sc.speaker === 'both'

    if (scene3d) {
      // 3D characters rendered on a transparent canvas, composited over the
      // painted 2D background.
      scene3d.frame({
        t, lt, action: sc.action, emotion: sc.emotion,
        mainMouth: mainSpeaks ? speakMouth : 0,
        partnerMouth: partnerSpeaks ? speakMouth : 0,
        mainRole: mainSpeaks ? 'actor' : 'reactor',
        partnerRole: partnerSpeaks ? 'actor' : 'reactor',
      })
      ctx.drawImage(scene3d.canvas, 0, 0, W, H)
    } else {
      // Two characters; uploaded artwork if available, else the drawn character.
      const baselineY = H * 0.95
      const maxH = H * 0.66
      const maxW = W * 0.4 // keep each character within its half → no overlap
      const renderChar = (cfg, role, facing, cx, tt, mouth) => {
        const a = art[cfg.label]
        if (a) {
          const pose = computePose(sc.action, role, lt, tt, mouth, sc.emotion, facing)
          drawArtworkChar(ctx, a, pose, { cx, baselineY, maxW, maxH, mouth, emotion: sc.emotion, action: sc.action, t: tt })
          // One-photo mode: also add an emotion cue so the face always "reacts".
          const fxList = pose.fx.slice()
          const ef = EMO_FX[sc.emotion]
          if (ef && !fxList.includes(ef)) fxList.push(ef)
          drawArtFx(ctx, fxList, cx, baselineY - maxH * 0.85, tt)
        } else {
          drawCharacter(ctx, cfg, {
            cx, cy: H * 0.4, t: tt, mouth, scale: 0.62,
            emotion: sc.emotion, action: sc.action, lt, role, facing,
          })
        }
      }
      renderChar(mainCfg, mainSpeaks ? 'actor' : 'reactor', 1, W * 0.27, t, mainSpeaks ? speakMouth : 0)
      renderChar(partnerCfg, partnerSpeaks ? 'actor' : 'reactor', -1, W * 0.73, t + 1.3, partnerSpeaks ? speakMouth : 0)
    }

    // Prop goes into the speaking character's hand (centre for 3D / "both").
    if (sc.prop && sc.prop !== 'none') {
      if (scene3d || sc.speaker === 'both') {
        drawProp(ctx, sc.prop, { cx: W * 0.5, cy: scene3d ? H * 0.26 : H * 0.52, t, scale: 0.85 })
      } else {
        const partnerSide = sc.speaker === 'partner'
        const ax = partnerSide ? W * 0.7 : W * 0.3
        const toward = partnerSide ? -1 : 1 // hand reaches toward the centre
        const weapon = sc.action === 'beat'
        const handX = ax + toward * W * 0.11
        const handY = weapon ? H * 0.4 : H * 0.56
        const rot = weapon ? toward * (-0.6 + Math.sin(lt * 7) * 0.7) : undefined
        drawProp(ctx, sc.prop, { cx: handX, cy: handY, t, scale: 0.7, rot })
      }
    }

    // Name tag of who's speaking.
    const speakerName = sc.speaker === 'partner' ? partnerCfg.label
      : sc.speaker === 'both' ? `${mainCfg.label} & ${partnerCfg.label}` : mainCfg.label

    // Caption bar (optional).
    if (showCaptions && state.caption) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
      ctx.font = 'bold 22px sans-serif'
      const lines = wrapText(ctx, state.caption, W - 100)
      const lineH = 30
      const boxH = lines.length * lineH + 40
      const boxY = H - boxH - 16
      ctx.fillStyle = 'rgba(255,255,255,0.86)'
      roundRect(ctx, 36, boxY, W - 72, boxH, 16); ctx.fill()
      ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = mainCfg.accent
      ctx.fillText(speakerName, W / 2, boxY + 22)
      ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#5a4a6a'
      const startY = boxY + 50
      lines.forEach((ln, i) => ctx.fillText(ln, W / 2, startY + i * lineH))
    }

    // Scene-change flash transition.
    if (state.flashStart >= 0) {
      const a = 1 - Math.min(1, (t - state.flashStart) / 0.3)
      if (a > 0) { ctx.fillStyle = `rgba(255,255,255,${a * 0.7})`; ctx.fillRect(0, 0, W, H) }
    }

    rafId = requestAnimationFrame(draw)
  }
  draw()

  // 5. Play each scene's audio in order while updating the visual state.
  if (onStatus) onStatus('Recording video...')
  for (let i = 0; i < story.length; i++) {
    const scene = story[i]
    state.scene = scene
    state.caption = scene.narration
    state.sceneStart = (performance.now() - start) / 1000
    state.flashStart = state.sceneStart

    if (scene.buffers.length === 0) {
      await sleep(1500)
    } else {
      for (const buffer of scene.buffers) {
        await new Promise((resolve) => {
          const src = audioCtx.createBufferSource()
          src.buffer = buffer
          src.playbackRate.value = scene.pitch || 1
          src.connect(analyser); src.connect(dest); src.connect(audioCtx.destination)
          src.onended = resolve
          src.start()
        })
      }
    }
    await sleep(350) // small beat between scenes
  }

  // 6. Finish up.
  if (rafId) cancelAnimationFrame(rafId)
  recorder.stop()
  await stopped
  await audioCtx.close()
  if (scene3d) scene3d.dispose()
  domImgs.forEach((el) => { try { el.remove() } catch {} })

  return new Blob(recorded, { type: recorder.mimeType || 'video/webm' })
}
