import { useCallback, useEffect, useRef, useState } from 'react'
import { frame, GH, GW, plan, TOTAL, type Plan } from './particles'
import { drawCover, loadTarget, type Target } from './portrait'

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']
const MAX_BYTES = 20 * 1024 * 1024

type Stage = 'empty' | 'ready' | 'playing' | 'done'

/** Decodes and checks the file; everything stays in this tab. */
async function readImage(file: File): Promise<ImageData> {
  if (!TYPES.includes(file.type)) throw new Error('That isn’t an image this browser can read. Try a PNG, JPEG, WebP or GIF.')
  if (file.size > MAX_BYTES) throw new Error('That image is over 20 MB. Try a smaller one.')
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    throw new Error('That file couldn’t be opened as an image. It may be damaged.')
  }
  if (bmp.width < 32 || bmp.height < 32) throw new Error('That image is too small. Use one at least 32 × 32 pixels.')
  const canvas = document.createElement('canvas')
  canvas.width = GW
  canvas.height = GH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  drawCover(ctx, bmp, GW, GH)
  bmp.close()
  return ctx.getImageData(0, 0, GW, GH)
}

// Browsers allow a new tab for about 5 s after a click; the build takes longer than that.
const NEW_TAB_WINDOW = 4500

/**
 * Within a few seconds of the click on Reshape, a new tab is allowed; after that (the usual case,
 * the build is slow) this page goes to the video itself. Either way, the video plays, and no
 * "pop-up blocked" bar appears.
 */
function openVideo(clickedAt: number) {
  if (performance.now() - clickedAt < NEW_TAB_WINDOW) {
    const tab = window.open(VIDEO, '_blank')
    if (tab) {
      tab.opener = null
      return
    }
  }
  window.location.assign(VIDEO)
}

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const source = useRef<ImageData | null>(null)
  const current = useRef<Plan | null>(null)
  const raf = useRef(0)
  // Start loading the portrait straight away, so Reshape doesn't wait on it.
  const target = useRef<Promise<Target> | null>(null)
  const [stage, setStage] = useState<Stage>('empty')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    target.current = loadTarget(GW, GH)
    return () => {
      cancelAnimationFrame(raf.current)
    }
  }, [])

  /** Shows the uploaded picture as it is, before reshaping. */
  const show = useCallback((img: ImageData) => {
    canvas.current?.getContext('2d')?.putImageData(img, 0, 0)
  }, [])

  const animate = useCallback((p: Plan, then?: () => void) => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    cancelAnimationFrame(raf.current)
    const img = ctx.createImageData(GW, GH)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    setStage('playing')
    const tick = (now: number) => {
      const ms = reduced ? TOTAL : now - start
      frame(p, img, ms)
      ctx.putImageData(img, 0, 0)
      if (ms < TOTAL) raf.current = requestAnimationFrame(tick)
      else {
        setStage('done')
        then?.()
      }
    }
    raf.current = requestAnimationFrame(tick)
  }, [])

  async function take(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const img = await readImage(file)
      source.current = img
      current.current = null
      setStage('ready')
      // The canvas only exists once the stage changes; draw on the next frame.
      requestAnimationFrame(() => show(img))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function reshape() {
    const img = source.current
    if (!img || !target.current) return
    const clickedAt = performance.now()
    // Planning is quick (tens of ms).
    current.current ??= plan(img, await target.current)
    animate(current.current, () => {
      openVideo(clickedAt) // the moment the colour is in: no pause
    })
  }

  function replay() {
    if (current.current) animate(current.current)
  }

  function reset() {
    cancelAnimationFrame(raf.current)
    source.current = null
    current.current = null
    setStage('empty')
    setError(null)
    if (input.current) input.current.value = ''
  }

  const hasImage = stage !== 'empty'

  return (
    <main
      className={dragging ? 'page dragging' : 'page'}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void take(e.dataTransfer.files[0])
      }}
    >
      <header>
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          Reshapers
        </div>
        <h1>
          Turn any photo into <em>pixel art</em>
        </h1>
        <p className="tag">Drop a photo and hit Reshape. Every pixel of your picture finds a new place.</p>
      </header>

      <section className="stage">
        <div className={hasImage ? 'frame' : 'frame hidden'}>
          <canvas ref={canvas} width={GW} height={GH} aria-label="Your photo, in pixels" />
        </div>

        {!hasImage && (
          <button type="button" className="drop" onClick={() => input.current?.click()}>
            <span className="icon" aria-hidden="true">
              +
            </span>
            <span className="big">Drop a photo</span>
            <span className="small">or click to choose one. It stays on your device.</span>
          </button>
        )}

        <input ref={input} type="file" accept={TYPES.join(',')} hidden onChange={(e) => void take(e.target.files?.[0])} />

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {hasImage && (
          <div className="actions">
            {stage === 'done' ? (
              <button type="button" onClick={replay}>
                Replay
              </button>
            ) : (
              <button type="button" className="primary" disabled={stage === 'playing'} onClick={() => void reshape()}>
                {stage === 'playing' ? 'Reshaping…' : 'Reshape'}
              </button>
            )}
            <button type="button" onClick={reset} disabled={stage === 'playing'}>
              New photo
            </button>
          </div>
        )}
      </section>

      <footer>
        <span>Processed in your browser. Nothing is uploaded.</span>
      </footer>
    </main>
  )
}
