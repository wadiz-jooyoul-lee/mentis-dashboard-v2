import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import path from "node:path";
import { isDemoMode, readDemoState } from "@/lib/demo";
import { denyRemote } from "@/lib/localOnly";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCRIPT = path.join(process.cwd(), "scripts", "demo", "demo-play.sh");
const ACTIONS = new Set(["start", "next", "reset", "clean"]);

function play(action: string): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile("bash", [SCRIPT, action], { timeout: 60_000, encoding: "utf8" }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (err ? stderr || stdout || String(err) : stdout).trim() });
    });
  });
}

/** 현재 데모 단계. 데모 모드가 아니면 demo:false 만 준다(오피스 데모 바가 이걸 보고 숨는다). */
export async function GET() {
  if (!isDemoMode()) return NextResponse.json({ demo: false });
  return NextResponse.json({ demo: true, state: readDemoState() });
}

/** 데모 진행: { action: "start" | "next" | "reset" | "clean" }. 데모 모드에서만 동작. */
export async function POST(req: NextRequest) {
  const denied = denyRemote(req); // 데모 진행도 이 맥에서만(원격 열람자는 보기만)
  if (denied) return denied;
  if (!isDemoMode()) {
    return NextResponse.json({ ok: false, error: "데모 모드가 아닙니다 (pnpm demo 로 실행하세요)" }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  if (!ACTIONS.has(action)) return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  const r = await play(action);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.out.slice(0, 500) }, { status: 500 });
  return NextResponse.json({ ok: true, message: r.out, state: readDemoState() });
}
