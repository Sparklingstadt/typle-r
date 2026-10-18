"use client"
import { Fragment } from 'react'
import { useWordLists } from '@/lib/useWordLists'

// Keyed by the workspace's account, so no screen keeps drafts or selections from another one.
export default function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { accountId } = useWordLists()
  return <Fragment key={accountId}>{children}</Fragment>
}
