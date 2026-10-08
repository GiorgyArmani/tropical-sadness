"use client"

import { useRef, useState, useEffect, type CSSProperties } from "react"
import PixelIcon from "./PixelIcon"

interface Track {
  title: string
  artist: string
  file: string
}

interface MusicBarProps {
  autoplay?: boolean
}

const tracks: Track[] = [
  { title: "MERENGOTHICA HALLOWEEN MIX 2025", artist: "Nhil Ov Curse", file: "/mixes/track1.mp3" },
]

const formatTime = (time: number) => {
  if (!Number.isFinite(time)) return "0:00"
  const mins = Math.floor(time / 60)
  const secs = Math.floor(time % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export default function MusicBar({ autoplay = false }: MusicBarProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrack, setCurrentTrack] = useState(0)
  const [volume, setVolume] = useState(70)
  const [muted, setMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const hasMultiple = tracks.length > 1
  const progress = duration ? (currentTime / duration) * 100 : 0

  useEffect(() => {
    if (!autoplay) return
    audioRef.current?.play().catch(() => {
      // El navegador bloqueó el autoplay; el usuario puede darle play manualmente
    })
  }, [autoplay])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTime = () => setCurrentTime(audio.currentTime)
    const onMeta = () => setDuration(audio.duration)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnd = () => {
      if (hasMultiple) setCurrentTrack((prev) => (prev + 1) % tracks.length)
    }

    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("loadedmetadata", onMeta)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("ended", onEnd)
    return () => {
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("loadedmetadata", onMeta)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("ended", onEnd)
    }
  }, [hasMultiple])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100
      audioRef.current.muted = muted
    }
  }, [volume, muted])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  }

  const changeTrack = (dir: 1 | -1) => {
    setCurrentTrack((prev) => (prev + dir + tracks.length) % tracks.length)
    setTimeout(() => audioRef.current?.play().catch(() => {}), 100)
  }

  const track = tracks[currentTrack]

  const label = `${track.title} · ${track.artist}`

  return (
    <div
      role="region"
      aria-label="Reproductor de música"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-5"
    >
      <audio ref={audioRef} src={track.file} preload="metadata" />

      <div className="ts-px-panel relative mx-auto flex h-9 max-w-2xl items-center gap-2.5 pl-1.5 pr-2 font-mono sm:gap-3">
        {/* Barra de progreso como borde superior del panel */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step="any"
          value={currentTime}
          aria-label="Posición de la pista"
          aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
          onChange={(e) => {
            if (audioRef.current) audioRef.current.currentTime = Number(e.target.value)
          }}
          className="ts-range absolute inset-x-0 -top-3 w-full"
          style={{ "--fill": `${progress}%` } as CSSProperties}
        />

        {hasMultiple && (
          <button type="button" onClick={() => changeTrack(-1)} aria-label="Pista anterior" className="ts-px-btn h-6 w-6">
            <PixelIcon name="prev" className="h-2.5 w-2.5" />
          </button>
        )}

        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
          className="ts-px-btn ts-px-btn--primary h-6 w-6"
        >
          <PixelIcon name={isPlaying ? "pause" : "play"} className="h-3 w-3" />
        </button>

        {hasMultiple && (
          <button type="button" onClick={() => changeTrack(1)} aria-label="Siguiente pista" className="ts-px-btn h-6 w-6">
            <PixelIcon name="next" className="h-2.5 w-2.5" />
          </button>
        )}

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

        <span className="flex-shrink-0 text-[10px] tabular-nums text-white/70">
          {formatTime(currentTime)}
          <span className="hidden sm:inline"> / {formatTime(duration)}</span>
        </span>

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
