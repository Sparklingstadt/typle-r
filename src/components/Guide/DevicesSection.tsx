import { Monitor } from "lucide-react"
import { GuideSection, Points, useGuideText } from "@/components/Guide/GuideParts"

export default function DevicesSection() {
  const { t, rich } = useGuideText()
  return <GuideSection id="devices" icon={Monitor} title={t("contents.devices")} lead={rich("devices.lead")}>
    <Points>
      <li>{t("devices.p1")}</li>
      <li>{t("devices.p2")}</li>
      <li>{t("devices.p3")}</li>
    </Points>
  </GuideSection>
}
