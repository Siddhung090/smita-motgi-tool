'use client'

import { useState, useRef, useEffect } from 'react'
import styles from './page.module.css'
import { createTalkingVideo } from './lib/talkingVideo'
import { CHARACTERS, getCharacter, drawBackground, drawCharacter } from './lib/characters'

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
    const br = d[0], bg = d[1], bb = d[2], tol = 44
    const close = (i) => Math.abs(d[i] - br) < tol && Math.abs(d[i + 1] - bg) < tol && Math.abs(d[i + 2] - bb) < tol
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
  const [artwork, setArtwork] = useState({})
  const [removeBg, setRemoveBg] = useState(true)
  const [analysis, setAnalysis] = useState(null)
  const [analysisError, setAnalysisError] = useState('')

  const characters = Object.keys(CHARACTERS).map((name) => ({
    name,
    ...CHARACTERS[name],
  }))

  // Load/save uploaded artwork so it survives page reloads.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bubudoodu_artwork')
      if (saved) setArtwork(JSON.parse(saved))
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('bubudoodu_artwork', JSON.stringify(artwork))
    } catch {}
  }, [artwork])

  const handleArt = async (name, slot, file) => {
    if (!file) return
    const url = await fileToArtDataURL(file, removeBg)
    setArtwork((prev) => ({ ...prev, [name]: { ...(prev[name] || {}), [slot]: url } }))
  }

  const clearArt = (name) => {
    setArtwork((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
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

  const handleGenerateVideo = async () => {
    const script = (analysis?.script || textContent).trim()

    if (!script || !videoTitle.trim()) {
      alert('Please add a story and a title first! (Tip: "Analyze Story with AI" gives a nicer script.)')
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
                Upload pictures for a character and they will be animated instead
                of the drawn one. Upload a different picture for each expression
                (Happy, Sad, Angry…) and a “Talking” one (mouth open) — the video
                shows the right face per scene. One image alone will only move,
                not change expression.
              </p>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={removeBg}
                  onChange={(e) => setRemoveBg(e.target.checked)}
                />
                <span>Remove background automatically (upload after toggling)</span>
              </label>
              {characters.map((char) => (
                <div key={char.name} className={styles.artRow}>
                  <span className={styles.artName}>{char.name}</span>
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
                checked={use3D}
                onChange={(e) => setUse3D(e.target.checked)}
              />
              <span>🧊 3D mode (beta) — render characters in 3D</span>
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
                    <div className={styles.videoActions}>
                      <a
                        href={video.url}
                        download={`${video.title}.webm`}
                        className={styles.downloadButton}
                      >
                        📥 Download
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