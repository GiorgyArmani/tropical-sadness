import OsIcon, { type OsIconName } from "./OsIcon"

// Las redes son la barra de vínculos del navegador: siempre a la vista, debajo de la dirección.
// En el celular no entran todas: la fila se desliza hacia los costados (lo avisa el » del final).

const LINKS: { label: string; href: string; icon: OsIconName; featured?: boolean }[] = [
  { label: "bandcamp", href: "https://tropicalsadness.bandcamp.com", icon: "cassette", featured: true },
  { label: "instagram", href: "https://www.instagram.com/tropical.sadness.crew/", icon: "camera" },
  { label: "soundcloud", href: "https://soundcloud.com/tropicalsadness", icon: "cloud" },
  { label: "facebook", href: "https://www.facebook.com/tropicalsadness", icon: "face" },
  { label: "vk", href: "https://vk.ru/tropicalsadness", icon: "doll" },
  { label: "youtube", href: "https://www.youtube.com/channel/UCGipiTbdHIXTjG8QdsEPIwQ", icon: "tv" },
]

export default function SocialLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Redes de Tropical Sadness" className={`flex items-center gap-1 ${className}`}>
      <p aria-hidden="true" className="hidden shrink-0 px-1 sm:block">
        vínculos
      </p>
      {/* relative: los textos para lectores de pantalla quedan adentro de la fila que se desliza */}
      <ul className="relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {LINKS.map((link) => (
          <li key={link.label} className="shrink-0">
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`ts-link ${link.featured ? "ts-link--featured ts-bold" : ""}`}
            >
              <OsIcon name={link.icon} />
              {link.label}
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          </li>
        ))}
      </ul>
      <span aria-hidden="true" className="shrink-0 px-0.5 sm:hidden">
        »
      </span>
    </nav>
  )
}
