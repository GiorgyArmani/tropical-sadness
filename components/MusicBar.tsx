"use client"

import { useRef, useState, useEffect } from "react"
import { Music, Play, Pause, SkipForward, SkipBack, Volume2 } from "lucide-react"

interface Track {
  title: string
  file: string
}

interface MusicBarProps {
  autoplay?: boolean  // ✅ Nueva prop para autoplay
}

export default function MusicBar({ autoplay = false }: MusicBarProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrack, setCurrentTrack] = useState(0)
  const [volume, setVolume] = useState(70)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const tracks: Track[] = [
    { title: "MERENGOTHICA HALLOWEEN MIX 2025", file: "/mixes/track1.mp3" },
  ]

  // ✅ AUTOPLAY: Inicia automáticamente cuando se activa
  useEffect(() => {
    if (autoplay && audioRef.current) {
      const timer = setTimeout(() => {
        playAudio()
      }, 100)

      return () => clearTimeout(timer)
    }
  }, [autoplay])

  // ✅ Función para iniciar el audio automáticamente
  const playAudio = async () => {
    if (audioRef.current) {
      try {
        await audioRef.current.play()
        setIsPlaying(true)
        console.log("🎵 Audio playing automatically")
      } catch (error) {
        console.log("⚠️ Autoplay was blocked by browser:", error)
        console.log("💡 User needs to click play button manually")
      }
    }
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration)
    const handleEnd = () => handleNext()

    audio.addEventListener("timeupdate", updateTime)
    audio.addEventListener("loadedmetadata", updateDuration)
    audio.addEventListener("ended", handleEnd)

    return () => {
      audio.removeEventListener("timeupdate", updateTime)
      audio.removeEventListener("loadedmetadata", updateDuration)
      audio.removeEventListener("ended", handleEnd)
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100
    }
  }, [volume])

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleNext = () => {
    setCurrentTrack((prev) => (prev + 1) % tracks.length)
    setIsPlaying(true)
    setTimeout(() => audioRef.current?.play(), 100)
  }

  const handlePrev = () => {
    setCurrentTrack((prev) => (prev - 1 + tracks.length) % tracks.length)
    setIsPlaying(true)
    setTimeout(() => audioRef.current?.play(), 100)
  }

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 border-t-4 border-white px-6 py-3 z-40"
      style={{ backgroundColor: "rgba(91, 192, 222, 0.1)" }}
    >
      <audio ref={audioRef} src={tracks[currentTrack].file} />

      <div className="max-w-7xl mx-auto flex items-center gap-4">
        {/* Track Info */}
        <div className="flex items-center gap-3 min-w-[200px]">
          <Music className="w-6 h-6 text-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate">{tracks[currentTrack].title}</p>
            <p className="text-white/70 text-xs">Nhil Ov Curse</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button onClick={handlePrev} className="text-white hover:text-yellow-400 transition-colors">
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center hover:bg-yellow-400 transition-all transform hover:scale-110"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-gray-900" />
            ) : (
              <Play className="w-5 h-5 text-gray-900 ml-0.5" />
            )}
          </button>

          <button onClick={handleNext} className="text-white hover:text-yellow-400 transition-colors">
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="flex-1 flex items-center gap-3">
          <span className="text-white/70 text-xs min-w-[40px]">{formatTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={(e) => {
              const audio = audioRef.current
              if (audio) audio.currentTime = Number(e.target.value)
            }}
            className="flex-1 h-1 bg-white/30 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #FFD700 0%, #FFD700 ${(currentTime / duration) * 100}%, rgba(255,255,255,0.3) ${(currentTime / duration) * 100}%, rgba(255,255,255,0.3) 100%)`,
            }}
          />
          <span className="text-white/70 text-xs min-w-[40px]">{formatTime(duration)}</span>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2 min-w-[120px]">
          <Volume2 className="w-4 h-4 text-white flex-shrink-0" />
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="flex-1 h-1 bg-white/30 rounded-full appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  )
}