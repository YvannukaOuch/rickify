/**
 * Target-driven reconstruction: every pixel of the uploaded image becomes one particle that keeps
 * its colour. Pixels are ranked by brightness, the portrait's cells are ranked the same way, and
 * the n-th brightest pixel flies to the n-th brightest cell. Each cell receives exactly one pixel,
 * so the face is drawn by the user's own pixels; at the end the portrait's real colours wash in.
 */

import type { Target } from './portrait'

export const GW = 160
export const GH = 200
const N = GW * GH
const BG = 0xfffaf2f4 // #f4f2fa (light violet-grey), ABGR in the canvas buffer
const OPAQUE = 0xff000000
// A slow build (about 9 s): the face comes together gradually, bright parts first.
const MOVE = 3200 // ms one particle takes to fly
const SPREAD = 5000 // ms over which particles set off
const HOLD = 800 // ms the original picture shows before it breaks up
// Then the portrait's real colours wash in slowly, top to bottom, once most pixels have landed.
const PAINT_START = HOLD + SPREAD + MOVE * 0.5 // ms
const PAINT_SPREAD = 1800 // ms from the top row starting to the bottom row starting
const PAINT = 2600 // ms one cell takes to take on its colour
export const TOTAL = PAINT_START + PAINT_SPREAD + PAINT

export interface Plan {
  color: Uint32Array
  /** The colour on landing: same hue, brightness matched to the portrait. */
  end: Uint32Array
  /** The portrait's real colour at the landing cell, reached at the very end. */
  real: Uint32Array
  /** When this cell starts taking on its real colour (ms). */
  paint: Float32Array
  sx: Float32Array
  sy: Float32Array
  tx: Float32Array
  ty: Float32Array
  delay: Float32Array
  swirl: Float32Array
}

export function plan(source: ImageData, portrait: Target): Plan {
  const target = portrait.lum
  const d = source.data
  const color = new Uint32Array(d.buffer.slice(0), 0, N)
  // (BGR order inside each 32-bit word on little-endian machines: R is the low byte.)
  const srcLum = new Float32Array(N)
  for (let i = 0; i < N; i++) srcLum[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]
  const bySrc = rank(srcLum)
  const byTgt = rank(target)
  const p: Plan = {
    color: new Uint32Array(N),
    end: new Uint32Array(N),
    real: new Uint32Array(N),
    paint: new Float32Array(N),
    sx: new Float32Array(N),
    sy: new Float32Array(N),
    tx: new Float32Array(N),
    ty: new Float32Array(N),
    delay: new Float32Array(N),
    swirl: new Float32Array(N),
  }
  for (let k = 0; k < N; k++) {
    const s = bySrc[k]
    const t = byTgt[k]
    p.color[k] = (color[s] | OPAQUE) >>> 0 // force opaque
    // Same colour, brightness pulled most of the way to what this cell needs, so a very light or very
    // dark picture still draws a clear face. Hue and saturation stay the user's own.
    const have = srcLum[s] / 255
    const want = have + (target[t] - have) * 0.7
    const gain = have > 0.004 ? want / have : 0
    const lift = have > 0.004 ? 0 : want * 255
    const ch = (v: number) => Math.min(255, Math.round(v * gain + lift))
    p.end[k] = (OPAQUE | (ch(d[s * 4 + 2]) << 16) | (ch(d[s * 4 + 1]) << 8) | ch(d[s * 4])) >>> 0
    p.sx[k] = s % GW
    p.sy[k] = (s / GW) | 0
    p.tx[k] = t % GW
    p.ty[k] = (t / GW) | 0
    p.real[k] = (portrait.rgb[t] | OPAQUE) >>> 0
    p.paint[k] = PAINT_START + (p.ty[k] / GH) * PAINT_SPREAD + Math.random() * 250
    // Brightest pixels leave first, so the face lights up before the shadows fill in.
    p.delay[k] = HOLD + SPREAD * (1 - k / N) * 0.75 + Math.random() * SPREAD * 0.25
    p.swirl[k] = (Math.random() - 0.5) * 60
  }
  return p
}

function rank(values: Float32Array) {
  const idx = new Uint32Array(values.length)
  for (let i = 0; i < idx.length; i++) idx[i] = i
  return idx.sort((a, b) => values[a] - values[b])
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Draws frame `ms` of the flight into `img` (GW × GH). */
export function frame(p: Plan, img: ImageData, ms: number) {
  const buf = new Uint32Array(img.data.buffer)
  buf.fill(BG)
  for (let k = 0; k < N; k++) {
    let x: number
    let y: number
    let c = p.color[k]
    const t = (ms - p.delay[k]) / MOVE
    if (t <= 0) {
      x = p.sx[k]
      y = p.sy[k]
    } else if (t >= 1) {
      x = p.tx[k]
      y = p.ty[k]
      c = p.end[k]
    } else {
      const e = ease(t)
      c = mix(p.color[k], p.end[k], e)
      const dx = p.tx[k] - p.sx[k]
      const dy = p.ty[k] - p.sy[k]
      // Curve sideways mid-flight (perpendicular to the path), back to zero on landing.
      const bend = (Math.sin(Math.PI * e) * p.swirl[k]) / (Math.hypot(dx, dy) + 1)
      x = p.sx[k] + dx * e - dy * bend
      y = p.sy[k] + dy * e + dx * bend
    }
    // The slow colour wash at the end.
    const paint = (ms - p.paint[k]) / PAINT
    if (paint > 0) {
      const w = paint >= 1 ? 1 : paint * paint * (3 - 2 * paint)
      c = w === 1 ? p.real[k] : mix(c, p.real[k], w)
    }
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi >= 0 && xi < GW && yi >= 0 && yi < GH) buf[yi * GW + xi] = c
  }
}

function mix(a: number, b: number, t: number) {
  const ch = (shift: number) => {
    const x = (a >>> shift) & 255
    return Math.round(x + (((b >>> shift) & 255) - x) * t) << shift
  }
  return (OPAQUE | ch(16) | ch(8) | ch(0)) >>> 0
}
