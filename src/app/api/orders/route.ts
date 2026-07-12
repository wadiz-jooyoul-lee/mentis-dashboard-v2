import { NextRequest, NextResponse } from "next/server";
import {
  startOrder,
  resumeOrder,
  stopOrder,
  archiveJob,
  unarchiveJob,
  getJobStatus,
  listJobs,
  listArchivedJobs,
  JOB_ID_RE,
} from "@/lib/jobs";

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

  if (body?.unarchive || body?.resume) {
    if (!JOB_ID_RE.test(jobId)) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
    }
    const r = body?.unarchive ? unarchiveJob(jobId) : resumeOrder(jobId);
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

/** 조회. key 있으면 단건, 없으면 활성+보관 목록. */
export async function GET(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get("key") ?? "").trim();
  if (!key) {
    return NextResponse.json({ jobs: listJobs(), archived: listArchivedJobs() });
  }
  if (!JOB_ID_RE.test(key)) {
    return NextResponse.json({ state: "none" });
  }
  return NextResponse.json(getJobStatus(key));
}
