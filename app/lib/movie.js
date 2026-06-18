// Server-side helpers for the PAID photoreal "movie" pipeline:
//   1. predictClip()  — turn one (photo + speech audio) into a lip-synced clip
//                        via a talking-head model on Replicate (SadTalker).
//   2. stitchToMp4()  — download those clips and concatenate them into ONE mp4
//                        with hard cuts between speakers (ffmpeg-static).
//
// Requires REPLICATE_API_TOKEN (+ billing). ffmpeg ships via ffmpeg-static, so
// it works on Render's Linux box and locally on Windows with no system install.

import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import ffmpegPath from 'ffmpeg-static'

const API = 'https://api.replicate.com/v1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- Replicate talking-head --------------------------------------------------

export async function resolveVersion(token, model) {
  if (process.env.REPLICATE_TALKINGHEAD_VERSION) return process.env.REPLICATE_TALKINGHEAD_VERSION
  const res = await fetch(`${API}/models/${model}`, { headers: { Authorization: `Token ${token}` } })
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

// One lip-synced clip from a still image + speech audio (both data URIs).
// Returns the finished clip's URL on Replicate's CDN.
export async function predictClip(token, version, imageUri, audioUri, onStatus) {
  const createRes = await fetch(`${API}/predictions`, {
    method: 'POST',
    headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version,
      input: {
        source_image: imageUri,
        driven_audio: audioUri,
        preprocess: 'full',
        still: true,
        enhancer: 'gfpgan',
      },
    }),
  })
  const created = await createRes.json().catch(() => null)
  if (!createRes.ok) throw new Error(created?.detail || 'Replicate rejected the request.')

  let pred = created
  const getUrl = pred?.urls?.get
  for (let i = 0; i < 150 && (pred.status === 'starting' || pred.status === 'processing'); i++) {
    await sleep(2000)
    if (onStatus && i % 5 === 0) onStatus()
    const r = await fetch(getUrl, { headers: { Authorization: `Token ${token}` } })
    pred = await r.json()
  }
  if (pred.status !== 'succeeded') {
    throw new Error(`talking-head job ${pred.status}: ${pred.error || 'no output'}`)
  }
  const url = pickVideoUrl(pred.output)
  if (!url) throw new Error('model finished but returned no video')
  return url
}

// --- ffmpeg stitching --------------------------------------------------------

function run(args) {
  return new Promise((resolve, reject) => {
    const ps = spawn(ffmpegPath, args)
    let err = ''
    ps.stderr.on('data', (d) => { err += d.toString() })
    ps.on('error', reject)
    ps.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg failed: ' + err.slice(-500)))))
  })
}

// Download clip URLs, normalise each to a common size/codec, then concatenate
// into one mp4. `size` is the square output (talking-head faces are square).
export async function stitchToMp4(clipUrls, { size = 512, fps = 25 } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'movie-'))
  try {
    const normed = []
    for (let i = 0; i < clipUrls.length; i++) {
      const res = await fetch(clipUrls[i])
      if (!res.ok) throw new Error(`could not download clip ${i + 1}`)
      const src = path.join(dir, `src_${i}.mp4`)
      await fs.writeFile(src, Buffer.from(await res.arrayBuffer()))
      const out = path.join(dir, `norm_${i}.mp4`)
      await run([
        '-y', '-i', src,
        '-vf', `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
        '-r', String(fps),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
        '-c:a', 'aac', '-ar', '44100', '-ac', '2',
        out,
      ])
      normed.push(out)
    }

    if (normed.length === 1) return await fs.readFile(normed[0])

    const listFile = path.join(dir, 'list.txt')
    await fs.writeFile(listFile, normed.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'))
    const final = path.join(dir, 'movie.mp4')
    await run(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', final])
    return await fs.readFile(final)
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
