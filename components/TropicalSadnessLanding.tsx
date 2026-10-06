"use client"

import MusicBar from "./MusicBar"
import AsciiIsland from "./AsciiIsland"
import SocialLinks from "./SocialLinks"

export default function TropicalSadnessLanding() {
  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-black text-white">
      <AsciiIsland />

      {/* Redes: centradas arriba en móvil, en la esquina superior derecha en desktop */}
      <header className="relative z-20 flex justify-center px-4 pt-4 sm:absolute sm:right-8 sm:top-7 sm:block sm:px-0 sm:pt-0">
        <SocialLinks />
      </header>

      <section className="relative z-10 flex justify-center px-4 pt-3 sm:pt-[6vh]">
        <h1 className="sr-only">Tropical Sadness</h1>
        <img
          src="/logo-trim.png"
          alt="Tropical Sadness 革命"
          width={634}
          height={701}
          className="logo-float h-auto w-[min(46vw,210px)] select-none"
          draggable={false}
        />
      </section>

      <MusicBar />
    </main>
  )
}
