"use client"

import { useRef, useState, useEffect, type CSSProperties } from "react"
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX } from "lucide-react"

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

  const iconBtn =
    "flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-white/60 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60"

  return (
    <div
      role="region"
      aria-label="Reproductor de música"
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-8"
    >
      <audio ref={audioRef} src={track.file} preload="metadata" />

      <div className="mx-auto flex max-w-3xl items-center gap-3 sm:gap-4">
        {hasMultiple && (
          <button type="button" onClick={() => changeTrack(-1)} aria-label="Pista anterior" className={iconBtn}>
            <SkipBack className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}

        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
          className={`${iconBtn} text-white`}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <Play className="ml-0.5 h-4 w-4" strokeWidth={1.5} />
          )}
        </button>

        {hasMultiple && (
          <button type="button" onClick={() => changeTrack(1)} aria-label="Siguiente pista" className={iconBtn}>
            <SkipForward className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}

        <p className="hidden min-w-0 max-w-[22rem] truncate text-[11px] uppercase tracking-[0.18em] text-white/70 md:block" title={`${track.title} — ${track.artist}`}>
          {track.title}
          <span className="text-white/35"> · {track.artist}</span>
        </p>

        <span className="font-mono text-[10px] tabular-nums text-white/40">{formatTime(currentTime)}</span>
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
          className="ts-range min-w-0 flex-1"
          style={{ "--fill": `${progress}%` } as CSSProperties}
        />
        <span className="font-mono text-[10px] tabular-nums text-white/40">{formatTime(duration)}</span>

        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Activar sonido" : "Silenciar"}
          className={iconBtn}
        >
          {muted || volume === 0 ? (
            <VolumeX className="h-3.5 w-3.5" strokeWidth={1.5} />
          ) : (
            <Volume2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
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
          className="ts-range hidden w-16 sm:block"
          style={{ "--fill": `${muted ? 0 : volume}%` } as CSSProperties}
        />
      </div>
    </div>
  )
}
