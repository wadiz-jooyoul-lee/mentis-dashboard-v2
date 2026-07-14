import { NextRequest, NextResponse } from "next/server";
import {
  startOrder,
  startExplain,
  startQuips,
  resumeOrder,
  stopOrder,
  archiveJob,
  unarchiveJob,
  listJobs,
  listArchivedJobs,
  setPending,
  clearPending,
  applyPending,
  getJobStatus,
  jobResultText,
  JOB_ID_RE,
} from "@/lib/jobs";
import { getConsole } from "@/lib/transcript";
import { readQuips, orderSignature, staleSlugs } from "@/lib/quips";
import { ORDER_KEY_RE } from "@/lib/keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 실행/재개/복원.
 * - 실행: { target } — 이슈 키·URL·문서·요구사항(+ base=/agents=/mode=). dobby-order 뒤에 그대로 전달.
 * - 재개/복원: { key, resume|unarchive } — key는 잡 id.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const jobId = String(body?.key ?? "").trim();

  // 구현 내용(explainer.md) 생성: /dobby-explain {키}
  if (body?.explain) {
    const r = startExplain(String(body?.key ?? ""));
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
    return NextResponse.json({ ok: true, key: r.jobId }, { status: 202 });
  }

  // 아바타 소감(재미기능) 생성: /avatar-quips {키} [슬러그...]
  if (body?.quips) {
    const slugs = Array.isArray(body?.slugs) ? body.slugs.map(String) : undefined;
    const r = startQuips(String(body?.key ?? ""), slugs);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
    return NextResponse.json({ ok: true, key: r.jobId }, { status: 202 });
  }

  // 잡 조작(예약/이어서/복원/자동주입)은 잡 id로.
  const isJobOp =
    body?.unarchive || body?.resume || body?.queue || body?.unqueue || body?.applyPending;
  if (isJobOp) {
    if (!JOB_ID_RE.test(jobId)) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
    }
    const message = typeof body?.message === "string" ? body.message : undefined;

    // 예약: 실행 중에도 저장 가능(다음 턴에 자동 주입)
    if (body?.queue) {
      const ok = setPending(jobId, message ?? "");
      return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
    }
    if (body?.unqueue) {
      clearPending(jobId);
      return NextResponse.json({ ok: true });
    }

    const r = body?.unarchive
      ? unarchiveJob(jobId)
      : body?.applyPending
      ? applyPending(jobId)
      : resumeOrder(jobId, message);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
    return NextResponse.json({ ok: true, key: jobId }, { status: 202 });
  }

  // 실행: target(자유 입력) 또는 레거시 key
  const target = String(body?.target ?? body?.key ?? "").trim();
  if (!target) {
    return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  }
  const r = startOrder(target);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
  return NextResponse.json({ ok: true, key: r.jobId }, { status: 202 });
}

/** 정지(기본) 또는 보관(action=archive). 데이터는 삭제하지 않는다. */
export async function DELETE(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get("key") ?? "").trim();
  const action = req.nextUrl.searchParams.get("action");
  if (!JOB_ID_RE.test(key)) {
    return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
  }
  const r = action === "archive" ? archiveJob(key) : stopOrder(key);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * 조회. key 없으면 활성+보관 목록.
 * key 있으면 통합 콘솔: agent 지정 시 서브에이전트 기록, 아니면 잡 실시간→없으면 세션 기록.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // 아바타 소감 상태: ?quips={오더키} → 파일 유무·서명·최신여부·잡 상태
  const quipsKey = (sp.get("quips") ?? "").trim();
  if (quipsKey) {
    if (!ORDER_KEY_RE.test(quipsKey)) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
    }
    const f = readQuips(quipsKey);
    const currentSig = orderSignature(quipsKey);
    const job = getJobStatus(`quips-${quipsKey}`);
    // 다시 만들 대상(소감 없음 + 추가 작업함). 하나라도 있으면 stale.
    const slugs = staleSlugs(quipsKey);
    const stale = slugs.length > 0;
    // 잡이 끝났는데(성공/실패) 여전히 대상이 남아 있으면 실패로 보고 원인(잡 result)을 함께 준다.
    const failedNoResult =
      (job.state === "failed" || job.state === "done" || job.state === "stopped") && stale;
    return NextResponse.json({
      hasFile: !!f,
      fileSig: f?.sig ?? null,
      currentSig,
      stale,
      staleSlugs: slugs,
      jobState: job.state,
      reason: failedNoResult ? jobResultText(`quips-${quipsKey}`) : null,
    });
  }

  const key = (sp.get("key") ?? "").trim();
  if (!key) {
    return NextResponse.json({ jobs: listJobs(), archived: listArchivedJobs() });
  }
  if (!JOB_ID_RE.test(key)) {
    return NextResponse.json({ state: "none" });
  }
  const agent = sp.get("agent")?.trim() || undefined;
  const phase = sp.get("phase")?.trim() || undefined;
  const source = sp.get("source") === "session" ? "session" : undefined;
  return NextResponse.json(getConsole(key, { source, agent, phase }));
}
