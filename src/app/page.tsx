import Link from "next/link";
import SectionGrid from "@/components/SectionGrid";
import BackupStatus from "@/components/BackupStatus";
import { sections } from "@/lib/sections";
import { orchestrationCardStats } from "@/lib/orchestration";
import { getBackupStatus } from "@/lib/backup";

export const dynamic = "force-dynamic";

export default function Home() {
  const stats = {
    "orch-code": orchestrationCardStats("code"),
    "orch-nonsource": orchestrationCardStats("nonsource"),
  };
  const backup = getBackupStatus();
  return (
    <>
      <BackupStatus initial={backup} />
      <SectionGrid sections={sections} stats={stats} />
      <div style={{ textAlign: "center", marginTop: 40, display: "flex", gap: 20, justifyContent: "center" }}>
        <Link href="/about" style={{ fontSize: 12, color: "#8c8c8c" }}>
          소개(ABOUT) — 동기·아키텍처·기능 →
        </Link>
        <Link href="/map" style={{ fontSize: 12, color: "#8c8c8c" }}>
          대시보드 구성도 — 스킬·파일·화면 관계 →
        </Link>
      </div>
    </>
  );
}
