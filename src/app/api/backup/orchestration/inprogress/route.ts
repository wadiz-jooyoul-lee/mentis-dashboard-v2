import { NextResponse } from "next/server";
import { getInProgressStatus, maybeRunInProgressBackup } from "@/lib/orchestrationBackup";
import { denyRemote } from "@/lib/localOnly";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: 진행중 백업 현황(오늘 회차 보유 여부·다음 회차). 읽기만 한다. */
export async function GET() {
  const s = getInProgressStatus();
  return NextResponse.json({
    today: s.today,
    has: s.has,
    dueSlot: s.dueSlot,
    due: s.due,
    running: s.running,
    archives: s.archives.length,
    totalBytes: s.totalBytes,
    keepDays: s.keepDays,
  });
}

/**
 * POST: 있어야 할 회차가 없으면 만든다(있으면 아무것도 안 함).
 * 대시보드가 30초마다 두드리는 트리거라 멱등해야 하고, 실패해도 화면을 막지 않는다.
 */
export async function POST(req: Request) {
  const denied = denyRemote(req); // 백업 실행은 이 맥 전용
  if (denied) return denied;
  // ?manual=1 은 화면의 "지금 실행" 버튼. 회차 시각 전이라도 그날 첫 회차로 만든다.
  const manual = new URL(req.url).searchParams.get("manual") === "1";
  const r = maybeRunInProgressBackup(new Date(), manual);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
