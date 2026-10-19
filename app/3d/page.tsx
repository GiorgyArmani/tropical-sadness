import type { Metadata } from "next"
import { Suspense } from "react"
import TropicalSadnessLanding from "@/components/TropicalSadnessLanding"

export const metadata: Metadata = {
  title: "Tropical Sadness 革命 · 3d",
  description: "Espacios liminales en ASCII: acércate y el plano se vuelve profundo.",
}

// La misma radio, empezando en los espacios 3D
export default function Page() {
  return (
    <Suspense>
      <TropicalSadnessLanding initialMode="3d" />
    </Suspense>
  )
}
