"use client"

import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
// 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta las siguientes líneas:
// import { useAnimation } from "@/contexts/AnimationContext"

interface Message {
  role: "user" | "assistant"
  content: string
  id: string
}

export default function ChatBox() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Epaaa 🌴 soy Lovadiela, la musa digital de *Tropical Sadness* 💫 ¿Quieres hablar de arte, música o solo vibe un ratico conmigo? 😌",
      id: "welcome",
    },
  ])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta:
  // const { setAnimation, analyzeMessageAndAnimate } = useAnimation()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta:
  // const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   setInput(e.target.value)
  //   if (e.target.value.length === 1) {
  //     setAnimation("idle")
  //   }
  // }

  const handleSend = async () => {
    if (!input.trim() || isTyping) return

    const userMsg: Message = {
      role: "user",
      content: input,
      id: `user-${Date.now()}`,
    }

    setMessages((prev) => [...prev, userMsg])
    const userMessage = input
    setInput("")

    // 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta:
    // analyzeMessageAndAnimate(userMessage)

    setIsTyping(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await response.json()

      // 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta:
      // setAnimation("talk")

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response || "Something went wrong! Try again? 🌴",
          id: `assistant-${Date.now()}`,
        },
      ])

      // 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta:
      // setTimeout(() => {
      //   analyzeMessageAndAnimate(data.response)
      // }, 1000)

    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Oops! Connection issues. Try again? 🌊",
          id: `error-${Date.now()}`,
        },
      ])
      // 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta:
      // setAnimation("idle")
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <div className="absolute bottom-20 left-0 right-0 p-4 z-20">
      {/* 📏 Ancho reducido de max-w-4xl a max-w-2xl */}
      <div className="max-w-2xl mx-auto">
        {/* 📏 Altura reducida de 320px a 220px y padding reducido */}
        <div className="mb-2 p-2 overflow-y-auto" style={{ maxHeight: "220px" }}>
          {messages.map((msg, index) => (
            <div 
              key={msg.id} 
              className={`mb-3 ${msg.role === "user" ? "text-right" : "text-left"} animate-fade-in`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div
                className={`inline-block px-4 py-2 rounded-2xl max-w-[75%] shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl ${
                  msg.role === "user"
                    ? "bg-white/95 text-black floating-message-right"
                    : "bg-blue-100/95 text-gray-900 floating-message-left"
                }`}
                style={{
                  boxShadow: msg.role === "user" 
                    ? "0 8px 32px rgba(46, 247, 63, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.3)"
                    : "0 8px 32px rgba(91, 192, 222, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.3)",
                }}
              >
                {/* 📏 Tamaño de fuente reducido de text-base a text-sm */}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="text-left animate-fade-in">
              <div 
                className="inline-block bg-blue-100/95 px-4 py-2 rounded-2xl shadow-lg backdrop-blur-sm floating-message-left"
                style={{
                  boxShadow: "0 8px 32px rgba(91, 192, 222, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.3)"
                }}
              >
                <div className="flex gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div 
          className="flex gap-2 p-2 rounded-2xl backdrop-blur-md"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.2)"
          }}
        >
          <input
            type="text"
            value={input}
            // 🎭 ANIMACIONES DESACTIVADAS - Para activar, cambia onChange={handleInputChange}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type your message..."
            disabled={isTyping}
            // 📏 Padding reducido de px-6 py-4 a px-4 py-3 y tamaño de fuente de text-lg a text-base
            className="flex-1 rounded-xl border-0 px-4 py-3 text-base font-medium text-white placeholder-white/70 disabled:opacity-50 transition-all focus:scale-[1.01]"
            style={{
              backgroundColor: "rgba(91, 192, 222, 0)",
              outline: "none",
              boxShadow: "inset 0 2px 8px rgba(36, 21, 21, 0.1)"
            }}
          />
          <button
            onClick={handleSend}
            disabled={isTyping || !input.trim()}
            // 📏 Padding reducido de px-8 py-4 a px-6 py-3
            className="rounded-xl px-6 py-3 font-bold transition-all hover:scale-110 disabled:opacity-50 disabled:hover:scale-100 active:scale-95"
            style={{
              backgroundColor: "#2ef73f",
              color: "#ffffff",
              minWidth: "60px",
              boxShadow: "0 4px 20px rgba(46, 247, 63, 0.4)"
            }}
          >
            {isTyping ? (
              <div className="flex gap-1 justify-center">
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
              </div>
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

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

        @keyframes floatLeft {
          0%, 100% {
            transform: translateY(0px) translateX(0px);
          }
          50% {
            transform: translateY(-5px) translateX(-2px);
          }
        }

        @keyframes floatRight {
          0%, 100% {
            transform: translateY(0px) translateX(0px);
          }
          50% {
            transform: translateY(-5px) translateX(2px);
          }
        }

        .animate-fade-in {
          animation: fadeIn 0.5s ease-out forwards;
        }

        .floating-message-left {
          animation: floatLeft 3s ease-in-out infinite;
        }

        .floating-message-right {
          animation: floatRight 3s ease-in-out infinite;
          animation-delay: 0.5s;
        }
      `}</style>
    </div>
  )
}