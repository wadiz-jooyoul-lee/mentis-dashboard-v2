import Link from "next/link";
import SectionGrid from "@/components/SectionGrid";
import { sections } from "@/lib/sections";
import { orchestrationCardStats } from "@/lib/orchestration";

export const dynamic = "force-dynamic";

export default function Home() {
  const stats = {
    "orch-code": orchestrationCardStats("code"),
    "orch-nonsource": orchestrationCardStats("nonsource"),
  };
  return (
    <>
      <SectionGrid sections={sections} stats={stats} />
      <div style={{ textAlign: "center", marginTop: 40 }}>
        <Link href="/map" style={{ fontSize: 12, color: "#8c8c8c" }}>
          대시보드 구성도 — 스킬·파일·화면 관계 →
        </Link>
      </div>
    </>
  );
}
