import { CircleAlert } from "lucide-react"

// The message under a field. `alert` announces it when it appears, for messages that come without the user moving there.
export default function FieldError({ id, message, alert }: { id: string; message: string; alert?: boolean }) {
  return <p id={id} role={alert ? "alert" : undefined} className="flex items-start gap-1.5 text-sm text-destructive">
    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{message}
  </p>
}
