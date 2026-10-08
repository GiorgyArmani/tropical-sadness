// Recuadro de redes al estilo de las colecciones de arte ASCII: borde, título y lista con ">"

const LINKS = [
  { label: "bandcamp", href: "https://tropicalsadness.bandcamp.com", featured: true },
  { label: "instagram", href: "https://www.instagram.com/tropical.sadness.crew/" },
  { label: "soundcloud", href: "https://soundcloud.com/tropicalsadness" },
  { label: "facebook", href: "https://www.facebook.com/tropicalsadness" },
  { label: "vk", href: "https://vk.ru/tropicalsadness" },
  { label: "youtube", href: "https://www.youtube.com/channel/UCGipiTbdHIXTjG8QdsEPIwQ" },
]

export default function SocialLinks({ className = "" }: { className?: string }) {
  return (
    <nav
      aria-label="Redes de Tropical Sadness"
      className={`ts-px-panel w-fit px-2.5 py-1.5 font-mono text-[11px] text-white sm:min-w-40 sm:px-3 sm:py-2.5 sm:text-xs ${className}`}
    >
      <p className="hidden border-b border-dotted border-white/60 pb-1.5 text-center font-bold tracking-wide sm:block">redes</p>
      <ul className="flex max-w-[22rem] flex-wrap justify-center gap-x-2.5 gap-y-0.5 sm:mt-2 sm:max-w-none sm:flex-col sm:gap-y-1.5">
        {LINKS.map((link) => (
          <li key={link.label}>
            <span className="text-white/60" aria-hidden="true">
              &gt;{" "}
            </span>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`cursor-pointer underline underline-offset-2 transition-colors duration-200 hover:text-[#FFD600] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD600] focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                link.featured ? "font-bold text-[#FFD600]" : "text-[#5cff8a]"
              }`}
            >
              {link.label}
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
            <span className="text-white/60" aria-hidden="true">
              ;
            </span>
          </li>
        ))}
      </ul>
    </nav>
  )
}
