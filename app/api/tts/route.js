// Free, keyless text-to-speech proxy with per-character voices.
// Primary: StreamElements' TTS (Amazon Polly voices, no API key) — gives us
// distinct male/female/young/Indian voices (e.g. Justin, Ivy, Raveena, Aditi).
// Fallback: Google Translate TTS (single generic voice) if StreamElements is
// unavailable. We proxy server-side so the browser never hits CORS.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

async function streamElements(text, voice) {
  const url =
    'https://api.streamelements.com/kappa/v2/speech?voice=' +
    encodeURIComponent(voice) +
    '&text=' +
    encodeURIComponent(text)
  return fetch(url, { headers: { 'User-Agent': UA } })
}

async function googleTTS(text, lang) {
  const url =
    'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' +
    encodeURIComponent(lang) +
    '&q=' +
    encodeURIComponent(text)
  return fetch(url, { headers: { 'User-Agent': UA } })
}

export async function POST(request) {
  try {
    const { text, voice, lang } = await request.json()

    if (!text || !text.trim()) {
      return Response.json({ message: 'No text provided.' }, { status: 400 })
    }

    const safeText = text.slice(0, 290)
    const safeVoice = (voice || 'Brian').replace(/[^a-zA-Z]/g, '') || 'Brian'
    const safeLang = (lang || 'en').replace(/[^a-zA-Z-]/g, '') || 'en'

    // Try the good voices first, then gracefully fall back.
    let upstream
    try {
      upstream = await streamElements(safeText, safeVoice)
    } catch {
      upstream = null
    }
    if (!upstream || !upstream.ok) {
      upstream = await googleTTS(safeText, safeLang)
    }

    if (!upstream.ok) {
      return Response.json(
        { message: 'Text-to-speech service is unavailable right now.' },
        { status: 502 }
      )
    }

    const audio = await upstream.arrayBuffer()
    return new Response(audio, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return Response.json(
      { message: 'Text-to-speech failed.', error: error.message },
      { status: 500 }
    )
  }
}
