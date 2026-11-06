import { List } from "lucide-react"
import { GuideSection, Points, Topic, useGuideText } from "@/components/Guide/GuideParts"

export default function ListsSection() {
  const { t, rich } = useGuideText()
  return <GuideSection id="lists" icon={List} title={t("contents.lists")} lead={rich("lists.lead")}>
    <Topic title={t("lists.packs.title")}>
      <Points>
        <li>{t("lists.packs.p1")}</li>
        <li>{t("lists.packs.p2")}</li>
        <li>{t("lists.packs.p3")}</li>
        <li>{t("lists.packs.p4")}</li>
      </Points>
    </Topic>
    <Topic title={t("lists.files.title")}>
      <Points>
        <li>{t("lists.files.p1")}</li>
        <li>{t("lists.files.p2")}</li>
        <li>{t("lists.files.p3")}</li>
        <li>{t("lists.files.p4")}</li>
      </Points>
    </Topic>
    <Topic title={t("lists.interests.title")}>
      <Points>
        <li>{rich("lists.interests.p1")}</li>
        <li>{t("lists.interests.p2")}</li>
        <li>{t("lists.interests.p3")}</li>
        <li>{t("lists.interests.p4")}</li>
      </Points>
    </Topic>
    <Topic title={t("lists.share.title")}>
      <Points>
        <li>{t("lists.share.p1")}</li>
        <li>{t("lists.share.p2")}</li>
        <li>{t("lists.share.p3")}</li>
        <li>{t("lists.share.p4")}</li>
        <li>{t("lists.share.p5")}</li>
        <li>{t("lists.share.p6")}</li>
        <li>{t("lists.share.p7")}</li>
      </Points>
    </Topic>
    <Topic title={t("lists.input.title")}>
      <Points>
        <li>{t("lists.input.p1")}</li>
        <li>{t("lists.input.p2")}</li>
        <li>{rich("lists.input.p3")}</li>
        <li>{rich("lists.input.p4")}</li>
      </Points>
    </Topic>
    <Topic title={t("lists.cannotSave.title")}>
      <Points>
        <li>{t("lists.cannotSave.p1")}</li>
        <li>{t("lists.cannotSave.p2")}</li>
        <li>{t("lists.cannotSave.p3")}</li>
        <li>{rich("lists.cannotSave.p4")}</li>
      </Points>
    </Topic>
    <Topic title={t("lists.manage.title")}>
      <Points>
        <li>{rich("lists.manage.p1")}</li>
        <li>{t("lists.manage.p2")}</li>
        <li>{t("lists.manage.p3")}</li>
      </Points>
    </Topic>
    <Topic title={t("lists.csv.title")}>
      <Points>
        <li>{t("lists.csv.p1")}</li>
        <li>{t("lists.csv.p2")}</li>
        <li>{t("lists.csv.p3")}</li>
      </Points>
      <pre aria-label={t("lists.csv.exampleLabel")} className="mt-3 overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-[13px] leading-6">{t("lists.csv.example")}</pre>
    </Topic>
  </GuideSection>
}
