import type { MetadataRoute } from "next"
import { robotsRules } from "@/core/searchIndex"
import { siteUrl } from "@/lib/siteUrl"

export default function robots(): MetadataRoute.Robots {
  return robotsRules(siteUrl)
}
