// Free, keyless text-to-speech proxy with per-character voices.
// Primary: Microsoft Edge "read aloud" neural TTS (no API key) — has real
// gendered Indian voices (en-IN-PrabhatNeural male, en-IN-NeerjaNeural female,
// hi-IN-* etc.). Fallback: Google Translate TTS (single generic voice).
// We proxy server-side so the browser never hits CORS, and we send back an
// `X-TTS-Source` header so the client knows whether to apply a pitch tweak.

import crypto from 'crypto'
import WebSocket from 'ws'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

function edgeTTS(text, voice) {
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
    const timer = setTimeout(() => { try { ws.terminate() } catch {} ; reject(new Error('edge timeout')) }, 8000)

    ws.on('open', () => {
      ws.send(
        `X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{` +
        `"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},` +
        `"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
      )
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voice}'>${escapeXml(text)}</voice></speak>`
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

export async function POST(request) {
  try {
    const { text, voice, lang } = await request.json()
    if (!text || !text.trim()) {
      return Response.json({ message: 'No text provided.' }, { status: 400 })
    }

    const safeText = text.slice(0, 500)
    const safeVoice = (voice || 'en-IN-NeerjaNeural').replace(/[^a-zA-Z-]/g, '') || 'en-IN-NeerjaNeural'
    const safeLang = (lang || 'en').replace(/[^a-zA-Z-]/g, '') || 'en'

    let audio = null
    let source = 'edge'
    try {
      const buf = await edgeTTS(safeText, safeVoice)
      // Sanity-check it's real MP3 (frame sync) so we never ship corrupt audio.
      if (buf && buf.length > 800 && (buf[0] === 0xff || buf.slice(0, 3).toString() === 'ID3')) {
        audio = buf
      }
    } catch {
      audio = null
    }

    if (!audio) {
      source = 'google'
      audio = await googleTTS(safeText, safeLang)
    }

    return new Response(new Uint8Array(audio), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-TTS-Source': source,
      },
    })
  } catch (error) {
    return Response.json(
      { message: 'Text-to-speech failed.', error: error.message },
      { status: 500 }
    )
  }
}
