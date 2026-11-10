"use client"

// El correo de bienvenida lleva el avatar de quien llega. Cuando la cuenta confirma su email por primera
// vez (lo avisa profile.ts), acá se dibuja su avatar fuera de la vista con el motor de siempre, se le
// saca una foto y se manda: el servidor arma el correo con ella (app/api/bienvenida).

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { lookOf, type Look } from "./ascii3d/engine/avatars"
import { WELCOME_EVENT, sendWelcome } from "./profile"

const AvatarPreview = dynamic(() => import("./ascii3d/AvatarPreview"), { ssr: false })

export default function WelcomeMail({ nick, look }: { nick: string; look: Look | null }) {
  const [due, setDue] = useState(false)
  const busy = useRef(false) // el aviso puede repetirse mientras se manda: va de a uno
  useEffect(() => {
    const onDue = () => !busy.current && setDue(true)
    window.addEventListener(WELCOME_EVENT, onDue)
    return () => window.removeEventListener(WELCOME_EVENT, onDue)
  }, [])

  if (!due || !nick) return null
  return (
    <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 h-[360px] w-[300px] opacity-0">
      <AvatarPreview
        look={look ?? lookOf(nick)}
        className="h-full w-full"
        onShot={(shot) => {
          busy.current = true
          setDue(false)
          sendWelcome(shot).finally(() => (busy.current = false))
        }}
      />
    </div>
  )
}
