"use client"

import { ArrowUpRight } from "lucide-react"
import MusicBar from "./MusicBar"
import TideBackground from "./TideBackground"

const BANDCAMP_URL = "https://tropicalsadness.bandcamp.com"

export default function TropicalSadnessLanding() {
  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-black text-white">
      <TideBackground />

      <header className="relative z-10 flex justify-end px-4 pt-5 sm:px-8 sm:pt-7">
        <a
          href={BANDCAMP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex min-h-11 cursor-pointer items-center gap-1.5 border-b border-white/40 px-1 text-sm font-semibold uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:border-[#FFD600] hover:text-[#FFD600] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD600] focus-visible:ring-offset-4 focus-visible:ring-offset-black"
        >
          Bandcamp
          <ArrowUpRight
            className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
          <span className="sr-only">(se abre en una pestaña nueva)</span>
        </a>
      </header>

      <section className="relative z-10 flex min-h-[calc(100dvh-12rem)] items-center justify-center px-4 pb-32">
        <h1 className="sr-only">Tropical Sadness</h1>
        <img
          src="/logo-trim.png"
          alt="Tropical Sadness 革命"
          width={634}
          height={701}
          className="logo-float h-auto w-[min(60vw,300px)] select-none"
          draggable={false}
        />
      </section>

      <MusicBar />
    </main>
  )
}
