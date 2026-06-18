// PAID photoreal "movie": each line of dialogue becomes a lip-synced clip of the
// right character (their photo + their voice), and the clips are stitched into
// ONE mp4 with cuts between speakers — a talking-heads conversation.
//
// Body: { lines: [{ image: dataURL, text, voiceId, emotion }] }
// Returns: video/mp4 (the finished movie).
//
// Requires REPLICATE_API_TOKEN + billing. Slow and costs money per line, so we
// cap the number of lines to keep runaway jobs (and bills) in check.

import { synthScript } from '../../lib/ttsServer'
import { getVoicePreset } from '../../lib/characters'
import { resolveVersion, predictClip, stitchToMp4 } from '../../lib/movie'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEFAULT_MODEL = process.env.REPLICATE_TALKINGHEAD_MODEL || 'cjwbw/sadtalker'
const MAX_LINES = Number(process.env.MOVIE_MAX_LINES || 10)

export async function POST(request) {
  try {
    const token = process.env.REPLICATE_API_TOKEN
    if (!token) {
      return Response.json(
        { message: 'Premium movie is not configured. Add REPLICATE_API_TOKEN in your Render environment variables (replicate.com/account/api-tokens), then enable billing.' },
        { status: 503 }
      )
    }

    const { lines } = await request.json()
    if (!Array.isArray(lines) || !lines.length) {
      return Response.json({ message: 'No dialogue lines to render.' }, { status: 400 })
    }
    for (const ln of lines) {
      if (!ln?.image || !/^data:image\//.test(ln.image)) {
        return Response.json(
          { message: 'Every speaking character needs an uploaded photo. Upload a Normal photo for each character in the conversation.' },
          { status: 400 }
        )
      }
    }

    const used = lines.slice(0, MAX_LINES)
    const version = await resolveVersion(token, DEFAULT_MODEL)

    // One lip-synced clip per line (sequential — keeps memory + rate limits sane).
    const clipUrls = []
    for (const ln of used) {
      const preset = getVoicePreset(ln.voiceId)
      const lang = preset.voice.startsWith('hi-') ? 'hi' : 'en'
      const { audio } = await synthScript(ln.text, {
        voice: preset.voice, rate: preset.rate, pitch: preset.pitch, emotion: ln.emotion, lang,
      })
      const audioUri = `data:audio/mpeg;base64,${audio.toString('base64')}`
      clipUrls.push(await predictClip(token, version, ln.image, audioUri))
    }

    const mp4 = await stitchToMp4(clipUrls)
    return new Response(new Uint8Array(mp4), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-store',
        'X-Movie-Lines': String(used.length),
        'X-Movie-Truncated': lines.length > used.length ? '1' : '0',
      },
    })
  } catch (error) {
    return Response.json({ message: 'Premium movie failed.', error: error.message }, { status: 502 })
  }
}
