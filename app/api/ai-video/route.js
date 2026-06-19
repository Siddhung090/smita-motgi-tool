// Real text-to-video via fal.ai (paid). Video generation takes minutes, so we
// use fal's queue: "submit" enqueues the job and returns status/response URLs;
// "status" is polled by the client until the video is ready. Requires FAL_KEY.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Any fal.ai text-to-video model id works; override per request or via env.
// Find ids at https://fal.ai/models (e.g. fal-ai/kling-video/..., fal-ai/wan/...).
const DEFAULT_MODEL = process.env.FAL_VIDEO_MODEL || 'fal-ai/kling-video/v2/master/text-to-video'

const asText = (v) => (typeof v === 'string' ? v : v ? JSON.stringify(v) : '')

export async function POST(request) {
  try {
    const body = await request.json()
    const key = process.env.FAL_KEY || process.env.FAL_API_KEY
    if (!key) {
      return Response.json(
        { message: 'AI video is not configured. Add FAL_KEY in your Render environment variables (get it at fal.ai → Dashboard → Keys, and add credits).' },
        { status: 503 }
      )
    }
    const auth = { Authorization: `Key ${key}` }

    // --- poll an in-flight job ---
    if (body.action === 'status') {
      const sres = await fetch(body.statusUrl, { headers: auth })
      const sjson = await sres.json().catch(() => ({}))
      if (!sres.ok) return Response.json({ message: asText(sjson.detail) || `Status HTTP ${sres.status}` }, { status: 502 })
      if (sjson.status !== 'COMPLETED') {
        return Response.json({ status: sjson.status || 'IN_PROGRESS' }, { status: 200 })
      }
      const rres = await fetch(body.responseUrl, { headers: auth })
      const rjson = await rres.json().catch(() => ({}))
      const videoUrl =
        rjson?.video?.url || rjson?.videos?.[0]?.url ||
        rjson?.output?.video?.url || rjson?.output?.url || rjson?.url
      if (!videoUrl) return Response.json({ status: 'COMPLETED', message: 'No video URL in result.' }, { status: 502 })
      return Response.json({ status: 'COMPLETED', videoUrl }, { status: 200 })
    }

    // --- submit a new job ---
    if (!body.prompt || !body.prompt.trim()) {
      return Response.json({ message: 'Please write a prompt.' }, { status: 400 })
    }
    const model = (body.model || DEFAULT_MODEL).trim()
    const input = { prompt: body.prompt.trim() }
    if (body.aspectRatio) input.aspect_ratio = body.aspectRatio
    if (body.duration) input.duration = body.duration
    if (body.imageUrl) input.image_url = body.imageUrl // for image-to-video models

    const res = await fetch(`https://queue.fal.run/${model}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return Response.json(
        { message: asText(json.detail) || json.message || `Submit failed (HTTP ${res.status}). Check the model id.` },
        { status: 502 }
      )
    }
    return Response.json(
      { requestId: json.request_id, statusUrl: json.status_url, responseUrl: json.response_url, model },
      { status: 200 }
    )
  } catch (e) {
    return Response.json({ message: 'AI video failed.', error: e.message }, { status: 500 })
  }
}
