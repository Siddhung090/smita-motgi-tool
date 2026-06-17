// Builds a downloadable "talking character" video entirely in the browser — no
// paid services. It fetches free TTS audio (via our /api/tts proxy), animates
// the character on a canvas in sync with the audio, and records the canvas +
// audio to a downloadable WebM with MediaRecorder.

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

export async function createTalkingVideo({ script, emoji, color, canvas, onStatus }) {
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
  const draw = () => {
    analyser.getByteFrequencyData(freq)
    const avg = freq.reduce((a, b) => a + b, 0) / freq.length
    mouth = avg / 255

    const grad = ctx.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, '#667eea')
    grad.addColorStop(1, '#764ba2')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // Character circle
    const cx = W / 2
    const cy = H / 2 - 30
    const r = 90
    ctx.beginPath()
    ctx.arc(cx, cy, r + mouth * 12, 0, Math.PI * 2)
    ctx.fillStyle = (color || '#FF6B6B') + '33'
    ctx.fill()
    ctx.lineWidth = 4
    ctx.strokeStyle = color || '#FF6B6B'
    ctx.stroke()

    // Emoji face (bobs slightly while speaking)
    ctx.font = '90px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji || '🎭', cx, cy - mouth * 6)

    // Mouth (grows with volume)
    ctx.beginPath()
    ctx.ellipse(cx, cy + 55, 22, 8 + mouth * 26, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#2d3748'
    ctx.fill()

    // Caption
    if (caption) {
      ctx.font = '22px sans-serif'
      ctx.fillStyle = 'white'
      const lines = wrapText(ctx, caption, W - 80)
      const startY = H - 30 - (lines.length - 1) * 28
      lines.forEach((ln, i) => ctx.fillText(ln, cx, startY + i * 28))
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
