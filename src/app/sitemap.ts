import type { MetadataRoute } from "next"
import { sitemapEntries } from "@/core/searchIndex"
import { siteUrl } from "@/lib/siteUrl"

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(siteUrl)
}
