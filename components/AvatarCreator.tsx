"use client"

// El creador de avatares: a la izquierda (arriba en el celular) la figura en ASCII, girando; al lado,
// los puntos de partida (ángel, demonio, espectro, caído) y cada parte para cambiarla. Lo armado se
// guarda en el dispositivo y es lo que ven los demás en las salas.

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import PixelIcon from "./PixelIcon"
import { LOOK_COLORS, LOOK_PARTS, LOOK_PRESETS, lookOf, presetLook, randomLook, type Look } from "./ascii3d/engine/avatars"

// El motor pesa y solo corre en el navegador: se baja recién al abrir el creador
const AvatarPreview = dynamic(() => import("./ascii3d/AvatarPreview"), { ssr: false })

const PART_LABELS: Record<keyof typeof LOOK_PARTS, string> = {
  body: "cuerpo",
  hair: "cabello",
  dress: "ropa",
  wings: "alas",
  crown: "cabeza",
  tail: "cola",
}
const COLOR_LABELS: Record<keyof typeof LOOK_COLORS, string> = {
  skin: "piel",
  cloth: "tela",
  hairColor: "pelo",
  glow: "brillo",
}
const css = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`

export default function AvatarCreator({
  nick,
  initial,
  onSave,
  onClose,
}: {
  nick: string
  initial: Look | null
  onSave: (look: Look) => void
  onClose: () => void
}) {
  const [look, setLook] = useState<Look>(() => initial ?? lookOf(nick))
  const set = <K extends keyof Look>(k: K, v: number) => setLook((l) => ({ ...l, [k]: v }))
  const step = (k: keyof typeof LOOK_PARTS, d: number) => {
    const n = LOOK_PARTS[k].length
    set(k, (look[k] + d + n) % n)
  }

  // Escape cierra sin guardar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ts-avatar-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 font-mono text-white sm:p-6"
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden border border-white/50 bg-[#0d0d0d] sm:flex-row">
        <AvatarPreview look={look} className="h-[38vh] w-full shrink-0 sm:h-auto sm:min-h-[460px] sm:w-[46%]" />

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-[11px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 id="ts-avatar-title" className="text-xs uppercase tracking-[0.2em] text-[#ffd600]">
                tu avatar
              </h2>
              <p className="mt-1 text-white/55">así te ven los demás en las salas. arrástralo para girarlo.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar sin guardar" className="ts-px-btn h-6 w-6">
              <PixelIcon name="close" className="h-2.5 w-2.5" />
            </button>
          </div>

          <fieldset>
            <legend className="mb-2 uppercase tracking-[0.15em] text-white/60">empezar como</legend>
            <div className="flex flex-wrap gap-2">
              {LOOK_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setLook((l) => presetLook(p, l.body))}
                  className="ts-px-btn h-6 px-2 text-[10px] uppercase tracking-[0.15em]"
                >
                  {p.name}
                </button>
              ))}
              <button type="button" onClick={() => setLook(randomLook())} className="ts-px-btn h-6 px-2 text-[10px] uppercase tracking-[0.15em]">
                azar
              </button>
            </div>
          </fieldset>

          <div className="grid gap-2">
            {(Object.keys(LOOK_PARTS) as (keyof typeof LOOK_PARTS)[]).map((k) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <span className="uppercase tracking-[0.15em] text-white/60">{PART_LABELS[k]}</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => step(k, -1)} aria-label={`${PART_LABELS[k]}: anterior`} className="ts-px-btn h-6 w-6">
                    <PixelIcon name="left" className="h-2.5 w-2.5" />
                  </button>
                  <span aria-live="polite" className="w-24 text-center">
                    {LOOK_PARTS[k][look[k]]}
                  </span>
                  <button type="button" onClick={() => step(k, 1)} aria-label={`${PART_LABELS[k]}: siguiente`} className="ts-px-btn h-6 w-6">
                    <PixelIcon name="right" className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3">
            {(Object.keys(LOOK_COLORS) as (keyof typeof LOOK_COLORS)[]).map((k) => (
              <fieldset key={k} className="flex items-center justify-between gap-3">
                <legend className="sr-only">{COLOR_LABELS[k]}</legend>
                <span aria-hidden="true" className="uppercase tracking-[0.15em] text-white/60">
                  {COLOR_LABELS[k]}
                </span>
                <div className="flex flex-wrap justify-end gap-2">
                  {LOOK_COLORS[k].map((c, i) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => set(k, i)}
                      aria-label={`${COLOR_LABELS[k]} ${c.name}`}
                      aria-pressed={look[k] === i}
                      title={c.name}
                      style={{ background: css(c.rgb) }}
                      className={`h-5 w-5 outline-offset-2 ${look[k] === i ? "outline outline-2 outline-[#ffd600]" : "outline outline-1 outline-white/30"}`}
                    />
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="mt-auto flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="ts-px-btn h-7 px-3 text-[10px] uppercase tracking-[0.15em]">
              cancelar
            </button>
            <button type="button" onClick={() => onSave(look)} className="ts-px-btn ts-px-btn--primary h-7 px-3 text-[10px] uppercase tracking-[0.15em]">
              listo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
