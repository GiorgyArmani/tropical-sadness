"use client"

import { useEffect, useRef } from "react"

// Capas de olas, de la más lejana (arriba, tenue) a la más cercana (abajo, brillante)
const LAYERS = [
  { base: 0.50, amp: 16, len: 0.0045, speed: 0.12, fill: "rgba(0, 40, 38, 0.35)", line: "rgba(0, 255, 200, 0.10)" },
  { base: 0.58, amp: 22, len: 0.0036, speed: 0.16, fill: "rgba(0, 32, 34, 0.45)", line: "rgba(0, 255, 200, 0.14)" },
  { base: 0.66, amp: 29, len: 0.0029, speed: 0.20, fill: "rgba(0, 24, 28, 0.55)", line: "rgba(0, 255, 200, 0.18)" },
  { base: 0.75, amp: 35, len: 0.0023, speed: 0.26, fill: "rgba(0, 16, 20, 0.70)", line: "rgba(0, 255, 200, 0.24)" },
  { base: 0.85, amp: 42, len: 0.0018, speed: 0.32, fill: "rgba(0, 8, 12, 0.85)", line: "rgba(255, 214, 0, 0.22)" },
]

export default function TideBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let width = 0
    let height = 0
    let frame = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (reduceMotion) draw(0)
    }

    const draw = (t: number) => {
      const time = t / 1000
      // La marea sube y baja lentamente (~14s por ciclo)
      const tide = Math.sin(time * 0.45) * height * 0.035

      ctx.clearRect(0, 0, width, height)

      LAYERS.forEach((layer, i) => {
        const y0 = height * layer.base - tide * (1 - i * 0.12)
        ctx.beginPath()
        ctx.moveTo(0, height)
        for (let x = 0; x <= width + 8; x += 8) {
          const y =
            y0 +
            Math.sin(x * layer.len + time * layer.speed * 2 + i * 1.7) * layer.amp +
            Math.sin(x * layer.len * 2.3 - time * layer.speed * 1.3 + i) * layer.amp * 0.35
          ctx.lineTo(x, y)
        }
        ctx.lineTo(width, height)
        ctx.closePath()
        ctx.fillStyle = layer.fill
        ctx.fill()

        // Cresta de la ola
        ctx.beginPath()
        for (let x = 0; x <= width + 8; x += 8) {
          const y =
            y0 +
            Math.sin(x * layer.len + time * layer.speed * 2 + i * 1.7) * layer.amp +
            Math.sin(x * layer.len * 2.3 - time * layer.speed * 1.3 + i) * layer.amp * 0.35
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = layer.line
        ctx.lineWidth = 1.25
        ctx.stroke()
      })

      if (!reduceMotion) frame = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener("resize", resize)
    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
}
