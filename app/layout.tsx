import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import localFont from "next/font/local"
import { Analytics } from "@vercel/analytics/next"
import BootScreen from "@/components/BootScreen"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })
// La letra de tropi.OS: un mapa de bits de 16 px (ver .ts-os en globals.css). Es DotGothic16 recortada al latín,
// a 革命 y a los símbolos de la interfaz: la de Google trae 120 trozos de japonés que inflaban el CSS.
// Un kanji nuevo en la interfaz sale con otra letra hasta rehacer el archivo (pyftsubset sobre la original)
const dot = localFont({ src: "./fonts/DotGothic16-tropi.woff2", weight: "400", variable: "--font-dot" })

export const metadata: Metadata = {
  title: "Tropical Sadness 革命",
  description:
    "Where sadness meets sunshine. Vaporwave art collective exploring nostalgia, music, and tropical aesthetics.",
  generator: "Next.js",
}

// Sin zoom con los dedos: en el celular pellizcar la página la descuadraba (el zoom del 3D es propio)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${dot.variable} bg-black`}>
      <body className={`font-sans antialiased bg-black`}>
        {children}
        <BootScreen />
        <Analytics />
      </body>
    </html>
  )
}
