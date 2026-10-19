"use client"

// Ráfaga de estática de tele a pantalla completa, para cambiar de mundo (2D <-> 3D).
// play(onMid) la dispara: la estática sube, en el pico se llama onMid (ahí se cambia lo de abajo)
// y después se disuelve.

import { useImperativeHandle, useRef, type Ref } from "react"
import { hash, ramp, rgb } from "./ascii/math"

export type StaticBurstHandle = { play: (onMid: () => void) => void }

const MS = 760
const CHARS = " .:-=+*#%@"

export default function StaticBurst({ ref }: { ref?: Ref<StaticBurstHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runningRef = useRef(false)

  useImperativeHandle(ref, () => ({
    play(onMid) {
      const canvas = canvasRef.current
      if (!canvas || runningRef.current) {
        onMid()
        return
      }
      runningRef.current = true
      const ctx = canvas.getContext("2d")!
      const W = window.innerWidth
      const H = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `9px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`
      ctx.textBaseline = "top"
      const cw = ctx.measureText("M").width
      const lh = 10
      const cols = Math.ceil(W / cw)
      const rows = Math.ceil(H / lh)
      const start = performance.now()
      let midDone = false
      canvas.style.display = "block"

      const frame = (now: number) => {
        const p = Math.min((now - start) / MS, 1)
        // Sube rápido, se sostiene un instante y se disuelve
        const amt = p < 0.45 ? p / 0.45 : p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45
        if (!midDone && p >= 0.45) {
          midDone = true
          onMid()
        }
        ctx.clearRect(0, 0, W, H)
        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, amt * 1.1)})`
        ctx.fillRect(0, 0, W, H)
        const tick = Math.floor(now / 45)
        for (let r = 0; r < rows; r++) {
          let line = ""
          for (let c = 0; c < cols; c++) {
            const n = hash(c + tick * 13, r + tick * 7)
            line += n < amt ? ramp(CHARS, hash(c * 3 + tick, r)) : " "
          }
          ctx.fillStyle = rgb([205, 210, 220], 0.35 + 0.65 * hash(r, tick))
          ctx.fillText(line, 0, r * lh)
        }
        if (p < 1) requestAnimationFrame(frame)
        else {
          ctx.clearRect(0, 0, W, H)
          canvas.style.display = "none"
          runningRef.current = false
        }
      }
      requestAnimationFrame(frame)
    },
  }))

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] hidden h-full w-full" />
}
