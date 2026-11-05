"use client"
import { useParams } from "next/navigation"
import { PageMain } from "@/components/ui/page-layout"
import { SharedEnded, SharedFailed, SharedLoading } from "@/components/Shared/SharedStates"
import { useSharedPack } from "@/lib/useSharedPack"
import SharedPackView from "@/components/Shared/SharedPackView"

// A shared pack is public: this page sits outside the (workspace) group, so it opens without a login or the workspace
// gate. The root layout's WorkspaceProvider still gives it the signed-in account's library, or the guest's.
export default function SharedPack() {
  const { id } = useParams<{ id: string }>()
  const shared = useSharedPack(id)

  return <PageMain width="narrow">
    {shared.state === 'loading' ? <SharedLoading />
      : shared.state === 'ended' ? <SharedEnded />
      : shared.state === 'failed' ? <SharedFailed reason={shared.reason} />
      : <SharedPackView id={id} file={shared.file} />}
  </PageMain>
}
