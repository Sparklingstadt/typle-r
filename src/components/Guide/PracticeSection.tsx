import { Keyboard } from "lucide-react"
import { ColorLegend, GuideSection, Points, Topic, useGuideText } from "@/components/Guide/GuideParts"

export default function PracticeSection() {
  const { t, rich } = useGuideText()
  return <GuideSection id="practice" icon={Keyboard} title={t("contents.practice")} lead={rich("practice.lead")}>
    <Topic title={t("practice.colors.title")}>
      <ColorLegend />
      <p className="mt-3">{rich("practice.colors.text")}</p>
    </Topic>
    <Topic title={t("practice.flow.title")}>
      <Points>
        <li>{t("practice.flow.p1")}</li>
        <li>{t("practice.flow.p2")}</li>
        <li>{t("practice.flow.p3")}</li>
        <li>{t("practice.flow.p4")}</li>
        <li>{t("practice.flow.p5")}</li>
        <li>{t("practice.flow.p6")}</li>
      </Points>
    </Topic>
    <Topic title={t("practice.choose.title")}>
      <Points>
        <li>{t("practice.choose.p1")}</li>
        <li>{t("practice.choose.p2")}</li>
        <li>{rich("practice.choose.p3")}</li>
        <li>{rich("practice.choose.p4")}</li>
      </Points>
    </Topic>
    <Topic title={t("practice.writing.title")}>
      <Points>
        <li>{t("practice.writing.p1")}</li>
        <li>{t("practice.writing.p2")}</li>
        <li>{rich("practice.writing.p3")}</li>
        <li>{t("practice.writing.p4")}</li>
      </Points>
    </Topic>
  </GuideSection>
}
