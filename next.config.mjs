/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // El correo de bienvenida adjunta estas imágenes leyéndolas del disco: tienen que viajar con la función
  outputFileTracingIncludes: {
    "/api/bienvenida": ["./app/api/bienvenida/*.png"],
  },
  experimental: {
    agentUpgrade: "security",
  },
}

export default nextConfig
