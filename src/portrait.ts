/**
 * The picture the pixels rebuild, as brightness per cell (0 dark to 1 light): head and chest from
 * /portrait.webp (280 × 334, supplied by the site owner). If it can't load, a stylised portrait is
 * drawn instead.
 */

const PHOTO = '/portrait.webp'
// Head and chest, as fractions of the photo (4:5, like the canvas): 224 × 280 px from (48, 0).
const CROP = { x: 0.171, y: 0, w: 0.8, h: 0.838 }

export interface Target {
  /** Brightness per cell, stretched to the full range: decides which pixel goes where. */
  lum: Float32Array
  /** The photo's real colour per cell (canvas ABGR words), washed in at the end. */
  rgb: Uint32Array
}

export async function loadTarget(w: number, h: number): Promise<Target> {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const photo = await loadPhoto(PHOTO)
  if (photo) {
    const sw = photo.naturalWidth
    const sh = photo.naturalHeight
    ctx.drawImage(photo, CROP.x * sw, CROP.y * sh, CROP.w * sw, CROP.h * sh, 0, 0, w, h)
  } else drawPortrait(ctx, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  return { lum: stretch(luminance(data)), rgb: new Uint32Array(data.data.buffer.slice(0)) }
}

/** Spreads the brightness over the full range (ignoring the 2% extremes), so the face reads clearly. */
function stretch(lum: Float32Array) {
  const sorted = Float32Array.from(lum).sort()
  const lo = sorted[Math.floor(sorted.length * 0.02)]
  const hi = sorted[Math.floor(sorted.length * 0.98)]
  const span = Math.max(hi - lo, 0.01)
  return lum.map((v) => Math.min(1, Math.max(0, (v - lo) / span)))
}

function loadPhoto(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

export function luminance(data: ImageData): Float32Array {
  const out = new Float32Array(data.width * data.height)
  const d = data.data
  for (let i = 0; i < out.length; i++) out[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255
  return out
}

/** Drawn on a 100 × 125 grid, scaled to the canvas. Only brightness matters, so it's all greys. */
function drawPortrait(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save()
  ctx.scale(w / 100, h / 125)
  const g = (v: number) => `rgb(${v},${v},${v})`
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0) => {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
  }
  const poly = (pts: number[], fill: string) => {
    ctx.beginPath()
    ctx.moveTo(pts[0], pts[1])
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
  }

  // Backdrop: a soft spotlight.
  const bg = ctx.createRadialGradient(50, 45, 5, 50, 55, 80)
  bg.addColorStop(0, g(70))
  bg.addColorStop(1, g(12))
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 100, 125)

  // Trench coat, shirt, tie.
  poly([4, 125, 10, 98, 32, 86, 50, 92, 68, 86, 90, 98, 96, 125], g(58))
  poly([32, 86, 44, 125, 30, 125, 22, 96], g(88)) // left lapel
  poly([68, 86, 56, 125, 70, 125, 78, 96], g(88)) // right lapel
  poly([40, 86, 50, 108, 60, 86, 56, 125, 44, 125], g(235)) // shirt
  poly([47, 92, 53, 92, 55, 125, 45, 125], g(30)) // tie
  poly([40, 86, 50, 95, 46, 99, 37, 89], g(250)) // collar
  poly([60, 86, 50, 95, 54, 99, 63, 89], g(250))

  // Neck and ears.
  poly([41, 72, 59, 72, 60, 90, 50, 96, 40, 90], g(150))
  ellipse(30, 55, 4, 7, g(160))
  ellipse(70, 55, 4, 7, g(160))

  // Face, lit from the upper left.
  const skin = ctx.createRadialGradient(44, 48, 4, 50, 56, 26)
  skin.addColorStop(0, g(225))
  skin.addColorStop(1, g(160))
  ctx.beginPath()
  ctx.moveTo(31, 45)
  ctx.bezierCurveTo(30, 66, 38, 80, 50, 82)
  ctx.bezierCurveTo(62, 80, 70, 66, 69, 45)
  ctx.bezierCurveTo(68, 33, 32, 33, 31, 45)
  ctx.fillStyle = skin
  ctx.fill()

  // The pompadour: big, swept up and back.
  ctx.beginPath()
  ctx.moveTo(29, 52)
  ctx.bezierCurveTo(24, 36, 26, 20, 38, 13)
  ctx.bezierCurveTo(48, 6, 66, 8, 72, 18)
  ctx.bezierCurveTo(77, 27, 74, 40, 71, 52)
  ctx.bezierCurveTo(70, 42, 66, 36, 60, 34)
  ctx.bezierCurveTo(52, 31, 42, 33, 36, 37)
  ctx.bezierCurveTo(32, 40, 30, 45, 29, 52)
  ctx.fillStyle = g(105)
  ctx.fill()
  ellipse(47, 17, 16, 6, g(150), -0.25) // shine on the wave
  ellipse(58, 22, 9, 3, g(130), -0.4)

  // Brows, eyes, nose.
  poly([35, 46, 45, 44, 45, 46.5, 35, 48.5], g(70))
  poly([55, 44, 65, 46, 65, 48.5, 55, 46.5], g(70))
  ellipse(40, 52, 4.2, 2.2, g(245))
  ellipse(60, 52, 4.2, 2.2, g(245))
  ellipse(40.5, 52, 1.9, 1.9, g(25))
  ellipse(60.5, 52, 1.9, 1.9, g(25))
  poly([50, 53, 53, 64, 50, 66, 46, 64], g(175))
  poly([50, 54, 52.5, 63, 51, 64.5], g(120))

  // The grin.
  ctx.beginPath()
  ctx.moveTo(40, 69)
  ctx.quadraticCurveTo(50, 80, 60, 69)
  ctx.quadraticCurveTo(50, 73, 40, 69)
  ctx.fillStyle = g(40)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(42.5, 70.2)
  ctx.quadraticCurveTo(50, 74.5, 57.5, 70.2)
  ctx.quadraticCurveTo(50, 72.2, 42.5, 70.2)
  ctx.fillStyle = g(250)
  ctx.fill()
  ctx.restore()
}
