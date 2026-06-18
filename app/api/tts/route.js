// Free, keyless text-to-speech proxy with per-character voices and emotional
// expression. We proxy server-side so the browser never hits CORS, and we send
// back an `X-TTS-Source` header so the client knows whether to apply a pitch
// tweak (only needed for the generic Google fallback). All the real work lives
// in app/lib/ttsServer.js (shared with the talking-head route).

import { synthChunk } from '../../lib/ttsServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { text, voice, emotion, rate, pitch, lang } = await request.json()
    if (!text || !text.trim()) {
      return Response.json({ message: 'No text provided.' }, { status: 400 })
    }

    const { audio, source } = await synthChunk(text, { voice, emotion, rate, pitch, lang })

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
