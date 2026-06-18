// Shared, keyless text-to-speech used by both /api/tts and /api/talking-head.
// Primary: Microsoft Edge "read aloud" neural TTS (no API key) — has real
// gendered Indian voices (en-IN-NeerjaNeural, en-IN-PrabhatNeural,
// hi-IN-SwaraNeural, hi-IN-MadhurNeural, en-IN-NeerjaExpressiveNeural).
// Fallback: Google Translate TTS (single generic voice).
//
// "Expression" is added with SSML <prosody> (rate / pitch / volume): the scene's
// emotion shifts the delivery (faster+higher = excited, slower+lower = sad,
// louder = angry, …). None of the free Indian voices expose named styles, so
// prosody is the portable way to make them sound emotional.

import crypto from 'crypto'
import WebSocket from 'ws'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
const TRUSTED = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const GEC_VERSION = '1-130.0.2849.68'

// Microsoft's anti-abuse token, derived from the current (5-min-rounded) time.
function secMsGec() {
  let ticks = Math.floor(Date.now() / 1000) + 11644473600
  ticks -= ticks % 300
  ticks *= 10000000
  return crypto.createHash('sha256').update(`${ticks}${TRUSTED}`).digest('hex').toUpperCase()
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// How each emotion shifts the delivery. Percentages are *added* to the voice
// preset's own base rate/pitch. `volume` is an absolute SSML volume keyword.
const EMOTION_PROSODY = {
  happy:     { rate: 8,  pitch: 8 },
  excited:   { rate: 14, pitch: 12, volume: 'loud' },
  love:      { rate: -4, pitch: 4 },
  sad:       { rate: -12, pitch: -10, volume: 'soft' },
  angry:     { rate: 6,  pitch: 3,  volume: 'loud' },
  surprised: { rate: 8,  pitch: 16 },
  sleepy:    { rate: -16, pitch: -6, volume: 'soft' },
  neutral:   { rate: 0,  pitch: 0 },
}

// "+12%" / "-6%" / 12 / undefined  ->  number (percent)
function pct(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const m = /(-?\d+(?:\.\d+)?)/.exec(String(v))
  return m ? parseFloat(m[1]) : 0
}

// Combine a voice preset's base prosody with the scene emotion into one
// SSML <prosody> attribute string. Returns '' when there is nothing to add.
export function prosodyAttrs({ rate, pitch, emotion } = {}) {
  const emo = EMOTION_PROSODY[emotion] || EMOTION_PROSODY.neutral
  const r = Math.round(pct(rate) + pct(emo.rate))
  const p = Math.round(pct(pitch) + pct(emo.pitch))
  const parts = []
  if (r) parts.push(`rate='${r > 0 ? '+' : ''}${r}%'`)
  if (p) parts.push(`pitch='${p > 0 ? '+' : ''}${p}%'`)
  if (emo.volume) parts.push(`volume='${emo.volume}'`)
  return parts.join(' ')
}

function buildSsml(text, voice, opts) {
  const attrs = prosodyAttrs(opts)
  const body = attrs ? `<prosody ${attrs}>${escapeXml(text)}</prosody>` : escapeXml(text)
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'>${body}</voice></speak>`
  )
}

function edgeTTS(text, voice, opts = {}) {
  return new Promise((resolve, reject) => {
    const connId = crypto.randomUUID().replace(/-/g, '')
    const url =
      `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
      `?TrustedClientToken=${TRUSTED}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${GEC_VERSION}&ConnectionId=${connId}`
    const ws = new WebSocket(url, {
      headers: {
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': UA,
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    const chunks = []
    const done = (fn, arg) => { clearTimeout(timer); try { ws.close() } catch {} ; fn(arg) }
    const timer = setTimeout(() => { try { ws.terminate() } catch {} ; reject(new Error('edge timeout')) }, 9000)

    ws.on('open', () => {
      ws.send(
        `X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{` +
        `"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},` +
        `"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
      )
      const ssml = buildSsml(text, voice, opts)
      ws.send(
        `X-RequestId:${connId}\r\nContent-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${new Date().toString()}Z\r\nPath:ssml\r\n\r\n${ssml}`
      )
    })

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
        const headerLen = buf.readUInt16BE(0)
        const header = buf.slice(2, 2 + headerLen).toString('utf8')
        if (header.includes('Path:audio')) chunks.push(buf.slice(2 + headerLen))
      } else if (data.toString().includes('Path:turn.end')) {
        chunks.length ? done(resolve, Buffer.concat(chunks)) : done(reject, new Error('edge no audio'))
      }
    })
    ws.on('error', (e) => done(reject, e))
    ws.on('close', () => { clearTimeout(timer); if (chunks.length) resolve(Buffer.concat(chunks)) })
  })
}

async function googleTTS(text, lang) {
  const url =
    'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' +
    encodeURIComponent(lang) + '&q=' + encodeURIComponent(text)
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error('google tts failed')
  return Buffer.from(await r.arrayBuffer())
}

// Synthesize one short text chunk. Returns { audio: Buffer, source: 'edge'|'google' }.
export async function synthChunk(text, { voice, emotion, rate, pitch, lang } = {}) {
  const safeText = (text || '').slice(0, 500)
  const safeVoice = (voice || 'en-IN-NeerjaNeural').replace(/[^a-zA-Z-]/g, '') || 'en-IN-NeerjaNeural'
  const safeLang = (lang || 'en').replace(/[^a-zA-Z-]/g, '') || 'en'

  try {
    const buf = await edgeTTS(safeText, safeVoice, { emotion, rate, pitch })
    // Sanity-check it's real MP3 (frame sync) so we never ship corrupt audio.
    if (buf && buf.length > 800 && (buf[0] === 0xff || buf.slice(0, 3).toString() === 'ID3')) {
      return { audio: buf, source: 'edge' }
    }
  } catch {
    /* fall through to Google */
  }
  return { audio: await googleTTS(safeText, safeLang), source: 'google' }
}

// Split long text into <=max-char chunks on sentence boundaries (Edge limit).
export function splitForTts(text, max = 480) {
  const sentences = (text || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g) || [text]
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    const s = (sentence || '').trim()
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
  return chunks.length ? chunks : [(text || '').trim()]
}

// Synthesize a whole (possibly long) script into one MP3 buffer by
// concatenating per-chunk MP3 frames. Used by the talking-head route.
export async function synthScript(text, opts = {}) {
  const parts = []
  let source = 'edge'
  for (const chunk of splitForTts(text)) {
    const { audio, source: s } = await synthChunk(chunk, opts)
    parts.push(audio)
    source = s
  }
  return { audio: Buffer.concat(parts), source }
}
