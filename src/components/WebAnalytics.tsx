"use client"
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next"
import { analyticsUrl } from "@/core/analytics"

// beforeSend is a function, so it must be set in a client component rather than the server layout.
function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = analyticsUrl(event.url)
  return url ? { ...event, url } : null
}

// Page views for Vercel Web Analytics. It sets no cookies; the script only runs on Vercel deployments.
export default function WebAnalytics() {
  return <Analytics beforeSend={beforeSend} />
}
