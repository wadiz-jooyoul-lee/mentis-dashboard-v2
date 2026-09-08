import { NextResponse } from "next/server";
import {
  getOrchestrationBackupStatus,
  runOrchestrationBackupAll,
} from "@/lib/orchestrationBackup";
import { denyRemote } from "@/lib/localOnly";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: 오케스트레이션 메타 백업 현황(진행 여부·미백업/변경된 폴더 수). */
export async function GET() {
  const s = getOrchestrationBackupStatus();
  // 폴링용이라 목록·로그는 빼고 숫자만 돌려준다(페이지는 서버 렌더로 전체를 받는다).
  return NextResponse.json({
    running: s.running,
    orders: s.orders,
    archives: s.archives.length,
    missing: s.missing,
    stale: s.stale,
    totalBytes: s.totalBytes,
  });
}

/** POST: 전체 훑기(--all) 백그라운드 실행. 진행 중이면 202로 무시. */
export async function POST(req: Request) {
  const denied = denyRemote(req); // 백업 실행은 이 맥 전용
  if (denied) return denied;
  const r = runOrchestrationBackupAll();
  if (!r.ok && r.reason === "already_running") {
    return NextResponse.json({ ok: true, running: true }, { status: 202 });
  }
  if (!r.ok) {
    const msg =
      r.reason === "no_plugin"
        ? "go-dobby 플러그인을 찾지 못했습니다 — /plugin으로 설치/업데이트하세요."
        : r.reason === "no_script"
        ? "백업 스크립트(dobby-meta-backup.sh)가 없습니다 — /plugin으로 go-dobby를 업데이트하세요."
        : "백업 실행에 실패했습니다.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
