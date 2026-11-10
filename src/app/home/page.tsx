"use client"
import { ErrorAlert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { PageMain } from "@/components/ui/page-layout"
import { useWordLists } from "@/lib/useWordLists"
import Dashboard from "@/components/Dashboard/Dashboard"

export default function Home() {
  const t = useTranslations("home")
  const common = useTranslations("common")
  const { lists, storage, ready, error } = useWordLists()
  const count = lists.reduce((total, list) => total + list.records.length, 0)
  return <PageMain width="wide">
    {error && <ErrorAlert className="mb-6">{error}</ErrorAlert>}
    {!ready ? <p>{common("loading")}</p> : count ? <Dashboard lists={lists} storage={storage} /> : <>
      <h1 className="text-3xl mb-4">{t("welcome.title")}</h1>
      <p className="mb-6">{t("welcome.text")}</p>
      <div className="flex flex-wrap gap-3 mb-6"><Badge variant="secondary">{t("welcome.lists", { count: lists.length })}</Badge><Badge variant="secondary">{t("welcome.practices", { count })}</Badge></div>
      <nav aria-label={t("welcome.navLabel")} className="flex gap-4 flex-wrap">
        <Button asChild><Link href="/play">{t("welcome.play")}</Link></Button>
        <Button asChild variant="outline"><Link href="/create">{t("welcome.create")}</Link></Button>
        <Button asChild variant="link"><Link href="/records">{t("welcome.records")}</Link></Button>
      </nav>
    </>}
    <p className="mt-8">{t(storage === "account" ? "storageAccount" : "storage")}</p>
    <p className="mt-4">{t.rich("links", {
      guide: chunks => <Link className="underline" href="/guide">{chunks}</Link>,
      about: chunks => <Link className="underline" href="/about">{chunks}</Link>,
    })}</p>
  </PageMain>
}
