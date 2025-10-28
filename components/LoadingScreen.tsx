"use client"

import { useEffect, useState } from "react"

interface LoadingScreenProps {
  onComplete: () => void
}

export default function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setTimeout(onComplete, 300)
          return 100
        }
        return prev + 2
      })
    }, 30)

    return () => clearInterval(interval)
  }, [onComplete])

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center transition-opacity duration-500"
      style={{
        backgroundColor: "#5BC0DE",
        opacity: progress >= 100 ? 0 : 1,
        pointerEvents: progress >= 100 ? "none" : "auto",
      }}
    >
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-yellow-300 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-pink-300 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "0.5s" }}
        />
      </div>

      <div className="relative z-10 text-center">
        {/* 🎨 Logo con efecto de sombra */}
        <div className="mb-8 animate-pulse flex justify-center">
          <img
            src="/logo.png"
            alt="Tropical Sadness"
            className="w-auto h-100 object-contain"
            style={{
              filter: "drop-shadow(4px 4px 0 #E94E77) drop-shadow(8px 8px 0 rgba(0,0,0,0.2))",
            }}
          />
        </div>

        <div className="w-64 h-2 bg-white/30 rounded-full overflow-hidden mx-auto">
          <div
            className="h-full bg-gradient-to-r from-yellow-400 to-pink-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-white font-bold mt-4 text-lg">Loading... {progress}%</p>
      </div>
    </div>
  )
}