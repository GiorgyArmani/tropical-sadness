import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

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
    <html lang="es" className="bg-black">
      <body className={`font-sans antialiased bg-black`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
