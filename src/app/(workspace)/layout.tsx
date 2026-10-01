import WorkspaceGate from '@/components/WorkspaceGate'
import SaveNotification from '@/components/SaveNotification'
// Notifications sit outside the gate, so a message survives the remount when the profile changes.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SaveNotification><WorkspaceGate>{children}</WorkspaceGate></SaveNotification>
}
