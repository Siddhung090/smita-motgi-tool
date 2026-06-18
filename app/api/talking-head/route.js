// OPTIONAL paid path (beta): photoreal lip-sync of ONE uploaded photo speaking
// the whole script. (The multi-character "movie" lives in /api/movie.)
// Requires REPLICATE_API_TOKEN + billing. Shared logic is in app/lib/movie.js.

import { synthScript } from '../../lib/ttsServer'
import { getVoicePreset } from '../../lib/characters'
import { resolveVersion, predictClip } from '../../lib/movie'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEFAULT_MODEL = process.env.REPLICATE_TALKINGHEAD_MODEL || 'cjwbw/sadtalker'

export async function POST(request) {
  try {
    const { image, text, voiceId } = await request.json()
    const token = process.env.REPLICATE_API_TOKEN
    if (!token) {
      return Response.json(
        { message: 'Premium lip-sync is not configured. Add REPLICATE_API_TOKEN in your Render environment variables (replicate.com/account/api-tokens), then enable billing.' },
        { status: 503 }
      )
    }
    if (!image || !/^data:image\//.test(image)) {
      return Response.json({ message: 'Please upload a Normal photo of the character first.' }, { status: 400 })
    }
    if (!text || !text.trim()) {
      return Response.json({ message: 'No script text provided.' }, { status: 400 })
    }

    const preset = getVoicePreset(voiceId)
    const lang = preset.voice.startsWith('hi-') ? 'hi' : 'en'
    const { audio } = await synthScript(text, { voice: preset.voice, rate: preset.rate, pitch: preset.pitch, lang })
    const audioUri = `data:audio/mpeg;base64,${audio.toString('base64')}`

    const version = await resolveVersion(token, DEFAULT_MODEL)
    const videoUrl = await predictClip(token, version, image, audioUri)
    return Response.json({ videoUrl }, { status: 200 })
  } catch (error) {
    return Response.json({ message: 'Premium lip-sync failed.', error: error.message }, { status: 502 })
  }
}
