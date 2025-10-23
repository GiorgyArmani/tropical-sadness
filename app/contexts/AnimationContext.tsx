"use client"

import { createContext, useContext, useState, ReactNode } from "react"

type AnimationType = "idle" | "wave" | "dance" | "talk" | "thinking" | "happy"

interface AnimationContextType {
  currentAnimation: AnimationType
  setAnimation: (anim: AnimationType) => void
  analyzeMessageAndAnimate: (message: string) => void
}

const AnimationContext = createContext<AnimationContextType | undefined>(undefined)

export function AnimationProvider({ children }: { children: ReactNode }) {
  const [currentAnimation, setCurrentAnimation] = useState<AnimationType>("idle")

  const setAnimation = (anim: AnimationType) => {
    setCurrentAnimation(anim)
    // Dispatch event for VRMCharacter to listen
    window.dispatchEvent(new CustomEvent("playAnimation", { detail: anim }))
  }

  // Analizar contenido del mensaje y elegir animación
  const analyzeMessageAndAnimate = (message: string) => {
    const lowerMessage = message.toLowerCase()

    // Saludos
    if (
      lowerMessage.includes("hola") ||
      lowerMessage.includes("hello") ||
      lowerMessage.includes("hi") ||
      lowerMessage.includes("hey") ||
      lowerMessage.includes("buenos") ||
      lowerMessage.includes("good morning")
    ) {
      setAnimation("wave")
      // Volver a idle después de 3 segundos
      setTimeout(() => setAnimation("idle"), 3000)
      return
    }

    // Música, baile, fiesta
    if (
      lowerMessage.includes("music") ||
      lowerMessage.includes("dance") ||
      lowerMessage.includes("baila") ||
      lowerMessage.includes("música") ||
      lowerMessage.includes("party") ||
      lowerMessage.includes("fiesta")
    ) {
      setAnimation("dance")
      setTimeout(() => setAnimation("idle"), 5000)
      return
    }

    // Emociones positivas
    if (
      lowerMessage.includes("genial") ||
      lowerMessage.includes("great") ||
      lowerMessage.includes("awesome") ||
      lowerMessage.includes("amazing") ||
      lowerMessage.includes("love") ||
      lowerMessage.includes("cool") ||
      lowerMessage.includes("gracias") ||
      lowerMessage.includes("thank")
    ) {
      setAnimation("happy")
      setTimeout(() => setAnimation("idle"), 3000)
      return
    }

    // Preguntas (thinking)
    if (
      lowerMessage.includes("?") ||
      lowerMessage.includes("how") ||
      lowerMessage.includes("what") ||
      lowerMessage.includes("why") ||
      lowerMessage.includes("cómo") ||
      lowerMessage.includes("qué") ||
      lowerMessage.includes("por qué")
    ) {
      setAnimation("thinking")
      setTimeout(() => setAnimation("talk"), 2000)
      setTimeout(() => setAnimation("idle"), 5000)
      return
    }

    // Default: talk
    setAnimation("talk")
    setTimeout(() => setAnimation("idle"), 4000)
  }

  return (
    <AnimationContext.Provider value={{ currentAnimation, setAnimation, analyzeMessageAndAnimate }}>
      {children}
    </AnimationContext.Provider>
  )
}

export function useAnimation() {
  const context = useContext(AnimationContext)
  if (!context) {
    throw new Error("useAnimation must be used within AnimationProvider")
  }
  return context
}