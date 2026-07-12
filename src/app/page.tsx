import SectionGrid from "@/components/SectionGrid";
import { sections } from "@/lib/sections";
import { getSectionStats } from "@/lib/lifecycle";
import { orchestrationMetrics } from "@/lib/orchestration";

export const dynamic = "force-dynamic";

export default function Home() {
  const stats = {
    ...getSectionStats(),
    orchestration: orchestrationMetrics(),
  };
  return <SectionGrid sections={sections} stats={stats} />;
}
