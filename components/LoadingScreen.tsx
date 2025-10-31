"use client"

import { useEffect, useState } from "react"

interface LoadingScreenProps {
  onComplete: () => void
}

export default function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [showCTA, setShowCTA] = useState(false)  // ✅ NUEVO

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          // ✅ MODIFICADO: Ahora muestra el botón en lugar de llamar onComplete
          setTimeout(() => setShowCTA(true), 300)
          return 100
        }
        return prev + 2
      })
    }, 30)

    return () => clearInterval(interval)
  }, [onComplete])

  // ✅ NUEVO: Función para manejar el click
  const handleEnter = () => {
    setShowCTA(false)
    setTimeout(onComplete, 300)
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center transition-opacity duration-500"
      style={{
        backgroundColor: "#000000ff",
        opacity: showCTA === false && progress >= 100 ? 0 : 1,  // ✅ MODIFICADO
        pointerEvents: showCTA === false && progress >= 100 ? "none" : "auto",  // ✅ MODIFICADO
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
            src="/CDSLEEVE HALLOWEENMIX.webp"
            alt="MEREGOTHICA"
            className="w-auto h-75 object-contain"
            style={{
              filter: "drop-shadow(4px 4px 0 #E94E77) drop-shadow(8px 8px 0 rgba(0,0,0,0.2))",
            }}
          />
        </div>

        {/* ✅ NUEVO: Renderizado condicional - Barra o Botón */}
        {!showCTA ? (
          // Barra de progreso (como antes)
          <>
            <div className="w-64 h-2 bg-white/30 rounded-full overflow-hidden mx-auto">
              <div
                className="h-full bg-gradient-to-r from-yellow-400 to-pink-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="text-white font-bold mt-4 text-lg">Loading... {progress}%</p>
          </>
        ) : (
          // ✅ NUEVO: Botón CTA
          <div className="animate-fadeIn">
            <button
              onClick={handleEnter}
              className="px-12 py-4 bg-color:red text-white font-bold text-xl rounded-full hover:scale-110 transition-all duration-300 shadow-lg hover:shadow-pink-500/50"
            >
              CLICK AQUI PARA ESPANTAR A LAS HOES
            </button>
          </div>
        )}
      </div>

      {/* ✅ NUEVO: Animación CSS */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  )
}