"use client"

import { useRef, useState, useEffect, useImperativeHandle, type CSSProperties, type Ref } from "react"
import PixelIcon from "./PixelIcon"

// Lo que está al aire. Es una radio: no se elige tema ni se adelanta, se sintoniza.
export const NOW_PLAYING = {
  title: "MERENGOTHICA HALLOWEEN MIX 2025",
  artist: "Nhil Ov Curse",
  file: "/mixes/track1.mp3",
}

export type RadioHandle = { connect: () => void }

// Todos escuchan el mismo momento: la posición sale del reloj, no de cuándo entraste
const livePosition = (duration: number) => (Date.now() / 1000) % duration

export default function MusicBar({ ref }: { ref?: Ref<RadioHandle> }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const syncPending = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [tuning, setTuning] = useState(false)
  const [volume, setVolume] = useState(70)
  const [muted, setMuted] = useState(false)

  // Conectar = saltar al punto en vivo y sonar. Se llama dentro del click para que el navegador deje reproducir.
  const connect = () => {
    const audio = audioRef.current
    if (!audio) return
    if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = livePosition(audio.duration)
    else syncPending.current = true
    setTuning(true)
    audio.play().catch(() => setTuning(false))
  }

  useImperativeHandle(ref, () => ({ connect }))

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onMeta = () => {
      if (syncPending.current) {
        syncPending.current = false
        audio.currentTime = livePosition(audio.duration)
      }
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => {
      setIsPlaying(false)
      setTuning(false)
    }
    const onWaiting = () => setTuning(true)
    const onPlaying = () => setTuning(false)

    audio.addEventListener("loadedmetadata", onMeta)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("waiting", onWaiting)
    audio.addEventListener("playing", onPlaying)
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("waiting", onWaiting)
      audio.removeEventListener("playing", onPlaying)
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100
      audioRef.current.muted = muted
    }
  }, [volume, muted])

  const toggle = () => {
    if (isPlaying) audioRef.current?.pause()
    else connect()
  }

  const label = `${NOW_PLAYING.title} · ${NOW_PLAYING.artist}`

  return (
    <div
      role="region"
      aria-label="Radio"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-5"
    >
      <audio ref={audioRef} src={NOW_PLAYING.file} preload="metadata" loop />

      <div className="ts-px-panel pointer-events-auto relative mx-auto flex h-9 max-w-2xl items-center gap-2.5 pl-1.5 pr-2 font-mono sm:gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? "Desconectar" : "Conectar"}
          title={isPlaying ? "desconectar" : undefined}
          className={`ts-px-btn h-6 gap-1.5 px-2 text-[10px] uppercase tracking-[0.15em] ${isPlaying ? "" : "ts-px-btn--primary"}`}
        >
          {isPlaying ? (
            <>
              <span className="ts-onair h-1.5 w-1.5 bg-[#ff3b3b]" aria-hidden="true" />
              {tuning ? "sintonizando" : "en vivo"}
            </>
          ) : (
            "conectar"
          )}
        </button>

        <p className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-white sm:text-[11px]" title={label}>
          {isPlaying ? (
            <span className="ts-marquee">
              <span className="pr-10">{label}</span>
              <span className="pr-10" aria-hidden="true">
                {label}
              </span>
            </span>
          ) : (
            <span className="block truncate">{label}</span>
          )}
        </p>

        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Activar sonido" : "Silenciar"}
          className="ts-px-btn h-6 w-6"
        >
          <PixelIcon name={muted || volume === 0 ? "mute" : "sound"} className="h-3 w-3" />
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={muted ? 0 : volume}
          aria-label="Volumen"
          onChange={(e) => {
            setVolume(Number(e.target.value))
            setMuted(false)
          }}
          className="ts-range hidden w-14 sm:block"
          style={{ "--fill": `${muted ? 0 : volume}%` } as CSSProperties}
        />
      </div>
    </div>
  )
}
