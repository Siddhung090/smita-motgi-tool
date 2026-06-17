// Builds a downloadable multi-scene "cartoon story" video entirely in the
// browser — no paid services. It fetches free TTS audio (via our /api/tts
// proxy), animates two characters (the duo) across scenes with changing
// backgrounds, emotions and props in sync with the audio, and records the
// canvas + audio to a downloadable WebM with MediaRecorder.

import {
  getCharacter, getPartner, drawSceneBackground, drawCharacter, drawProp,
  EMOTIONS, SETTINGS, ACTIONS,
} from './characters'

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
  if (has(/gift|present|surprise box/)) prop = 'gift'
  else if (has(/flower|rose|gulab/)) prop = 'flower'
  else if (has(/balloon/)) prop = 'balloon'
  else if (has(/samosa|cake|food|\beat\b|khana|biscuit|sweets|laddu/)) prop = 'food'
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
    const m = line.match(/^([A-Za-z]+)\s*:\s*(.*)$/)
    if (m) {
      const nm = m[1].toLowerCase()
      if (nm === main) { speaker = 'main'; text = m[2] }
      else if (nm === partner) { speaker = 'partner'; text = m[2] }
      else if (nm === 'both') { speaker = 'both'; text = m[2] }
    }
    text = text.trim()
    if (!text) continue
    if (!speaker) speaker = last === 'main' ? 'partner' : 'main'
    if (speaker !== 'both') last = speaker
    out.push({ narration: text, speaker, ...detectScene(text) })
  }
  return out.length ? out : [{ narration: script.trim(), speaker: 'main', ...detectScene(script) }]
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function createTalkingVideo({ script, scenes, character, canvas, onStatus, mode }) {
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
    const who = scene.speaker === 'partner' ? partnerCfg : mainCfg
    scene.voice = who.voice
    let src = 'edge'
    for (const chunk of splitIntoChunks(scene.narration)) {
      if (onStatus) onStatus(`Generating voice ${++done}/${total}...`)
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunk, voice: scene.voice }),
      })
      if (!res.ok) {
        const info = await res.json().catch(() => ({}))
        throw new Error(info.message || 'Voice generation failed.')
      }
      src = res.headers.get('X-TTS-Source') || src
      const arr = await res.arrayBuffer()
      scene.buffers.push(await audioCtx.decodeAudioData(arr))
    }
    // Good Edge voices keep pitch subtle; the Google fallback uses a stronger
    // pitch so the two characters still sound clearly different.
    scene.pitch = src === 'google' ? (who.fallbackPitch || 1) : (who.pitch || 1)
  }

  // 2. Audio graph: clip → analyser (mouth) + speakers + recording dest.
  const dest = audioCtx.createMediaStreamDestination()
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 256
  const freq = new Uint8Array(analyser.frequencyBinCount)

  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height

  // Optional 3D stage. If it fails to initialise we silently fall back to 2D.
  let scene3d = null
  if (mode === '3d') {
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
      // Two flat characters; the speaker performs the action, the other reacts.
      drawCharacter(ctx, mainCfg, {
        cx: W * 0.32, cy: H * 0.4, t, mouth: mainSpeaks ? speakMouth : 0, scale: 0.62,
        emotion: sc.emotion, action: sc.action, lt, role: mainSpeaks ? 'actor' : 'reactor', facing: 1,
      })
      drawCharacter(ctx, partnerCfg, {
        cx: W * 0.68, cy: H * 0.4, t: t + 1.3, mouth: partnerSpeaks ? speakMouth : 0, scale: 0.62,
        emotion: sc.emotion, action: sc.action, lt, role: partnerSpeaks ? 'actor' : 'reactor', facing: -1,
      })
    }

    if (sc.prop && sc.prop !== 'none') drawProp(ctx, sc.prop, { cx: W * 0.5, cy: H * 0.26, t, scale: 0.9 })

    // Name tag of who's speaking.
    const speakerName = sc.speaker === 'partner' ? partnerCfg.label
      : sc.speaker === 'both' ? `${mainCfg.label} & ${partnerCfg.label}` : mainCfg.label

    // Caption bar.
    if (state.caption) {
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

  return new Blob(recorded, { type: recorder.mimeType || 'video/webm' })
}
