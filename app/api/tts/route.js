// Free, keyless text-to-speech proxy.
// We proxy server-side so the browser never hits CORS, and we can swap the
// provider later without touching the client. Google Translate's TTS endpoint
// is free and requires no API key (≈200 char limit per request — the client
// splits long scripts into chunks).
export async function POST(request) {
  try {
    const { text, lang } = await request.json()

    if (!text || !text.trim()) {
      return Response.json({ message: 'No text provided.' }, { status: 400 })
    }

    const safeText = text.slice(0, 200)
    const safeLang = (lang || 'en').replace(/[^a-zA-Z-]/g, '') || 'en'

    const url =
      'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' +
      encodeURIComponent(safeLang) +
      '&q=' +
      encodeURIComponent(safeText)

    const upstream = await fetch(url, {
      headers: {
        // Google's TTS endpoint requires a browser-like User-Agent.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    })

    if (!upstream.ok) {
      return Response.json(
        { message: 'Text-to-speech service is unavailable right now.' },
        { status: 502 }
      )
    }

    const audio = await upstream.arrayBuffer()
    return new Response(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return Response.json(
      { message: 'Text-to-speech failed.', error: error.message },
      { status: 500 }
    )
  }
}
