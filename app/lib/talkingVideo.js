// Builds a downloadable "talking character" video entirely in the browser — no
// paid services. It fetches free TTS audio (via our /api/tts proxy), animates
// the character on a canvas in sync with the audio, and records the canvas +
// audio to a downloadable WebM with MediaRecorder.

import { getCharacter, drawBackground, drawCharacter } from './characters'

// Split a script into chunks that fit the free TTS length limit, breaking on
// sentence boundaries where possible.
function splitIntoChunks(text, max = 180) {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g) || [text]
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    const s = sentence.trim()
    if (!s) continue
    if (s.length > max) {
      // Sentence itself too long — hard-split it.
      if (current) {
        chunks.push(current.trim())
        current = ''
      }
      for (let i = 0; i < s.length; i += max) chunks.push(s.slice(i, i + max))
      continue
    }
    if ((current + ' ' + s).trim().length > max) {
      chunks.push(current.trim())
      current = s
    } else {
      current = (current + ' ' + s).trim()
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

function pickMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return 'video/webm'
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
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

export async function createTalkingVideo({ script, character, canvas, onStatus }) {
  const cfg = getCharacter(character)
  if (typeof window === 'undefined') throw new Error('Must run in the browser.')
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx || typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
    throw new Error('Your browser does not support in-browser video recording. Try Chrome or Edge.')
  }

  const chunks = splitIntoChunks(script)
  const audioCtx = new AudioCtx()

  // 1. Fetch + decode all audio chunks up front.
  const buffers = []
  for (let i = 0; i < chunks.length; i++) {
    if (onStatus) onStatus(`Generating voice ${i + 1}/${chunks.length}...`)
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chunks[i] }),
    })
    if (!res.ok) {
      const info = await res.json().catch(() => ({}))
      throw new Error(info.message || 'Voice generation failed.')
    }
    const arr = await res.arrayBuffer()
    buffers.push(await audioCtx.decodeAudioData(arr))
  }

  // 2. Wire up audio graph: each clip → analyser (for mouth) + speakers + recording dest.
  const dest = audioCtx.createMediaStreamDestination()
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 256
  const freq = new Uint8Array(analyser.frequencyBinCount)

  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height

  // 3. Combine canvas video + TTS audio into one stream and start recording.
  const canvasStream = canvas.captureStream(30)
  const mixed = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ])
  const recorder = new MediaRecorder(mixed, { mimeType: pickMimeType() })
  const recorded = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) recorded.push(e.data)
  }
  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve
  })
  recorder.start()

  // 4. Animation loop.
  let caption = ''
  let mouth = 0
  let rafId = null
  const start = performance.now()
  const draw = () => {
    const t = (performance.now() - start) / 1000

    // Smooth the audio level so the mouth glides instead of jittering.
    analyser.getByteFrequencyData(freq)
    const avg = freq.reduce((a, b) => a + b, 0) / freq.length
    mouth = mouth * 0.55 + (avg / 255) * 0.45

    // Soft pastel background, tinted toward the character's cheek colour.
    drawBackground(ctx, W, H, t, cfg.cheek + '55')

    // The animated character (head centred a little above middle).
    drawCharacter(ctx, cfg, { cx: W / 2, cy: H * 0.34, t, mouth, scale: 0.92 })

    // Caption with a soft rounded backdrop for readability.
    if (caption) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.font = 'bold 22px sans-serif'
      const lines = wrapText(ctx, caption, W - 100)
      const lineH = 30
      const boxH = lines.length * lineH + 16
      const boxY = H - boxH - 16
      ctx.fillStyle = 'rgba(255,255,255,0.82)'
      roundRect(ctx, 40, boxY, W - 80, boxH, 16)
      ctx.fill()
      ctx.fillStyle = '#5a4a6a'
      const startY = boxY + 30
      lines.forEach((ln, i) => ctx.fillText(ln, W / 2, startY + i * lineH))
    }

    rafId = requestAnimationFrame(draw)
  }
  draw()

  // 5. Play clips sequentially through the graph; record across all of them.
  if (onStatus) onStatus('Recording video...')
  await new Promise((resolve) => {
    let i = 0
    const playNext = () => {
      if (i >= buffers.length) {
        resolve()
        return
      }
      caption = chunks[i]
      const src = audioCtx.createBufferSource()
      src.buffer = buffers[i]
      src.connect(analyser)
      src.connect(dest)
      src.connect(audioCtx.destination)
      src.onended = () => {
        i++
        playNext()
      }
      src.start()
    }
    playNext()
  })

  // 6. Finish up.
  if (rafId) cancelAnimationFrame(rafId)
  recorder.stop()
  await stopped
  await audioCtx.close()

  return new Blob(recorded, { type: recorder.mimeType || 'video/webm' })
}
