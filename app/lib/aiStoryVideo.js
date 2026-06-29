// Build a 30–60s "AI story" video: generate one short AI clip per line of the
// story (paid, fal.ai), add the TTS voices, and stitch everything into one
// recorded video. No ffmpeg — each clip's frames are drawn onto a canvas while
// its line's voice plays, and the canvas+audio is recorded (like the cartoon
// mode). Character look can vary between clips (an AI limitation).

import { getCharacter, getPartner } from './characters'

const PAIRS = { Dudu: 'Bubu', Bubu: 'Dudu', Momo: 'Zara', Zara: 'Momo' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function splitIntoChunks(text, max = 180) {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g) || [text]
  const chunks = []
  let current = ''
  for (const s of sentences) {
    const t = s.trim()
    if (!t) continue
    if (t.length > max) {
      if (current) { chunks.push(current.trim()); current = '' }
      for (let i = 0; i < t.length; i += max) chunks.push(t.slice(i, i + max))
      continue
    }
    if ((current + ' ' + t).trim().length > max) { chunks.push(current.trim()); current = t }
    else current = (current + ' ' + t).trim()
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

// Split the story into lines; honour "Name:" / "Name (tag):" to set the speaker.
function parseScenes(script, mainName) {
  const main = (mainName || 'Dudu').toLowerCase()
  const partner = (PAIRS[mainName] || 'Bubu').toLowerCase()
  const lines = script.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const arr = lines.length > 1 ? lines : (script.match(/[^.!?]+[.!?]*/g) || [script])
  const out = []
  let last = 'partner'
  for (const line of arr) {
    let speaker = null
    let text = line.trim()
    const m = line.match(/^([A-Za-z]+)\s*(?:\([^)]*\))?\s*:\s*(.*)$/)
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
    out.push({ narration: text, speaker })
  }
  return out
}

async function pollClip(job) {
  for (let i = 0; i < 180; i++) {
    const r = await fetch('/api/ai-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status', statusUrl: job.statusUrl, responseUrl: job.responseUrl }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.message || 'Clip status failed.')
    if (j.status === 'COMPLETED') {
      if (j.videoUrl) return j.videoUrl
      throw new Error('Clip finished but returned no video.')
    }
    await sleep(5000)
  }
  throw new Error('A clip timed out.')
}

function loadVideo(src) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'
    v.onloadeddata = () => resolve(v)
    v.onerror = () => reject(new Error('A clip failed to load.'))
    v.src = src
  })
}

export async function createAiStoryVideo({ script, scenes: inputScenes, style, aspect = '9:16', model, character = 'Dudu', targetSeconds = 30, voices, onStatus }) {
  if (typeof window === 'undefined') throw new Error('Must run in the browser.')
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx || typeof MediaRecorder === 'undefined') {
    throw new Error('Your browser does not support in-browser recording. Try Chrome or Edge.')
  }

  const mainCfg = getCharacter(character)
  const partnerCfg = getPartner(character)
  const partnerL = partnerCfg.label.toLowerCase()
  const mapSpeaker = (raw) => {
    const s = (raw || '').toLowerCase()
    if (s.includes('both')) return 'both'
    if (s.includes(partnerL)) return 'partner'
    return 'main'
  }

  // Prefer AI-written scenes (separate visual for the clip + spoken narration);
  // otherwise fall back to parsing the raw dialogue lines.
  let scenes
  if (Array.isArray(inputScenes) && inputScenes.length) {
    scenes = inputScenes
      .filter((s) => (s.narration || '').trim())
      .map((s) => ({
        narration: s.narration.trim(),
        visual: (s.visual || s.narration).trim(),
        speaker: mapSpeaker(s.speaker),
      }))
  } else {
    scenes = parseScenes(script, mainCfg.label)
    scenes.forEach((s) => { s.visual = s.narration })
  }
  if (!scenes.length) throw new Error('Add a story first.')
  // Length picker → number of ~5s clips (also caps cost/time).
  const maxScenes = Math.max(1, Math.min(12, Math.round((targetSeconds || 30) / 5)))
  if (scenes.length > maxScenes) scenes.splice(maxScenes)
  scenes.forEach((s) => {
    const cfg = s.speaker === 'partner' ? partnerCfg : mainCfg
    s.voice = (voices && voices[cfg.label]) || cfg.voice
  })

  // 1. Submit every clip to fal (they queue and render in parallel).
  for (let i = 0; i < scenes.length; i++) {
    if (onStatus) onStatus(`Submitting AI clip ${i + 1}/${scenes.length}…`)
    const prompt =
      `${style ? style.trim() + '. ' : ''}Scene: ${scenes[i].visual}. ` +
      `2D cartoon animation, consistent cute characters, soft pastel colors.`
    const r = await fetch('/api/ai-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit', prompt, aspectRatio: aspect, model: model || undefined }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.message || 'Clip submit failed (check model id / credits).')
    scenes[i].job = { statusUrl: j.statusUrl, responseUrl: j.responseUrl }
  }

  // 2. Wait for each clip, then load it (via our proxy) + make its voice.
  const audioCtx = new AudioCtx()
  for (let i = 0; i < scenes.length; i++) {
    if (onStatus) onStatus(`Rendering AI clip ${i + 1}/${scenes.length}… (a few minutes each)`)
    const url = await pollClip(scenes[i].job)
    scenes[i].video = await loadVideo(`/api/ai-video?url=${encodeURIComponent(url)}`)
    scenes[i].buffers = []
    for (const chunk of splitIntoChunks(scenes[i].narration)) {
      const tr = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunk, voice: scenes[i].voice }),
      })
      if (tr.ok) scenes[i].buffers.push(await audioCtx.decodeAudioData(await tr.arrayBuffer()))
    }
  }

  // 3. Stitch: draw each clip onto a canvas while its voice plays; record it all.
  const [W, H] = aspect === '16:9' ? [1280, 720] : aspect === '1:1' ? [800, 800] : [720, 1280]
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')

  const dest = audioCtx.createMediaStreamDestination()
  const stream = new MediaStream([
    ...canvas.captureStream(30).getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ])
  const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() })
  const recorded = []
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) recorded.push(e.data) }
  const stopped = new Promise((res) => { recorder.onstop = res })

  const state = { video: scenes[0].video }
  let raf = null
  const draw = () => {
    const v = state.video
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
    if (v && v.videoWidth) {
      const vr = v.videoWidth / v.videoHeight, cr = W / H
      let dw, dh
      if (vr > cr) { dh = H; dw = H * vr } else { dw = W; dh = W / vr }
      ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh)
    }
    raf = requestAnimationFrame(draw)
  }
  draw()
  recorder.start()
  if (onStatus) onStatus('Stitching the final video…')

  for (const s of scenes) {
    state.video = s.video
    try { s.video.currentTime = 0; await s.video.play() } catch {}
    if (s.buffers.length) {
      for (const b of s.buffers) {
        await new Promise((res) => {
          const src = audioCtx.createBufferSource()
          src.buffer = b
          src.connect(dest); src.connect(audioCtx.destination)
          src.onended = res
          src.start()
        })
      }
    } else {
      await sleep((s.video.duration || 4) * 1000)
    }
    try { s.video.pause() } catch {}
  }

  if (raf) cancelAnimationFrame(raf)
  recorder.stop()
  await stopped
  await audioCtx.close()
  return new Blob(recorded, { type: recorder.mimeType || 'video/webm' })
}
