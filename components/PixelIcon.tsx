// Íconos pixel-art de 8×8 para los botones estilo videojuego point & click

const PATHS = {
  play: "M2 0h2v8H2zM4 1h1v6H4zM5 2h1v4H5zM6 3h1v2H6z",
  pause: "M1 1h2v6H1zM5 1h2v6H5z",
  next: "M1 1h1v6H1zM2 2h1v4H2zM3 3h1v2H3zM5 1h2v6H5z",
  prev: "M1 1h2v6H1zM6 1h1v6H6zM5 2h1v4H5zM4 3h1v2H4z",
  left: "M5 0h1v8H5zM4 1h1v6H4zM3 2h1v4H3zM2 3h1v2H2z",
  right: "M2 0h1v8H2zM3 1h1v6H3zM4 2h1v4H4zM5 3h1v2H5z",
  sound: "M0 3h1v2H0zM1 2h1v4H1zM2 1h2v6H2zM5 2h1v1H5zM5 5h1v1H5zM6 3h1v2H6z",
  mute: "M0 3h1v2H0zM1 2h1v4H1zM2 1h2v6H2zM5 2h1v1H5zM7 2h1v1H7zM6 3h1v2H6zM5 5h1v1H5zM7 5h1v1H7z",
  close: "M1 1h1v1H1zM6 1h1v1H6zM2 2h1v1H2zM5 2h1v1H5zM3 3h2v2H3zM2 5h1v1H2zM5 5h1v1H5zM1 6h1v1H1zM6 6h1v1H6z",
  chat: "M0 1h8v5H0zM1 6h2v1H1zM1 7h1v1H1z",
} as const

export type PixelIconName = keyof typeof PATHS

export default function PixelIcon({ name, className = "h-3 w-3" }: { name: PixelIconName; className?: string }) {
  return (
    <svg viewBox="0 0 8 8" className={className} shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}
