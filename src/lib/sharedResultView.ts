import { getTranslations } from "next-intl/server"
import type { Locale } from "@/i18n/config"
import type { SharedResult } from "@/core/sharedResult"

export type ResultTile = { label: string; value: string; unit: string }

// The four figures of a shared result, labelled as the result screen labels them, for the page and for its image.
export async function sharedResultTiles(result: SharedResult, locale: Locale): Promise<ResultTile[]> {
  const t = await getTranslations({ locale, namespace: "practice.result" })
  const writing = result.mode === "writing"
  return [
    { label: t("time"), value: result.time.toFixed(2), unit: t("seconds") },
    { label: t("accuracy"), value: String(result.accuracy), unit: "%" },
    { label: t("speed"), value: result.speed === null ? "—" : String(result.speed), unit: t(writing ? "wordSpeedUnit" : "speedUnit") },
    { label: t("words"), value: String(result.words), unit: t("wordUnit", { count: result.words }) },
  ]
}

// The mode's badge, or null for a normal run.
export async function sharedResultMode(result: SharedResult, locale: Locale): Promise<string | null> {
  if (result.mode === "normal") return null
  const t = await getTranslations({ locale, namespace: "practice" })
  return result.mode === "writing" ? t("modeWriting") : t("recall.resultHeading")
}
