// OPTIONAL paid path (beta): photoreal lip-sync of an uploaded photo.
// We synthesize the script to speech with our free Indian TTS, then hand the
// photo + audio to a talking-head model on Replicate (SadTalker by default) and
// return the finished MP4 URL. Requires REPLICATE_API_TOKEN and a Replicate
// account with billing enabled. Costs money per video.
//
// Env:
//   REPLICATE_API_TOKEN              (required)
//   REPLICATE_TALKINGHEAD_MODEL      owner/name        (default: cjwbw/sadtalker)
//   REPLICATE_TALKINGHEAD_VERSION    explicit version  (optional; skips lookup)

import { synthScript } from '../../lib/ttsServer'
import { getVoicePreset } from '../../lib/characters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Talking-head jobs are slow; give the request room to finish.
export const maxDuration = 300

const API = 'https://api.replicate.com/v1'
const DEFAULT_MODEL = process.env.REPLICATE_TALKINGHEAD_MODEL || 'cjwbw/sadtalker'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function latestVersion(token, model) {
  if (process.env.REPLICATE_TALKINGHEAD_VERSION) return process.env.REPLICATE_TALKINGHEAD_VERSION
  const res = await fetch(`${API}/models/${model}`, {
    headers: { Authorization: `Token ${token}` },
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.latest_version?.id) {
    throw new Error(json?.detail || `Could not resolve model "${model}" on Replicate.`)
  }
  return json.latest_version.id
}

function pickVideoUrl(output) {
  if (!output) return null
  if (typeof output === 'string') return output
  if (Array.isArray(output)) return output.find((x) => typeof x === 'string') || null
  if (typeof output === 'object') return output.video || output.output || null
  return null
}

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

    // 1. Speech (free Indian TTS), as a data URI Replicate can accept directly.
    const preset = getVoicePreset(voiceId)
    const lang = preset.voice.startsWith('hi-') ? 'hi' : 'en'
    const { audio } = await synthScript(text, {
      voice: preset.voice, rate: preset.rate, pitch: preset.pitch, lang,
    })
    const audioUri = `data:audio/mpeg;base64,${audio.toString('base64')}`

    // 2. Kick off the talking-head model on Replicate.
    const version = await latestVersion(token, DEFAULT_MODEL)
    const createRes = await fetch(`${API}/predictions`, {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version,
        input: {
          // SadTalker field names; harmless extras are ignored by other models.
          source_image: image,
          driven_audio: audioUri,
          preprocess: 'full',
          still: true,
          enhancer: 'gfpgan',
        },
      }),
    })
    const created = await createRes.json().catch(() => null)
    if (!createRes.ok) {
      return Response.json(
        { message: created?.detail || 'Replicate rejected the request.', error: created },
        { status: 502 }
      )
    }

    // 3. Poll until the prediction finishes (Render can run this long).
    let pred = created
    const getUrl = pred?.urls?.get
    for (let i = 0; i < 150 && (pred.status === 'starting' || pred.status === 'processing'); i++) {
      await sleep(2000)
      const r = await fetch(getUrl, { headers: { Authorization: `Token ${token}` } })
      pred = await r.json()
    }

    if (pred.status !== 'succeeded') {
      return Response.json(
        { message: `Talking-head job ${pred.status}: ${pred.error || 'no output'}` },
        { status: 502 }
      )
    }

    const videoUrl = pickVideoUrl(pred.output)
    if (!videoUrl) {
      return Response.json({ message: 'The model finished but returned no video.' }, { status: 502 })
    }
    return Response.json({ videoUrl }, { status: 200 })
  } catch (error) {
    return Response.json(
      { message: 'Premium lip-sync failed.', error: error.message },
      { status: 500 }
    )
  }
}
