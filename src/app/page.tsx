import SectionGrid from "@/components/SectionGrid";
import { sections } from "@/lib/sections";
import { orchestrationMetricsFor } from "@/lib/orchestration";

export const dynamic = "force-dynamic";

export default function Home() {
  const stats = {
    "orch-code": orchestrationMetricsFor("code"),
    "orch-nonsource": orchestrationMetricsFor("nonsource"),
  };
  return <SectionGrid sections={sections} stats={stats} />;
}
