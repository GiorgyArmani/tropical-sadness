"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import LoadingScreen from "./LoadingScreen"
import MusicBar from "./MusicBar"
import ChatBox from "./ChatBox"
// 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta:
// import { AnimationProvider } from "@/contexts/AnimationContext"

const VRMCharacter = dynamic(() => import("./VRMCharacter"), {
  ssr: false,
  loading: () => {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-white text-xl font-bold animate-pulse">
          Loading 3D Character...
        </div>
      </div>
    )
  },
})

export default function TropicalSadnessLanding() {
  const [isLoading, setIsLoading] = useState(true)

  if (isLoading) {
    return <LoadingScreen onComplete={() => setIsLoading(false)} />
  }

  return (
    // 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta <AnimationProvider> arriba y abajo
    // <AnimationProvider>
    <>
      <div 
        className="relative w-full h-screen overflow-hidden" 
        style={{ 
          backgroundImage: "url('/background.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat"
        }}
      >
        {/* Overlay oscuro opcional para mejor legibilidad */}
        <div className="absolute inset-0 bg-black/20" />

        <div className="absolute top-8 left-8 z-10">
          <div
            className="text-5xl font-black tracking-tight"
            style={{
              color: "#FFD700",
              textShadow: "3px 3px 0 #E94E77, 6px 6px 0 rgba(0,0,0,0.2)",
              fontFamily: "Impact, Arial Black, sans-serif",
              letterSpacing: "-2px",
            }}
          >
            TROPICAL
            <br />
            SADNESS
          </div>
          <div className="text-sm text-center font-bold text-white mt-1">
            ★ CREW ★
          </div>
        </div>

        <div className="absolute top-8 right-8 z-10 flex gap-3">
          <a
            href="https://tropicalsadness.bandcamp.com"
            target="_blank"
            rel="noopener noreferrer"
            className="border-4 rounded-lg border-white px-6 py-2 font-bold text-white transition-all hover:scale-105"
            style={{ backgroundColor: "rgba(233, 78, 119, 0.9)" }}
          >
            BANDCAMP
          </a>
        </div>

        <div className="absolute inset-0 flex items-center justify-center" style={{ top: "10%", bottom: "35%" }}>
          <div className="w-full max-w-5xl h-full px-8">
            <VRMCharacter />
          </div>
        </div>

        <ChatBox />

        <MusicBar />
      </div>
    </>
    // 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta:
    // </AnimationProvider>
  )
}