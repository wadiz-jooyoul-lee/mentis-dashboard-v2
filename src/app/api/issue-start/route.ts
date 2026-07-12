import { NextRequest, NextResponse } from "next/server";
import {
  startIssueStart,
  resumeIssueStart,
  stopIssueStart,
  archiveJob,
  unarchiveJob,
  getJobStatus,
  listJobs,
  listArchivedJobs,
  ISSUE_KEY_RE,
} from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 실행/재개/복원 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const key = String(body?.key ?? "").trim().toUpperCase();
  if (!ISSUE_KEY_RE.test(key)) {
    return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
  }
  const r = body?.unarchive
    ? unarchiveJob(key)
    : body?.resume
    ? resumeIssueStart(key)
    : startIssueStart(key);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
  }
  return NextResponse.json({ ok: true, key }, { status: 202 });
}

/** 정지(기본) 또는 보관(action=archive). 데이터는 삭제하지 않는다. */
export async function DELETE(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get("key") ?? "").trim().toUpperCase();
  const action = req.nextUrl.searchParams.get("action");
  if (!ISSUE_KEY_RE.test(key)) {
    return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
  }
  const r = action === "archive" ? archiveJob(key) : stopIssueStart(key);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

/** 조회. key 있으면 단건, 없으면 활성+보관 목록. */
export async function GET(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get("key") ?? "").trim().toUpperCase();
  if (!key) {
    return NextResponse.json({
      jobs: listJobs(),
      archived: listArchivedJobs(),
    });
  }
  if (!ISSUE_KEY_RE.test(key)) {
    return NextResponse.json({ state: "none" });
  }
  return NextResponse.json(getJobStatus(key));
}
