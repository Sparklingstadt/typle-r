import { ImageResponse } from "next/og"
import { getTranslations } from "next-intl/server"
import { defaultLocale, isLocale } from "@/i18n/config"
import { fromSharedQuery } from "@/core/sharedResult"
import { sharedResultMode, sharedResultTiles } from "@/lib/sharedResultView"
import { siteUrl } from "@/lib/siteUrl"

// The social card of a shared result (/result): its list name and figures, drawn at request time. The image depends
// only on the query, so the CDN may keep it for good.
const size = { width: 1200, height: 630 }
const cache = "public, max-age=86400, s-maxage=31536000, immutable"
const host = new URL(siteUrl).host

// The families that together cover what a list name may be written in: Japanese and most CJK, simplified and
// traditional Chinese, Korean, and Latin and Cyrillic. Each is fetched cut down to the characters drawn.
const families = ["Noto Sans JP", "Noto Sans SC", "Noto Sans TC", "Noto Sans KR", "Noto Sans"]

async function font(family: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const query = new URLSearchParams({ family: `${family}:wght@700`, text })
    const css = await (await fetch(`https://fonts.googleapis.com/css2?${query}`)).text()
    const url = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/)?.[1]
    if (!url) return null
    const response = await fetch(url)
    return response.ok ? await response.arrayBuffer() : null
  } catch {
    // Without the font the image is still drawn; characters it lacks show as boxes.
    return null
  }
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams
  const result = fromSharedQuery(query)
  if (!result) return new Response("Not found", { status: 404 })
  const lang = query.get("l")
  const locale = isLocale(lang) ? lang : defaultLocale
  const t = await getTranslations({ locale, namespace: "sharedResult" })
  const tiles = await sharedResultTiles(result, locale)
  const mode = await sharedResultMode(result, locale)
  const heading = t("heading", { name: result.name })
  const text = [heading, mode ?? "", `Typle ${host}`, ...tiles.flatMap(tile => [tile.label, tile.value, tile.unit])].join("")
  const loaded = await Promise.all(families.map(async family => ({ family, data: await font(family, text) })))
  const fonts = loaded.flatMap(({ family, data }) => data ? [{ name: family, data, weight: 700 as const, style: "normal" as const }] : [])

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: "#ffffff", color: "#111827", fontFamily: families.join(", ") }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {mode && <div style={{ display: "flex", alignSelf: "flex-start", padding: "6px 18px", borderRadius: 999, background: "#eef2ff", color: "#3730a3", fontSize: 28 }}>{mode}</div>}
        <div style={{ display: "flex", fontSize: 54, lineHeight: 1.25 }}>{heading}</div>
      </div>
      <div style={{ display: "flex", gap: 24 }}>
        {tiles.map(tile => <div key={tile.label} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "24px 28px", border: "2px solid #e5e7eb", borderRadius: 24 }}>
          <div style={{ display: "flex", fontSize: 26, color: "#6b7280" }}>{tile.label}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 64 }}>{tile.value}</span>
            <span style={{ fontSize: 26, color: "#6b7280" }}>{tile.unit}</span>
          </div>
        </div>)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30 }}>
        <span>Typle</span>
        <span style={{ color: "#6b7280" }}>{host}</span>
      </div>
    </div>,
    { ...size, fonts, headers: { "Cache-Control": cache } },
  )
}
