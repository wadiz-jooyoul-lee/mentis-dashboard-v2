import { NextResponse } from "next/server";
import { jobsRun, jobsStatus } from "@/lib/dobbyJobs";
import { denyRemote } from "@/lib/localOnly";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: 팀 이슈 조사 상태(실행 중, 마지막 성공, 다음 자동 조사). */
export async function GET() {
  return NextResponse.json((await jobsStatus()) ?? { installed: false });
}

/** POST: 지금 조사. 이미 돌고 있으면 시작하지 않는다. */
export async function POST(req: Request) {
  const denied = denyRemote(req);
  if (denied) return denied;
  return NextResponse.json({ result: await jobsRun() }, { status: 202 });
}
