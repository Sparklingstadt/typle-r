import type { MetadataRoute } from "next"
import { sitemapEntries } from "@/core/searchIndex"
import { siteUrl } from "@/lib/siteUrl"
import { officialPackPagePaths } from "@/plugins/packs/pages"

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(siteUrl, officialPackPagePaths())
}
