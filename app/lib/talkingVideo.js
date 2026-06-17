// Builds a downloadable multi-scene "cartoon story" video entirely in the
// browser — no paid services. It fetches free TTS audio (via our /api/tts
// proxy), animates two characters (the duo) across scenes with changing
// backgrounds, emotions and props in sync with the audio, and records the
// canvas + audio to a downloadable WebM with MediaRecorder.

import {
  getCharacter, getPartner, drawSceneBackground, drawCharacter, drawProp,
  EMOTIONS, SETTINGS,
} from './characters'

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
      .map((s, i) => ({
        narration: s.narration.trim(),
        speaker: speakerSide(s.speaker),
        emotion: clean(s.emotion, EMOTIONS, 'happy'),
        setting: clean(s.setting, SETTINGS, 'plain'),
        prop: s.prop || 'none',
      }))
  }

  // No AI scenes — turn plain text into a little story: one scene per sentence,
  // cycling settings/emotions and alternating who speaks so it feels animated.
  const settingsCycle = ['plain', 'park', 'cafe', 'bedroom', 'night', 'beach']
  const emotionCycle = ['happy', 'love', 'excited', 'surprised', 'happy', 'love']
  const parts = splitIntoChunks(script, 120)
  return parts.map((narration, i) => ({
    narration,
    speaker: i % 2 === 0 ? 'main' : 'partner',
    emotion: emotionCycle[i % emotionCycle.length],
    setting: settingsCycle[i % settingsCycle.length],
    prop: i % 3 === 0 ? 'heart' : 'none',
  }))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function createTalkingVideo({ script, scenes, character, canvas, onStatus }) {
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
    for (const chunk of splitIntoChunks(scene.narration)) {
      if (onStatus) onStatus(`Generating voice ${++done}/${total}...`)
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunk }),
      })
      if (!res.ok) {
        const info = await res.json().catch(() => ({}))
        throw new Error(info.message || 'Voice generation failed.')
      }
      const arr = await res.arrayBuffer()
      scene.buffers.push(await audioCtx.decodeAudioData(arr))
    }
  }

  // 2. Audio graph: clip → analyser (mouth) + speakers + recording dest.
  const dest = audioCtx.createMediaStreamDestination()
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 256
  const freq = new Uint8Array(analyser.frequencyBinCount)

  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height

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
  const state = { scene: story[0], caption: '', mouth: 0, flashStart: -1 }
  let rafId = null
  const start = performance.now()

  const draw = () => {
    const t = (performance.now() - start) / 1000
    const sc = state.scene

    analyser.getByteFrequencyData(freq)
    const avg = freq.reduce((a, b) => a + b, 0) / freq.length
    state.mouth = state.mouth * 0.55 + (avg / 255) * 0.45

    drawSceneBackground(ctx, W, H, t, sc.setting, mainCfg.cheek + '55')

    const speakMouth = state.mouth
    const mainMouth = sc.speaker === 'main' || sc.speaker === 'both' ? speakMouth : 0
    const partnerMouth = sc.speaker === 'partner' || sc.speaker === 'both' ? speakMouth : 0

    // Two characters side by side; the listener shows the same mood.
    drawCharacter(ctx, mainCfg, { cx: W * 0.32, cy: H * 0.4, t, mouth: mainMouth, scale: 0.62, emotion: sc.emotion })
    drawCharacter(ctx, partnerCfg, { cx: W * 0.68, cy: H * 0.4, t: t + 1.3, mouth: partnerMouth, scale: 0.62, emotion: sc.emotion })

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
    state.flashStart = (performance.now() - start) / 1000

    if (scene.buffers.length === 0) {
      await sleep(1500)
    } else {
      for (const buffer of scene.buffers) {
        await new Promise((resolve) => {
          const src = audioCtx.createBufferSource()
          src.buffer = buffer
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

  return new Blob(recorded, { type: recorder.mimeType || 'video/webm' })
}
