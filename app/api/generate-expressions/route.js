// Auto-generate expression (and optional outfit) variations of a character from
// one reference image, using Google's Gemini image model (good at keeping the
// SAME character). Requires GEMINI_API_KEY. Each image costs a few cents.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'

// Which expression images to create (the original upload stays as "Normal").
const EXPRESSIONS = [
  { slot: 'talk', desc: 'mouth open as if talking and speaking' },
  { slot: 'happy', desc: 'a big cheerful happy smile' },
  { slot: 'sad', desc: 'a sad, unhappy expression' },
  { slot: 'cry', desc: 'crying with visible tears' },
  { slot: 'angry', desc: 'an angry, grumpy expression' },
  { slot: 'surprised', desc: 'a shocked, surprised expression with wide eyes' },
  { slot: 'love', desc: 'a loving expression with blushing cheeks and heart eyes' },
]

function parseDataUrl(u) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(u || '')
  return m ? { mime: m[1], data: m[2] } : null
}

async function genOne(key, refMime, refData, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: refMime, data: refData } },
          { text: prompt },
        ],
      }],
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`)
  const parts = json?.candidates?.[0]?.content?.parts || []
  for (const p of parts) {
    const inl = p.inlineData || p.inline_data
    if (inl?.data) return `data:${inl.mimeType || inl.mime_type || 'image/png'};base64,${inl.data}`
  }
  throw new Error('No image returned')
}

export async function POST(request) {
  try {
    const { image, outfit } = await request.json()
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    if (!key) {
      return Response.json(
        { message: 'Image AI is not configured. Add GEMINI_API_KEY in your Render environment variables (get a key at aistudio.google.com).' },
        { status: 503 }
      )
    }
    const ref = parseDataUrl(image)
    if (!ref) return Response.json({ message: 'Please upload a Normal picture first.' }, { status: 400 })

    const outfitClause = outfit && outfit.trim()
      ? `Dress the character in: ${outfit.trim()}.`
      : 'Keep the same outfit and clothing.'

    const results = {}
    const errors = []
    for (const e of EXPRESSIONS) {
      const prompt =
        `This is a cute cartoon character. Generate the SAME character with the exact same identity, ` +
        `art style, line work, colors and body shape. ${outfitClause} Change ONLY the facial expression ` +
        `to show ${e.desc}. Centered, full body, facing forward, on a plain solid white background.`
      try {
        results[e.slot] = await genOne(key, ref.mime, ref.data, prompt)
      } catch (err) {
        errors.push(`${e.slot}: ${err.message}`)
      }
    }

    if (!Object.keys(results).length) {
      return Response.json({ message: 'Image generation failed.', errors }, { status: 502 })
    }
    return Response.json({ results, errors }, { status: 200 })
  } catch (error) {
    return Response.json({ message: 'Failed to generate expressions.', error: error.message }, { status: 500 })
  }
}
