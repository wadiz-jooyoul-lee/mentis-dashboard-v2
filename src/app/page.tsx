import Link from "next/link";
import Image from "next/image";
import SectionGrid from "@/components/SectionGrid";
import BackupStatus from "@/components/BackupStatus";
import { sections } from "@/lib/sections";
import { orchestrationCardStats } from "@/lib/orchestration";
import { getBackupStatus } from "@/lib/backup";
import heroImage from "@/assets/home-hero.webp";

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
      {/* 카드 아래 마무리 일러스트. 좁은 화면에서는 폭에 맞춰 줄어든다(maxWidth 560이 상한). */}
      <div style={{ maxWidth: 560, margin: "40px auto 0" }}>
        <Image
          src={heroImage}
          alt="대기·분석·구현·리뷰·완료 다섯 단계가 적힌 보드 앞에서 각 단계를 맡은 에이전트들이 일하는 일러스트"
          sizes="(max-width: 608px) 100vw, 560px"
          style={{
            width: "100%",
            height: "auto",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        />
      </div>
      <div style={{ textAlign: "center", marginTop: 24, display: "flex", gap: 20, justifyContent: "center" }}>
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
