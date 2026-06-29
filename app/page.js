'use client'

import { useState, useRef, useEffect } from 'react'
import styles from './page.module.css'
import { createTalkingVideo, planConversation } from './lib/talkingVideo'
import { CHARACTERS, VOICES, getCharacter, getPartner, drawBackground, drawCharacter } from './lib/characters'

// Upload slots per character: a normal image plus optional expression/talking
// images. The video shows the right one per scene.
const ART_SLOTS = [
  { key: 'base', label: 'Normal' },
  { key: 'talk', label: 'Talking' },
  { key: 'happy', label: 'Happy' },
  { key: 'sad', label: 'Sad' },
  { key: 'cry', label: 'Cry' },
  { key: 'angry', label: 'Angry' },
  { key: 'surprised', label: 'Wow' },
  { key: 'love', label: 'Love' },
]

// Flood-fill from the edges to make the background transparent (keeps the
// character's interior intact), then crop to the character. Returns a canvas.
function processImage(canvas, removeBg) {
  const ctx = canvas.getContext('2d')
  const w = canvas.width, h = canvas.height
  const image = ctx.getImageData(0, 0, w, h)
  const d = image.data
  if (removeBg) {
    // Sample all four corners so we can clear white, cream, blue… backgrounds.
    const corner = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]] }
    const refs = [corner(0, 0), corner(w - 1, 0), corner(0, h - 1), corner(w - 1, h - 1)]
    const tol = 60
    const close = (i) => refs.some((r) => Math.abs(d[i] - r[0]) < tol && Math.abs(d[i + 1] - r[1]) < tol && Math.abs(d[i + 2] - r[2]) < tol)
    const visited = new Uint8Array(w * h)
    const stack = []
    const seed = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return
      const p = y * w + x
      if (visited[p]) return
      visited[p] = 1
      if (close(p * 4)) stack.push(p)
    }
    for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1) }
    for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y) }
    while (stack.length) {
      const p = stack.pop()
      d[p * 4 + 3] = 0
      const x = p % w, y = (p / w) | 0
      seed(x + 1, y); seed(x - 1, y); seed(x, y + 1); seed(x, y - 1)
    }
    ctx.putImageData(image, 0, 0)
  }
  let minX = w, minY = h, maxX = 0, maxY = 0, found = false
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 12) { found = true; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
  }
  if (!found || (minX === 0 && minY === 0 && maxX === w - 1 && maxY === h - 1)) return canvas
  const cw = maxX - minX + 1, ch = maxY - minY + 1
  const out = document.createElement('canvas')
  out.width = cw; out.height = ch
  out.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch)
  return out
}

// Read an image file, scale it down, optionally remove its background, and
// return a compact (webp) data URL.
function fileToArtDataURL(file, removeBg, max = 512) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(img.width * scale))
        c.height = Math.max(1, Math.round(img.height * scale))
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        let out = c
        try { out = processImage(c, removeBg) } catch {}
        resolve(out.toDataURL('image/webp', 0.9))
      }
      img.onerror = () => resolve(reader.result)
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// Load a data URL, scale + remove background + crop, return a compact webp.
function dataUrlToProcessed(url, removeBg) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const max = 512
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(img.width * scale))
      c.height = Math.max(1, Math.round(img.height * scale))
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      let out = c
      try { out = processImage(c, removeBg) } catch {}
      resolve(out.toDataURL('image/webp', 0.9))
    }
    img.onerror = () => resolve(url)
    img.src = url
  })
}

// A tiny self-animating canvas that shows a character idling (blinking, bobbing).
// `speaking` makes the mouth move so the selected character looks "live".
function CharacterPreview({ name, speaking }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const cfg = getCharacter(name)
    const start = performance.now()
    let raf

    const loop = () => {
      const t = (performance.now() - start) / 1000
      const mouth = speaking ? 0.4 + Math.sin(t * 10) * 0.35 : 0
      drawBackground(ctx, canvas.width, canvas.height, t, cfg.cheek + '55')
      drawCharacter(ctx, cfg, {
        cx: canvas.width / 2,
        cy: canvas.height * 0.46,
        t,
        mouth: Math.max(0, mouth),
        scale: 0.5,
      })
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [name, speaking])

  return <canvas ref={ref} width={140} height={130} className={styles.previewCanvas} />
}

export default function Home() {
  const canvasRef = useRef(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [textContent, setTextContent] = useState('')
  const [characterName, setCharacterName] = useState('Dudu')
  const [videoTitle, setVideoTitle] = useState('')
  const [videoLink, setVideoLink] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [videoGenerated, setVideoGenerated] = useState(false)
  const [videos, setVideos] = useState([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [use3D, setUse3D] = useState(false)
  const [showSubtitles, setShowSubtitles] = useState(false)
  const [premiumLipSync, setPremiumLipSync] = useState(false)
  const [artwork, setArtwork] = useState({})
  const [voices, setVoices] = useState({})
  const [autoAI, setAutoAI] = useState(true)
  const [removeBg, setRemoveBg] = useState(true)
  const [genOutfit, setGenOutfit] = useState('')
  const [genBusy, setGenBusy] = useState('')
  const [genMsg, setGenMsg] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiAspect, setAiAspect] = useState('9:16')
  const [aiModel, setAiModel] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiStatus, setAiStatus] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [analysisError, setAnalysisError] = useState('')

  const characters = Object.keys(CHARACTERS).map((name) => ({
    name,
    ...CHARACTERS[name],
  }))

  // Load/save uploaded artwork + chosen voices so they survive page reloads.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bubudoodu_artwork')
      if (saved) setArtwork(JSON.parse(saved))
      const savedV = localStorage.getItem('bubudoodu_voices')
      if (savedV) setVoices(JSON.parse(savedV))
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('bubudoodu_artwork', JSON.stringify(artwork))
    } catch {}
  }, [artwork])

  useEffect(() => {
    try {
      localStorage.setItem('bubudoodu_voices', JSON.stringify(voices))
    } catch {}
  }, [voices])

  const handleArt = async (name, slot, file) => {
    if (!file) return
    // Keep GIFs as-is so they stay animated; process static images (scale +
    // background removal + crop) into a compact still.
    const isGif = file.type === 'image/gif'
    const url = isGif
      ? await new Promise((res) => {
          const r = new FileReader()
          r.onload = () => res(r.result)
          r.readAsDataURL(file)
        })
      : await fileToArtDataURL(file, removeBg)
    setArtwork((prev) => ({ ...prev, [name]: { ...(prev[name] || {}), [slot]: url } }))

    // Automatic character creation: when a "Normal" still photo is uploaded and
    // auto-AI is on, immediately generate all expressions from that one image so
    // the character is ready to animate with no extra clicks. (Skipped for GIFs,
    // which already carry their own animation.)
    if (slot === 'base' && autoAI && !isGif) {
      generateExpressions(name, url, true)
    }
  }

  const clearArt = (name) => {
    setArtwork((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  // Paid AI: from the "Normal" picture, auto-create expression variations.
  // `baseOverride` lets us run right after an upload, before React state settles.
  // `auto` softens messaging when it was triggered automatically (e.g. no key).
  const generateExpressions = async (name, baseOverride, auto = false) => {
    const base = baseOverride || artwork[name]?.base
    if (!base) {
      setGenMsg(`Upload a "Normal" picture for ${name} first.`)
      return
    }
    setGenBusy(name)
    setGenMsg(`✨ Auto-creating expressions for ${name}… (takes ~30s, costs a few cents)`)
    try {
      const res = await fetch('/api/generate-expressions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base, outfit: genOutfit }),
      })
      const data = await res.json()
      if (!res.ok) {
        // No API key (503): in auto mode this isn't an error — the character
        // still animates with the free expression cues.
        if (auto && res.status === 503) {
          setGenMsg(`Uploaded ${name}! It will animate with free auto-expressions. (Add GEMINI_API_KEY on Render to auto-paint real AI expressions.)`)
        } else {
          setGenMsg(data.message || 'Generation failed.')
        }
        setGenBusy('')
        return
      }
      const processed = {}
      for (const slot of Object.keys(data.results || {})) {
        processed[slot] = await dataUrlToProcessed(data.results[slot], true)
      }
      setArtwork((prev) => ({ ...prev, [name]: { ...(prev[name] || {}), ...processed } }))
      const failed = data.errors?.length ? ` (${data.errors.length} failed)` : ''
      setGenMsg(`✅ Generated ${Object.keys(processed).length} expressions for ${name}!${failed}`)
    } catch (e) {
      setGenMsg('Generation error: ' + e.message)
    }
    setGenBusy('')
  }

  const handleAnalyzeStory = async () => {
    if (!textContent.trim()) {
      setAnalysisError('Please write some story content first!')
      return
    }

    setIsAnalyzing(true)
    setAnalysisError('')

    try {
      const response = await fetch('/api/analyze-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textContent,
          character: characterName,
          videoLink: videoLink,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setAnalysis(data.analysis)
        if (data.analysis.suggestedTitle && !videoTitle.trim()) {
          setVideoTitle(data.analysis.suggestedTitle)
        }
      } else {
        setAnalysisError(data.message || 'Analysis failed.')
      }
    } catch (error) {
      setAnalysisError('Failed to analyze story: ' + error.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Premium (paid) path: a photoreal "movie" — each line of dialogue is lip-synced
  // on the speaking character's own photo, then the clips are stitched into one
  // MP4 with cuts between speakers (via /api/movie).
  const generateMovie = async (script) => {
    // Work out who speaks each line, then attach each character's photo + voice.
    const plan = planConversation({ scenes: analysis?.scenes, script, character: characterName })
    if (!plan.length) {
      alert('No dialogue to film. Add a story (tip: write lines like "Name: dialogue").')
      return
    }

    // Every speaking character must have a still photo uploaded.
    const speakers = [...new Set(plan.map((l) => l.name))]
    const missing = speakers.filter((n) => {
      const b = artwork[n]?.base
      return !b || b.startsWith('data:image/gif')
    })
    if (missing.length) {
      alert(
        `Premium movie needs a still "Normal" photo for each character who talks.\n\nMissing photo for: ${missing.join(', ')}.\n\n` +
        `Tip: ${characterName} talks with ${getPartner(characterName).label} — upload a photo for both in the artwork section.`
      )
      return
    }

    const lines = plan.map((l) => ({
      image: artwork[l.name].base,
      text: l.narration,
      voiceId: voices[l.name] || getCharacter(l.name).voiceId,
      emotion: l.emotion,
    }))

    setIsGenerating(true)
    setStatusMessage(`Filming ${lines.length} line(s) on a paid service… this can take a few minutes per line. Please keep this tab open.`)
    try {
      const res = await fetch('/api/movie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Movie generation failed.')
      }
      const truncated = res.headers.get('X-Movie-Truncated') === '1'
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setVideos((prev) => [
        {
          id: Date.now(),
          title: videoTitle,
          character: speakers.join(' & '),
          date: new Date().toLocaleDateString(),
          url,
          mp4: true,
        },
        ...prev,
      ])
      setVideoGenerated(true)
      setTimeout(() => setVideoGenerated(false), 3000)
      if (truncated) {
        alert('Heads up: the movie was capped to the first lines to limit cost/time. Split a long story into parts for the rest.')
      }
    } catch (error) {
      alert('Premium movie failed: ' + error.message)
    } finally {
      setIsGenerating(false)
      setStatusMessage('')
    }
  }

  // Real text-to-video via fal.ai (paid). Submits the job, then polls until ready.
  // Multi-clip AI story: one AI clip per line of the story + voices, stitched.
  const handleAiStory = async () => {
    if (!textContent.trim()) {
      setAiStatus('⚠️ Write your story (the dialogue lines) in the "Your Story/Content" box above first.')
      return
    }
    setAiBusy(true)
    setAiStatus('Starting AI story… this can take 10–20 minutes and costs a few cents per line.')
    try {
      const { createAiStoryVideo } = await import('./lib/aiStoryVideo')
      const blob = await createAiStoryVideo({
        script: textContent,
        style: aiPrompt,
        aspect: aiAspect,
        model: aiModel || undefined,
        character: characterName,
        onStatus: setAiStatus,
      })
      const url = URL.createObjectURL(blob)
      setVideos((prev) => [
        { id: Date.now(), title: videoTitle || 'AI Story', character: 'AI', date: new Date().toLocaleDateString(), url },
        ...prev,
      ])
      setAiStatus('✅ AI story done! See it in Recent Videos.')
    } catch (e) {
      setAiStatus('⚠️ ' + e.message)
    }
    setAiBusy(false)
  }

  const handleAiVideo = async () => {
    if (!aiPrompt.trim()) {
      setAiStatus('⚠️ Write a prompt describing the video first.')
      return
    }
    setAiBusy(true)
    setAiStatus('Submitting to fal.ai…')
    try {
      const sub = await fetch('/api/ai-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', prompt: aiPrompt, aspectRatio: aiAspect, model: aiModel || undefined }),
      })
      const subData = await sub.json()
      if (!sub.ok) {
        setAiStatus('⚠️ ' + (subData.message || 'Submit failed.'))
        setAiBusy(false)
        return
      }
      const { statusUrl, responseUrl } = subData
      let tries = 0
      const poll = async () => {
        tries++
        try {
          const st = await fetch('/api/ai-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'status', statusUrl, responseUrl }),
          })
          const stData = await st.json()
          if (!st.ok) { setAiStatus('⚠️ ' + (stData.message || 'Failed.')); setAiBusy(false); return }
          if (stData.status === 'COMPLETED') {
            if (stData.videoUrl) {
              setVideos((prev) => [
                { id: Date.now(), title: videoTitle || 'AI Video', character: 'AI', date: new Date().toLocaleDateString(), url: stData.videoUrl, external: true },
                ...prev,
              ])
              setAiStatus('✅ Done! See it in Recent Videos.')
            } else {
              setAiStatus('⚠️ ' + (stData.message || 'No video returned.'))
            }
            setAiBusy(false)
            return
          }
          setAiStatus(`Generating… (${stData.status || 'working'}) ~${tries * 5}s elapsed`)
          if (tries > 120) { setAiStatus('⚠️ Timed out. Try again or a different model.'); setAiBusy(false); return }
          setTimeout(poll, 5000)
        } catch (e) {
          setAiStatus('⚠️ ' + e.message); setAiBusy(false)
        }
      }
      setTimeout(poll, 4000)
    } catch (e) {
      setAiStatus('⚠️ ' + e.message)
      setAiBusy(false)
    }
  }

  const handleGenerateVideo = async () => {
    const script = (analysis?.script || textContent).trim()

    if (!script || !videoTitle.trim()) {
      alert('Please add a story and a title first! (Tip: "Analyze Story with AI" gives a nicer script.)')
      return
    }

    if (premiumLipSync) {
      await generateMovie(script)
      return
    }

    setIsGenerating(true)
    setStatusMessage('Preparing...')

    try {
      const blob = await createTalkingVideo({
        script,
        scenes: analysis?.scenes,
        character: characterName,
        canvas: canvasRef.current,
        onStatus: setStatusMessage,
        mode: use3D ? '3d' : '2d',
        artwork,
        showCaptions: showSubtitles,
        voices,
      })

      const url = URL.createObjectURL(blob)

      setVideos([
        {
          id: Date.now(),
          title: videoTitle,
          character: characterName,
          date: new Date().toLocaleDateString(),
          url,
        },
        ...videos,
      ])

      setVideoGenerated(true)
      setTimeout(() => setVideoGenerated(false), 3000)
    } catch (error) {
      alert('Failed to generate video: ' + error.message)
    } finally {
      setIsGenerating(false)
      setStatusMessage('')
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <h1>🎬 Smita Motgi Tool</h1>
          <p>Create Amazing Content</p>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.grid}>
          <section className={styles.creator}>
            <h2>Create New Video</h2>

            <div className={styles.formGroup}>
              <label>Video Title</label>
              <input
                type="text"
                placeholder="e.g., My Awesome Story"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                className={styles.input}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Your Story/Content</label>
              <textarea
                placeholder="Write your content here... Your character will speak these words!"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                className={styles.textarea}
              />
              <span className={styles.charCount}>
                {textContent.length} characters
              </span>
            </div>

            <div className={styles.formGroup}>
              <label>Reference Video Link (optional)</label>
              <input
                type="url"
                placeholder="e.g., a YouTube link for style inspiration"
                value={videoLink}
                onChange={(e) => setVideoLink(e.target.value)}
                className={styles.input}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Choose Character</label>
              <div className={styles.characterGrid}>
                {characters.map((char) => (
                  <button
                    key={char.name}
                    className={`${styles.characterButton} ${
                      characterName === char.name ? styles.active : ''
                    }`}
                    style={{
                      borderColor: char.cheek,
                      backgroundColor:
                        characterName === char.name
                          ? char.cheek + '22'
                          : 'transparent',
                    }}
                    onClick={() => setCharacterName(char.name)}
                  >
                    <CharacterPreview
                      name={char.name}
                      speaking={characterName === char.name}
                    />
                    <span>{char.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>🎨 Use your own artwork (optional)</label>
              <p className={styles.hint}>
                Just upload <strong>one “Normal” picture</strong> per character —
                the tool adds expressions automatically (tears when crying, anger
                mark when angry, hearts for love, “!” for surprise, a talking
                wobble while speaking). The other slots are optional: add separate
                pictures or <strong>animated GIFs</strong> for even better results
                (a GIF plays its own animation).
              </p>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={removeBg}
                  onChange={(e) => setRemoveBg(e.target.checked)}
                />
                <span>Remove background automatically (upload after toggling)</span>
              </label>

              <p className={styles.hint}>
                ✨ <strong>AI expressions (paid):</strong> upload just the
                “Normal” picture and the tool auto-creates all the other
                expressions of the same character (or click <strong>✨ AI</strong>{' '}
                to re-run). Needs GEMINI_API_KEY on Render (~$0.50 per
                character); without a key the character still animates with the
                free auto-cues. Optional outfit:
              </p>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={autoAI}
                  onChange={(e) => setAutoAI(e.target.checked)}
                />
                <span>🤖 Auto-create AI expressions when I upload a Normal photo</span>
              </label>
              <input
                type="text"
                className={styles.input}
                placeholder="Optional outfit/style, e.g. red festive sari"
                value={genOutfit}
                onChange={(e) => setGenOutfit(e.target.value)}
              />
              {genMsg && <p className={styles.hint}>{genMsg}</p>}

              {characters.map((char) => (
                <div key={char.name} className={styles.artRow}>
                  <span className={styles.artName}>{char.name}</span>
                  <select
                    className={styles.voiceSelect}
                    value={voices[char.name] || char.voiceId}
                    onChange={(e) =>
                      setVoices((prev) => ({ ...prev, [char.name]: e.target.value }))
                    }
                    title="Voice for this character"
                  >
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        🔊 {v.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.artBtn}
                    disabled={genBusy === char.name}
                    onClick={() => generateExpressions(char.name)}
                  >
                    {genBusy === char.name ? '… AI' : '✨ AI'}
                  </button>
                  {ART_SLOTS.map((slot) => (
                    <label
                      key={slot.key}
                      className={`${styles.artBtn} ${artwork[char.name]?.[slot.key] ? styles.artBtnSet : ''}`}
                    >
                      {artwork[char.name]?.[slot.key] ? '✓ ' : ''}
                      {slot.label}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => handleArt(char.name, slot.key, e.target.files[0])}
                      />
                    </label>
                  ))}
                  {artwork[char.name] && (
                    <button type="button" className={styles.artClear} onClick={() => clearArt(char.name)}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={showSubtitles}
                onChange={(e) => setShowSubtitles(e.target.checked)}
              />
              <span>💬 Show subtitles (off = no text on the video)</span>
            </label>

            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={use3D}
                onChange={(e) => setUse3D(e.target.checked)}
              />
              <span>🧊 3D mode (beta) — render characters in 3D</span>
            </label>

            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={premiumLipSync}
                onChange={(e) => setPremiumLipSync(e.target.checked)}
              />
              <span>
                🎬 Premium movie (paid, beta) — photoreal lip-sync: each line is
                spoken on that character’s own photo, then cut together into one
                MP4. <strong>Upload a still photo for every character who talks</strong>
                (e.g. both {characterName} &amp; {getPartner(characterName).label}).
                Needs REPLICATE_API_TOKEN + billing on Render; a few minutes per line.
              </span>
            </label>

            <button
              onClick={handleAnalyzeStory}
              disabled={isAnalyzing}
              className={`${styles.analyzeButton} ${
                isAnalyzing ? styles.loading : ''
              }`}
            >
              {isAnalyzing ? (
                <>
                  <span className={styles.spinner}></span>
                  Analyzing with AI...
                </>
              ) : (
                '✨ Analyze Story with AI'
              )}
            </button>

            <button
              onClick={handleGenerateVideo}
              disabled={isGenerating}
              className={`${styles.generateButton} ${
                isGenerating ? styles.loading : ''
              }`}
            >
              {isGenerating ? (
                <>
                  <span className={styles.spinner}></span>
                  Generating...
                </>
              ) : (
                '🚀 Generate Video'
              )}
            </button>

            <div className={styles.aiVideoBox}>
              <label>🎥 AI Video (paid · fal.ai)</label>
              <p className={styles.hint}>
                Real text-to-video — describe any scene/character (a cat, Bubu
                Dudu, anything) and AI generates real video. Needs FAL_KEY on
                Render + credits. Costs a few dollars and takes a few minutes per
                clip.
              </p>
              <textarea
                className={styles.textarea}
                placeholder="e.g. A cute brown bear and a white panda sharing chai at an Indian street stall, cartoon style, warm evening light"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              <div className={styles.aiRow}>
                <select className={styles.input} value={aiAspect} onChange={(e) => setAiAspect(e.target.value)}>
                  <option value="9:16">Vertical 9:16 (Reels/Shorts)</option>
                  <option value="16:9">Wide 16:9</option>
                  <option value="1:1">Square 1:1</option>
                </select>
              </div>
              <input
                type="text"
                className={styles.input}
                placeholder="Advanced: fal.ai model id (leave blank for default)"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
              />
              <button onClick={handleAiVideo} disabled={aiBusy} className={styles.analyzeButton}>
                {aiBusy ? (<><span className={styles.spinner}></span>Generating AI video…</>) : '🎬 Generate AI Video (one short clip)'}
              </button>
              <button onClick={handleAiStory} disabled={aiBusy} className={styles.generateButton}>
                {aiBusy ? (<><span className={styles.spinner}></span>Building AI story…</>) : '🎞️ AI Story Video (your story + voices, 30–60s, paid)'}
              </button>
              <p className={styles.hint}>
                The box above = the character &amp; style (e.g. “cute brown bear and white
                panda, 2D cartoon, Indian setting”). The lines of your <strong>Story</strong> at
                the top become the dialogue. One AI clip is made per line, voices are added, and
                they’re stitched into a 30–60s video. Costs ~$0.30–$1+ and takes 10–20 min; the
                character may look a bit different between clips.
              </p>
              {aiStatus && <div className={styles.statusMessage}>{aiStatus}</div>}
            </div>

            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className={`${styles.stage} ${
                isGenerating ? styles.stageActive : ''
              }`}
            />

            {isGenerating && statusMessage && (
              <div className={styles.statusMessage}>{statusMessage}</div>
            )}

            {analysisError && (
              <div className={styles.errorMessage}>⚠️ {analysisError}</div>
            )}

            {videoGenerated && (
              <div className={styles.successMessage}>
                ✅ Video created successfully!
              </div>
            )}

            {analysis && (
              <div className={styles.analysisPanel}>
                <h3>✨ AI Story Breakdown</h3>

                <div className={styles.analysisRow}>
                  <strong>Title:</strong> {analysis.suggestedTitle}
                </div>
                <div className={styles.analysisRow}>
                  <strong>Tone:</strong> {analysis.tone}
                </div>
                <div className={styles.analysisRow}>
                  <strong>Summary:</strong> {analysis.summary}
                </div>

                <div className={styles.characterCard}>
                  <h4>🎭 Character: {analysis.character.name}</h4>
                  <p>
                    <strong>Appearance:</strong> {analysis.character.appearance}
                  </p>
                  <p>
                    <strong>Personality:</strong>{' '}
                    {analysis.character.personality}
                  </p>
                  <p>
                    <strong>Voice:</strong> {analysis.character.voiceStyle}
                  </p>
                </div>

                <div className={styles.scriptBox}>
                  <h4>🗣️ Script (what the character speaks)</h4>
                  <p>{analysis.script}</p>
                </div>

                {analysis.scenes?.length > 0 && (
                  <div className={styles.scenesBox}>
                    <h4>🎬 Scenes</h4>
                    {analysis.scenes.map((scene, i) => (
                      <div key={i} className={styles.sceneItem}>
                        <strong>{scene.beat}</strong>
                        <p className={styles.sceneNarration}>
                          “{scene.narration}”
                        </p>
                        <p className={styles.sceneVisual}>🎥 {scene.visual}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className={styles.preview}>
            <h2>Recent Videos</h2>

            {videos.length === 0 ? (
              <div className={styles.empty}>
                <p>No videos yet.</p>
                <p>Create your first video to see it here! 👈</p>
              </div>
            ) : (
              <div className={styles.videosList}>
                {videos.map((video) => (
                  <div key={video.id} className={styles.videoCard}>
                    <div className={styles.videoMeta}>
                      <h3>{video.title}</h3>
                      <p>
                        <strong>{video.character}</strong> • {video.date}
                      </p>
                    </div>
                    {video.external && (
                      <video src={video.url} controls className={styles.videoPreview} />
                    )}
                    <div className={styles.videoActions}>
                      <a
                        href={video.url}
                        {...(video.external
                          ? { target: '_blank', rel: 'noreferrer' }
                          : { download: `${video.title}.${video.mp4 ? 'mp4' : 'webm'}` })}
                        className={styles.downloadButton}
                      >
                        {video.external ? '▶️ Open / Download (MP4)' : '📥 Download'}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className={styles.footer}>
        <p>🎨 Made for Smita • Powered by AI • © 2024</p>
      </footer>
    </div>
  )
}