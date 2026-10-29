import { NextRequest, NextResponse } from "next/server";
import {
  startDo,
  startExplain,
  startRetro,
  startDataSpec,
  startDataRun,
  startQuips,
  resumeOrder,
  stopOrder,
  archiveJob,
  unarchiveJob,
  listJobs,
  setPending,
  clearPending,
  applyPending,
  getJobStatus,
  jobResultText,
  startJiraSnapshot,
  startJiraClean,
  startJiraComments,
  startJiraEnrich,
  startJiraPost,
  startResolve,
  startV2Run,
  v2RunCheck,
  JOB_ID_RE,
} from "@/lib/jobs";
import {
  saveJiraEnrichDraft,
  prTargets,
  existingPrs,
  readOrderSession,
  readRunContent,
} from "@/lib/orchestration";
import { getConsole, consoleLiveness } from "@/lib/transcript";
import { denyRemote } from "@/lib/localOnly";
import { worktreeInfo, removeWorktrees } from "@/lib/worktree";
import { readQuips, orderSignature, staleSlugs } from "@/lib/quips";
import { ORDER_KEY_RE, isOrderKey } from "@/lib/keys";
import { setPin } from "@/lib/pins";
import { nextActions, runNextAction, type NextAction } from "@/lib/nextAction";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 실행/재개/복원.
 * - 실행: { target } — 이슈 키·URL·문서·요구사항(+ base=/agents=/mode=). dobby-order 뒤에 그대로 전달.
 * - 재개/복원: { key, resume|unarchive } — key는 잡 id.
 */
export async function POST(req: NextRequest) {
  const denied = denyRemote(req); // 실행·변경은 이 맥 전용(분기 13개를 입구에서 한 번에)
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const jobId = String(body?.key ?? "").trim();

  // 구현 내용(explainer.md) 생성: /dobby-explain {키}
  if (body?.explain) {
    const r = startExplain(String(body?.key ?? ""));
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
    return NextResponse.json({ ok: true, key: r.jobId }, { status: 202 });
  }

  // 회고(retro.md) 생성: /dobby-retro {키} [regen]
  if (body?.retro) {
    const r = startRetro(String(body?.key ?? ""), !!body?.regen);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
    return NextResponse.json({ ok: true, key: r.jobId }, { status: 202 });
  }

  // 데이터 탭: { data: "spec" | "run", key } — /dobby-data spec|run {키}
  if (body?.data === "spec" || body?.data === "run") {
    const k = String(body?.key ?? "");
    const r = body.data === "spec" ? startDataSpec(k) : startDataRun(k);
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

  // 해결 표시/취소: /dobby-resolve {키} [undo] 백그라운드 실행(목록의 "해결 처리"/"해결 취소" 버튼).
  if (body?.resolve) {
    const r = startResolve(String(body?.key ?? ""), body?.undo === true);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
    return NextResponse.json({ ok: true, key: r.jobId }, { status: 202 });
  }

  // 목록 핀 고정/해제: { pin: true|false, key }.
  if (typeof body?.pin === "boolean") {
    const k = String(body?.key ?? "");
    if (!isOrderKey(k)) return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
    return NextResponse.json({ ok: true, pins: setPin(k, body.pin) });
  }

  // v2 자동 실행: 설계가 확정된 /do 오더를 run.sh 로 통합까지 진행. go-dobby dobby_v2_autorun 이 부른다.
  if (body?.v2run) {
    const r = startV2Run(String(body?.key ?? ""));
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
    return NextResponse.json({ ok: true, key: r.jobId }, { status: 202 });
  }

  // 다음 할 일 버튼: { next: 동작, key, env? } — 셸 헬퍼로 상태를 바꾸고 필요하면 자동 실행을 띄운다.
  if (body?.next) {
    const r = await runNextAction(String(body?.key ?? ""), String(body.next) as NextAction, body?.env ? String(body.env) : undefined);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
    return NextResponse.json({ ok: true, key: r.jobId ?? null }, { status: 202 });
  }

  // 워크트리 삭제(dobby-end와 동일 절차): 제거 전 code-changes/ 스냅샷 + 브랜치 보존.
  // 안전 조건(미푸시 커밋 없음·워크트리 실재)은 removeWorktrees가 다시 확인한다.
  if (body?.worktreeDelete) {
    const r = await removeWorktrees(String(body?.key ?? ""));
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 409 });
    return NextResponse.json({ ok: true, removed: r.removed, snapshot: r.snapshot });
  }

  // Jira 탭: 생성(clean/comments/enrich)·게시(post)·초안 저장. 전부 사용자 버튼 트리거.
  if (body?.jira) {
    const k = String(body?.key ?? "");
    const act = String(body.jira);
    if (act === "save") {
      const s = saveJiraEnrichDraft(k, String(body?.text ?? ""));
      return NextResponse.json({ ok: s.ok, error: s.reason }, { status: s.ok ? 200 : 400 });
    }
    const r =
      act === "snapshot"
        ? startJiraSnapshot(k)
        : act === "clean"
        ? startJiraClean(k)
        : act === "comments"
        ? startJiraComments(k)
        : act === "enrich"
        ? startJiraEnrich(k)
        : act === "post"
        ? startJiraPost(k, body?.target === "desc" ? "desc" : "comment")
        : null;
    if (!r) return NextResponse.json({ ok: false, error: "bad_jira_action" }, { status: 400 });
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

  // 실행: `/do {target} auto [env=]` 설계 세션 → 같은 잡에서 run.sh 자동 실행
  const target = String(body?.target ?? body?.key ?? "").trim();
  if (!target) {
    return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  }
  const r = startDo(target, String(body?.env ?? ""));
  if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 409 });
  return NextResponse.json({ ok: true, key: r.jobId }, { status: 202 });
}

/** 정지(기본) 또는 보관(action=archive). 데이터는 삭제하지 않는다. */
export async function DELETE(req: NextRequest) {
  const denied = denyRemote(req); // 정지·보관도 이 맥 전용
  if (denied) return denied;
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
  // 검증 탭 회차 본문(지연 로딩) — 페이지는 최신 회차만 싣고, 다른 회차를 고르면 여기서 받는다.
  const runKey = (sp.get("run") ?? "").trim();
  if (runKey) {
    if (!ORDER_KEY_RE.test(runKey)) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
    }
    const content = readRunContent(runKey, (sp.get("id") ?? "").trim());
    if (content === null) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, content });
  }

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

  // 콘솔 목록·보드 카드의 진행 중 표시: ?consoleLive={오더키}
  //  → { live: { 콘솔id: 진행중여부 }, latest: { 슬러그: 가장 최근 콘솔id } }
  //  &agentsOnly=1 (보드): 서브 콘솔만 판정한다.
  const liveKey = (sp.get("consoleLive") ?? "").trim();
  if (liveKey) {
    if (!ORDER_KEY_RE.test(liveKey)) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
    }
    return NextResponse.json(consoleLiveness(liveKey, sp.get("agentsOnly") === "1"));
  }

  // 잡 결과 조회: ?jobResult={잡id} → 상태 + 마지막 result 텍스트(실패 표면화용)
  const jobResultKey = (sp.get("jobResult") ?? "").trim();
  if (jobResultKey) {
    if (!JOB_ID_RE.test(jobResultKey)) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
    }
    const job = getJobStatus(jobResultKey);
    return NextResponse.json({ state: job.state, result: jobResultText(jobResultKey) });
  }

  // PR 생성 링크 대상: ?prTargets={오더키} → [{repo, branch, repoUrl}]
  const prKey = (sp.get("prTargets") ?? "").trim();
  if (prKey) {
    if (!ORDER_KEY_RE.test(prKey)) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
    }
    return NextResponse.json({ targets: prTargets(prKey) });
  }

  // 이미 만들어진 환경별 PR: ?prExisting={오더키} → { prs: { "{repo}|{branch}": [...] } }
  const prExKey = (sp.get("prExisting") ?? "").trim();
  if (prExKey) {
    if (!ORDER_KEY_RE.test(prExKey)) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
    }
    return NextResponse.json({ prs: await existingPrs(prExKey) });
  }

  // v2 자동 실행 가능 여부: ?v2run={오더키} → { ok, reason, running }. go-dobby dobby_v2_autorun 이 부른다.
  const v2Key = (sp.get("v2run") ?? "").trim();
  if (v2Key) return NextResponse.json(v2RunCheck(v2Key));

  // 다음 할 일(알림 카드·목록·오더 띠): ?next=1[&fresh=1] → { items, error, at }. fresh 는 서버 저장분을 건너뛴다.
  if (sp.get("next") === "1") return NextResponse.json(await nextActions(sp.get("fresh") === "1"));

  // 이어가기 v2: ?session={오더키} → { sessionId, sessionName, restore, worktrees, isV2 } (status.md)
  const sessionKey = (sp.get("session") ?? "").trim();
  if (sessionKey) {
    if (!ORDER_KEY_RE.test(sessionKey)) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
    }
    return NextResponse.json(readOrderSession(sessionKey));
  }

  // 워크트리 삭제 가능 여부: ?worktree={오더키} → { worktrees, removable, reason }
  // 목록 전체에 대해 미리 계산하면 오더마다 git 호출이 붙어 느려지므로, 버튼에 마우스를
  // 올렸을 때만 이 API를 부른다(지연 확인).
  const wtKey = (sp.get("worktree") ?? "").trim();
  if (wtKey) {
    if (!ORDER_KEY_RE.test(wtKey)) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
    }
    return NextResponse.json(await worktreeInfo(wtKey));
  }

  const key = (sp.get("key") ?? "").trim();
  if (!key) {
    return NextResponse.json({ jobs: listJobs() });
  }
  if (!JOB_ID_RE.test(key)) {
    return NextResponse.json({ state: "none" });
  }
  const agent = sp.get("agent")?.trim() || undefined;
  const phase = sp.get("phase")?.trim() || undefined;
  const source = sp.get("source") === "session" ? "session" : undefined;
  return NextResponse.json(getConsole(key, { source, agent, phase }));
}
