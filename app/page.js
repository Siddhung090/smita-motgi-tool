'use client'

import { useState } from 'react'
import styles from './page.module.css'

export default function Home() {
  const [textContent, setTextContent] = useState('')
  const [characterName, setCharacterName] = useState('Dudu')
  const [videoTitle, setVideoTitle] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [videoGenerated, setVideoGenerated] = useState(false)
  const [videos, setVideos] = useState([])

  const characters = [
    { name: 'Dudu', color: '#FF6B6B', emoji: '🎭' },
    { name: 'Bubu', color: '#4ECDC4', emoji: '🎪' },
    { name: 'Momo', color: '#FFE66D', emoji: '✨' },
    { name: 'Zara', color: '#95E1D3', emoji: '🌟' },
  ]

  const handleGenerateVideo = async () => {
    if (!textContent.trim() || !videoTitle.trim()) {
      alert('Please fill in all fields!')
      return
    }

    setIsGenerating(true)

    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textContent,
          character: characterName,
          title: videoTitle,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setVideos([
          {
            id: Date.now(),
            title: videoTitle,
            character: characterName,
            date: new Date().toLocaleDateString(),
            url: data.url,
          },
          ...videos,
        ])

        setVideoGenerated(true)
        setTextContent('')
        setVideoTitle('')

        setTimeout(() => setVideoGenerated(false), 3000)
      } else {
        alert('Error: ' + data.message)
      }
    } catch (error) {
      alert('Failed to generate video: ' + error.message)
    } finally {
      setIsGenerating(false)
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
              <label>Choose Character</label>
              <div className={styles.characterGrid}>
                {characters.map((char) => (
                  <button
                    key={char.name}
                    className={`${styles.characterButton} ${
                      characterName === char.name ? styles.active : ''
                    }`}
                    style={{
                      borderColor: char.color,
                      backgroundColor:
                        characterName === char.name
                          ? char.color + '20'
                          : 'transparent',
                    }}
                    onClick={() => setCharacterName(char.name)}
                  >
                    <span className={styles.emoji}>{char.emoji}</span>
                    <span>{char.name}</span>
                  </button>
                ))}
              </div>
            </div>

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

            {videoGenerated && (
              <div className={styles.successMessage}>
                ✅ Video created successfully!
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
                        download={`${video.title}.mp4`}
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