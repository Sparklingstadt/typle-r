"use client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import LegacyImport from "@/components/LegacyImport"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { useTranslations } from "next-intl"
import Page from "@/components/Page/Page"
import PageContainer from "@/components/PageContainer/PageContainer"
import { useWordLists } from "@/lib/useWordLists"
import { GUEST_ACCOUNT_ID } from "@/lib/guestWorkspace"
import Dashboard from "@/components/Dashboard/Dashboard"

export default function Home() {
  const t = useTranslations("home")
  const common = useTranslations("common")
  const { lists, accountId, ready, error, saving, update } = useWordLists()
  const count = lists.reduce((total, list) => total + list.records.length, 0)
  return <Page><PageContainer>
    {error && <Alert variant="destructive" className="mb-6"><AlertDescription>{error}</AlertDescription></Alert>}
    {!ready ? <p>{common("loading")}</p> : count ? <Dashboard lists={lists} guest={accountId === GUEST_ACCOUNT_ID} /> : <>
      <h1 className="text-3xl mb-4">{t("welcome.title")}</h1>
      <p className="mb-6">{t("welcome.text")}</p>
      <div className="flex flex-wrap gap-3 mb-6"><Badge variant="secondary">{t("welcome.lists", { count: lists.length })}</Badge><Badge variant="secondary">{t("welcome.practices", { count })}</Badge></div>
      <nav aria-label={t("welcome.navLabel")} className="flex gap-4 flex-wrap">
        <Button asChild><Link href="/play">{t("welcome.play")}</Link></Button>
        <Button asChild variant="outline"><Link href="/create">{t("welcome.create")}</Link></Button>
        <Button asChild variant="outline"><Link href="/records">{t("welcome.records")}</Link></Button>
      </nav>
    </>}
    <p className="mt-8">{t("storage")}</p>
    <LegacyImport update={update} disabled={!ready || saving} />
    <p className="mt-4">{t.rich("links", {
      guide: chunks => <Link className="underline" href="/guide">{chunks}</Link>,
      about: chunks => <Link className="underline" href="/about">{chunks}</Link>,
    })}</p>
  </PageContainer></Page>
}
