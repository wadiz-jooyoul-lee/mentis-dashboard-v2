import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { denyRemote } from "@/lib/localOnly";
import { getMetaDir } from "@/lib/issues";
import { isRunning, startDesign } from "@/lib/jobs";
import { ORDER_KEY_RE } from "@/lib/keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 설계 문서(design.md) 저장 + 생성 잡 실행. 대시보드의 첫 "메타 쓰기" API라
 * 이 맥 전용(denyRemote) + 실행 중 잠금 + mtime 충돌 감지를 전부 건다.
 *
 * - { key, save: true, content, baseMtime } → design.md 저장.
 *   · 오더 잡 또는 design 잡이 실행 중이면 409 job_running (오케스트레이터와 동시 쓰기 방지)
 *   · baseMtime ≠ 현재 파일 mtime이면 409 conflict (다른 곳에서 바뀜 — 버튼 잠금이 놓친 틈의 안전망)
 *   · force: true 면 mtime 검사 생략(사용자가 "그래도 덮어쓰기"를 눌렀을 때)
 * - { key, generate: "design"|"outcome", regen? } → /dobby-design 백그라운드 실행.
 */
export async function POST(req: NextRequest) {
  const denied = denyRemote(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const key = String(body?.key ?? "").trim();
  if (!ORDER_KEY_RE.test(key)) {
    return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
  }

  if (body?.generate) {
    const kind = body.generate === "outcome" ? "outcome" : "design";
    const r = startDesign(key, kind, body?.regen === true);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
    return NextResponse.json({ ok: true, key: r.jobId }, { status: 202 });
  }

  if (body?.save) {
    const content = String(body?.content ?? "");
    if (!content.trim()) {
      return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
    }
    if (isRunning(key) || isRunning(`design-${key}`)) {
      return NextResponse.json({ ok: false, error: "job_running" }, { status: 409 });
    }
    const file = path.join(getMetaDir(), key, "design.md");
    if (!fs.existsSync(path.dirname(file))) {
      return NextResponse.json({ ok: false, error: "no_order" }, { status: 404 });
    }
    // 충돌 감지: 화면이 읽은 시점(baseMtime) 이후 파일이 바뀌었으면 덮어쓰지 않는다.
    if (body?.force !== true && fs.existsSync(file)) {
      const cur = fs.statSync(file).mtimeMs;
      const base = Number(body?.baseMtime ?? 0);
      if (base && Math.abs(cur - base) > 1) {
        return NextResponse.json({ ok: false, error: "conflict" }, { status: 409 });
      }
    }
    fs.writeFileSync(file, content.endsWith("\n") ? content : content + "\n");
    return NextResponse.json({ ok: true, mtime: fs.statSync(file).mtimeMs });
  }

  return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
}
