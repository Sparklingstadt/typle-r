"use client"

import { RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"

// Reloads the page, for a failure that only a fresh load can clear.
function ReloadButton({ children }: { children: React.ReactNode }) {
  return <Button variant="outline" size="lg" onClick={() => window.location.reload()}><RotateCw aria-hidden="true" />{children}</Button>
}

export { ReloadButton }
