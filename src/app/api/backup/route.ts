import { NextResponse } from "next/server";
import { getBackupStatus, runBackup } from "@/lib/backup";
import { denyRemote } from "@/lib/localOnly";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: 백업 상태(마지막 백업 시각·미백업 수·진행 여부). */
export async function GET() {
  return NextResponse.json(getBackupStatus());
}

/** POST: 백업 실행(백그라운드). 진행 중이면 202로 무시. */
export async function POST(req: Request) {
  const denied = denyRemote(req); // 백업 실행은 이 맥 전용
  if (denied) return denied;
  const r = runBackup();
  if (!r.ok && r.reason === "already_running") {
    return NextResponse.json({ ok: true, running: true }, { status: 202 });
  }
  if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 202 });
}
