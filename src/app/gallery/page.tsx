"use client"
import { Suspense } from "react"
import { PageMain } from "@/components/ui/page-layout"
import GalleryLoading from "@/components/Gallery/GalleryLoading"
import GalleryView from "@/components/Gallery/GalleryView"

// The gallery is public: this page sits outside the (workspace) group, so it opens without a login or the workspace gate.
// useSearchParams makes the page client-rendered up to the Suspense boundary, so the boundary wraps just the part that reads it.
export default function GalleryPage() {
  return <PageMain width="medium">
    <Suspense fallback={<GalleryLoading />}><GalleryView /></Suspense>
  </PageMain>
}
