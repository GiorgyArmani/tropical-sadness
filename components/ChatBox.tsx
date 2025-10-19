"use client"

import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isTyping) return

    const userMsg: Message = {
      role: "user",
      content: input,
      id: `user-${Date.now()}`,
    }

    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsTyping(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await response.json()

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response || "Something went wrong! Try again? 🌴",
          id: `assistant-${Date.now()}`,
        },
      ])
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Oops! Connection issues. Try again? 🌊",
          id: `error-${Date.now()}`,
        },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <div className="absolute bottom-20 left-0 right-0 p-4 z-20">
      <div className="max-w-4xl mx-auto">
        <div
          className="border-4 border-white mb-3 p-4 overflow-y-auto"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            maxHeight: "280px",
          }}
        >
          {messages.map((msg) => (
            <div key={msg.id} className={`mb-3 ${msg.role === "user" ? "text-right" : "text-left"}`}>
              <div
                className={`inline-block px-4 py-2 rounded-lg max-w-[80%] ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-pink-500 to-orange-500 text-white"
                    : "bg-blue-100 text-gray-900"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="text-left">
              <div className="inline-block bg-blue-100 px-4 py-2 rounded-lg">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type your message..."
            disabled={isTyping}
            className="flex-1 border-4 border-white px-6 py-4 text-lg font-medium text-white placeholder-white/70 disabled:opacity-50"
            style={{
              backgroundColor: "rgba(91, 192, 222, 0.9)",
              outline: "none",
            }}
          />
          <button
            onClick={handleSend}
            disabled={isTyping || !input.trim()}
            className="border-4 border-white px-8 py-4 font-bold transition-all hover:scale-105 disabled:opacity-50"
            style={{
              backgroundColor: "#FFD700",
              color: "#000",
              minWidth: "80px",
            }}
          >
            {isTyping ? "..." : <Send className="w-6 h-6" />}
          </button>
        </div>
      </div>
    </div>
  )
}
