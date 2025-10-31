"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import LoadingScreen from "./LoadingScreen"
import MusicBar from "./MusicBar"
import ChatBox from "./ChatBox"
import GLBCharacter from "./GLBCharacter"
// 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta:
// import { AnimationProvider } from "@/contexts/AnimationContext"

const FBXCharacter = dynamic(() => import("./GLBCharacter"), {
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
  const [startMusic, setStartMusic] = useState(false)  // ✅ AGREGADO

  // ✅ AGREGADO: Función para activar música después del loading
  const handleLoadingComplete = () => {
    setIsLoading(false)
    setTimeout(() => {
      setStartMusic(true)
      console.log("🎵 Activating autoplay...")
    }, 300)
  }

  if (isLoading) {
    return <LoadingScreen onComplete={handleLoadingComplete} />; // ✅ MODIFICADO
  }

  return (
    // 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta <AnimationProvider> arriba y abajo
    // <AnimationProvider>
    <>
      <div 
        className="relative w-full h-screen overflow-hidden" 
        style={{ 
          backgroundImage: "url('/background.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat"
        }}
      >
        {/* Overlay oscuro opcional para mejor legibilidad */}
        <div className="absolute inset-0 bg-black/45" />

        {/* 🎨 Logo en lugar de texto */}
        <div className="absolute top-8 left-8 z-10 shadow-lg">
           <a href="https://tropicalsadness.bandcamp.com" target="_blank">
          <img
            src="/logo.png"
            alt="Tropical Sadness"
            className="w-auto h-50 object-contain"
            style={{
              filter: "drop-shadow(3px 3px 0 #E94E77) drop-shadow(6px 6px 0 rgba(0,0,0,0.2))",
            }}
          />
        </a>
        </div>
        {/*boton para mix ytube*/}
            <div className="absolute top-8 right-8 z-10">
           <a href="https://youtu.be/CjUkq8HudsM?si=aecMQkkO110KC04y" target="_blank">
          <img
            src="/mixlogo.png"
            alt="Tropical Sadness Mix"
            className="w-auto h-50 object-contain"
            style={{
              filter: "drop-shadow(2px 2px 0 #4A90E2) drop-shadow(4px 4px 0 rgba(0,0,0,0.2))",
            }}
          />
        </a>
        </div>


        {/* Personaje 3D centrado */}

        <div className="absolute inset-0 flex items-center justify-center" style={{ top: "0%", bottom: "0%" }}>
          <div className="w-full max-w-5xl h-full px-8">
            <GLBCharacter />
          </div>
        </div>

        {/* <ChatBox /> */}
        {/* <div>
          <ChatBox />
        </div> */}

        <MusicBar autoplay={startMusic} />  {/* ✅ MODIFICADO */}
      </div>
    </>

 
    // 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta:
    // </AnimationProvider>
  )
}