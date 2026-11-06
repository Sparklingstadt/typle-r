import { History } from "lucide-react"
import { GuideSection, Points, Topic, useGuideText } from "@/components/Guide/GuideParts"

export default function RecordsSection() {
  const { t, rich } = useGuideText()
  return <GuideSection id="records" icon={History} title={t("contents.records")} lead={t("records.lead")}>
    <Topic title={t("records.complete.title")}>
      <Points>
        <li>{t("records.complete.p1")}</li>
        <li>{t("records.complete.p2")}</li>
        <li>{t("records.complete.p3")}</li>
        <li>{rich("records.complete.p4")}</li>
      </Points>
    </Topic>
    <Topic title={t("records.history.title")}>
      <Points>
        <li>{rich("records.history.p1")}</li>
        <li>{t("records.history.p2")}</li>
        <li>{t("records.history.p3")}</li>
      </Points>
    </Topic>
    <Topic title={t("records.best.title")}>
      <Points>
        <li>{rich("records.best.p1")}</li>
        <li>{t("records.best.p2")}</li>
        <li>{t("records.best.p3")}</li>
      </Points>
    </Topic>
    <Topic title={t("records.wordCount.title")}>
      <Points>
        <li id="word-count">{t("records.wordCount.p1")}</li>
        <li>{t("records.wordCount.p2")}</li>
      </Points>
    </Topic>
    <Topic title={t("records.home.title")}>
      <p>{rich("records.home.text")}</p>
    </Topic>
  </GuideSection>
}
