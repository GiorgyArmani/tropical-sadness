import { NextResponse, type NextRequest } from "next/server"

// Clima real del visitante para la isla ASCII.
// La ubicación sale de los headers que agrega Vercel (aproximada por IP, sin pedir permiso);
// en local se puede probar con /api/clima?lat=52.52&lon=13.41.
// Devuelve los mismos parámetros que usa el sistema de clima de components/AsciiIsland.tsx.

type OpenMeteo = {
  current?: { weather_code: number; cloud_cover: number; precipitation: number; wind_speed_10m: number }
  daily?: { sunrise: string[]; sunset: string[] }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// Intensidad de lluvia según el código WMO (llovizna, lluvia, chubascos, nieve, tormenta)
const RAIN_BY_CODE: Record<number, number> = {
  51: 0.2, 53: 0.3, 55: 0.4, 56: 0.3, 57: 0.4,
  61: 0.4, 63: 0.6, 65: 0.9, 66: 0.4, 67: 0.7,
  71: 0.25, 73: 0.35, 75: 0.5, 77: 0.25,
  80: 0.5, 81: 0.7, 82: 1, 85: 0.35, 86: 0.5,
  95: 1, 96: 1, 99: 1,
}

// "2026-10-07T07:17" -> 7.28
const hourOf = (iso: string | undefined) => {
  const m = iso?.match(/T(\d{2}):(\d{2})/)
  return m ? Number(m[1]) + Number(m[2]) / 60 : null
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const lat = parseFloat(q.get("lat") ?? request.headers.get("x-vercel-ip-latitude") ?? "")
  const lon = parseFloat(q.get("lon") ?? request.headers.get("x-vercel-ip-longitude") ?? "")
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ ok: false }, { headers: { "Cache-Control": "no-store" } })
  }

  try {
    // Redondeado a ~10 km: visitantes de la misma zona comparten la respuesta cacheada
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(1)}&longitude=${lon.toFixed(1)}` +
      "&current=weather_code,cloud_cover,precipitation,wind_speed_10m&daily=sunrise,sunset&forecast_days=1&timezone=auto"
    const res = await fetch(url, { next: { revalidate: 900 } })
    if (!res.ok) throw new Error(`open-meteo ${res.status}`)
    const data: OpenMeteo = await res.json()
    const cur = data.current
    if (!cur) throw new Error("open-meteo sin datos actuales")

    const code = cur.weather_code
    const storm = code >= 95 ? 1 : 0
    const fog = code === 45 || code === 48 ? 1 : 0
    // precipitation es la suma de los últimos 15 minutos (x4 = mm/h); 4 mm/h ya es lluvia fuerte
    const mmPerHour = cur.precipitation * 4
    const rain = Math.max(RAIN_BY_CODE[code] ?? 0, clamp(mmPerHour / 4, 0, 1))
    const clouds = clamp(Math.max(cur.cloud_cover / 100, rain > 0 ? 0.8 : 0, storm), 0, 1)
    const weather = {
      clouds,
      overcast: clamp(storm ? 0.9 : clouds * 0.55 + rain * 0.35 + fog * 0.4, 0, 0.9),
      rain,
      storm,
      fog: fog || (clouds > 0.9 && rain === 0 ? 0.15 : 0),
      wind: clamp(cur.wind_speed_10m / 45, 0, 1),
    }

    return NextResponse.json(
      {
        ok: true,
        weather,
        code,
        sunrise: hourOf(data.daily?.sunrise[0]),
        sunset: hourOf(data.daily?.sunset[0]),
        city: decodeURIComponent(request.headers.get("x-vercel-ip-city") ?? ""),
      },
      { headers: { "Cache-Control": "private, max-age=900" } },
    )
  } catch {
    return NextResponse.json({ ok: false }, { headers: { "Cache-Control": "no-store" } })
  }
}
