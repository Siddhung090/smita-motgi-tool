'use client'

import { useState, useRef, useEffect } from 'react'
import styles from './page.module.css'
import { createTalkingVideo } from './lib/talkingVideo'
import { CHARACTERS, getCharacter, drawBackground, drawCharacter } from './lib/characters'

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
  const [analysis, setAnalysis] = useState(null)
  const [analysisError, setAnalysisError] = useState('')

  const characters = Object.keys(CHARACTERS).map((name) => ({
    name,
    ...CHARACTERS[name],
  }))

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