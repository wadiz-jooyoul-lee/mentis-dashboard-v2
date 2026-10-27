/**
 * "다음 할 일" — /do 오더마다 지금 누가 무엇을 해야 하는지. (서버 전용, node I/O)
 * 판정은 go-dobby 의 `dobby_v2_next_all`(셸, 토큰 0)이 하고, 여기서는 불러서 잠시 저장해 두고 버튼 동작을 잇는다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { getMetaDir } from "@/lib/issues";
import { ORDER_KEY_RE } from "@/lib/keys";
import { readOrderSession } from "@/lib/orchestration";
import { resumeCommand, resumeTargets } from "@/lib/resumeCommand";
import { DO_AUTO_ENVS, goDobbyLib, listFinishedV2Runs, startResolve, startV2Run } from "@/lib/jobs";

/** mine 사람이 할 일 있음(MY) · notice 알림만 · auto 자동 진행 중 · wait 날짜나 조건 기다림 · work 터미널에서 작업 중 */
export type NextGroup = "mine" | "notice" | "auto" | "wait" | "work";
export type NextAction = "resolve" | "approve" | "autorun" | "deploy" | "drift" | "";

export type NextItem = {
  key: string;
  title: string;
  phase: string;
  group: NextGroup;
  kind: string;
  text: string;
  /** 이 상태가 된 시각 "YYYY-MM-DD HH:MM" */
  since: string;
  env: string;
  /** 터미널에서 칠 명령(예: /do 키). command 는 워크트리로 옮겨 가 그 명령으로 세션을 여는 한 줄 */
  cmd: string;
  command: string;
  /** 대시보드 안 링크(예: /releases/날짜) */
  link: string;
  action: NextAction;
  /** 자동 실행이 멈춘 이유(최근 24시간 안에 멈췄을 때) */
  note: string;
  /** 판단 요청이면 설계 문서 '확인이 필요했던 것' 절 */
  detail: string;
};

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const CACHE_MS = 20_000;
let cache: { at: number; items: NextItem[]; error: string | null } | null = null;
let inflight: Promise<{ items: NextItem[]; error: string | null }> | null = null;

/** dobby-lib.sh 를 읽고 설정을 불러온 뒤 body 를 실행한다. stdout 을 돌려준다. */
function dobbyBash(body: string, timeoutMs = 60_000): Promise<string> {
  const lib = goDobbyLib();
  if (!lib) return Promise.reject(new Error("go-dobby 플러그인을 찾지 못했습니다"));
  const cfg = path.join(os.homedir(), ".config/go-dobby/config.env");
  const script =
    `source ${shq(cfg)} 2>/dev/null; source ${shq(lib)} 2>/dev/null || exit 4; ` +
    `dobby_load_config >/dev/null 2>&1; [ -n "$ORCHESTRATION_META" ] || exit 3; ${body}`;
  return new Promise((resolve, reject) => {
    execFile("bash", ["-c", script], { encoding: "utf8", timeout: timeoutMs, maxBuffer: 8 << 20 }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || stdout || err.message).trim().split("\n").pop() || err.message;
        reject(Object.assign(new Error(msg), { exitCode: err.code }));
      }
      else resolve(stdout);
    });
  });
}

function decisionDetail(key: string): string {
  try {
    const md = fs.readFileSync(path.join(getMetaDir(), key, "design.md"), "utf8");
    return md.match(/(?:^|\n)##\s*확인이 필요했던 것[^\n]*\n([\s\S]*?)(?=\n##\s|$)/)?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

async function load(): Promise<{ items: NextItem[]; error: string | null }> {
  let out: string;
  try {
    out = await dobbyBash("declare -F dobby_v2_next_all >/dev/null || exit 5; dobby_v2_next_all");
  } catch (e) {
    const err = e as Error & { exitCode?: number };
    return { items: [], error: err.exitCode === 5 ? "go-dobby 플러그인을 업데이트해 주세요(다음 할 일 판정 없음)" : err.message };
  }
  const stopped = new Map(
    listFinishedV2Runs()
      .filter((r) => !r.ok)
      .map((r) => [r.key, (r.result ?? "").replace(/\s*복기:.*$/, "").replace(/^자동 실행 중단:\s*/, "")])
  );
  const items: NextItem[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    let raw: Record<string, string>;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    const key = raw.key ?? "";
    if (!ORDER_KEY_RE.test(key)) continue;
    let command = "";
    if (raw.cmd) {
      const s = readOrderSession(key);
      const t = resumeTargets(s)[0];
      command = t ? resumeCommand(t, key, s.isV2, raw.cmd) : raw.cmd;
    }
    items.push({
      key,
      title: raw.title ?? "",
      phase: raw.phase ?? "",
      group: (raw.group as NextGroup) ?? "mine",
      kind: raw.kind ?? "",
      text: raw.text ?? "",
      since: raw.since ?? "",
      env: raw.env ?? "",
      cmd: raw.cmd ?? "",
      command,
      link: raw.link ?? "",
      action: (raw.action as NextAction) ?? "",
      note: raw.group === "mine" ? stopped.get(key) ?? "" : "",
      detail: raw.kind === "decision" ? decisionDetail(key) : "",
    });
  }
  return { items, error: null };
}

/** 판정 결과. 판정 한 번이 수 초라 20초 동안은 저장해 둔 것을 주고, 동시에 온 요청은 한 번의 판정을 함께 기다린다. */
export async function nextActions(): Promise<{ items: NextItem[]; error: string | null; at: number }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  inflight ??= load().finally(() => {
    inflight = null;
  });
  const r = await inflight;
  cache = { ...r, at: Date.now() };
  return cache;
}

/** 버튼 동작. 셸 헬퍼로 상태를 바꾼 뒤 필요하면 자동 실행(run.sh)을 띄운다. */
export async function runNextAction(
  key: string,
  action: NextAction,
  env?: string
): Promise<{ ok: boolean; reason?: string; jobId?: string }> {
  if (!ORDER_KEY_RE.test(key)) return { ok: false, reason: "잘못된 오더 키입니다" };
  const k = shq(key);
  cache = null;
  try {
    switch (action) {
      case "resolve":
        return startResolve(key);
      case "autorun":
        return startV2Run(key);
      case "approve":
        await dobbyBash(
          `dobby_design_ack ${k} 사용자 >/dev/null && dobby_agent_state ${k} analysis-agent 완료 && ` +
            `dobby_event ${k} "설계 확정 — 대시보드에서 승인, 자동 실행" && dobby_v2_checkpoint ${k} >/dev/null`
        );
        return startV2Run(key);
      case "drift": {
        const r = (await dobbyBash(`dobby_v2_drift_apply ${k}`)).trim();
        if (r === "design") return { ok: false, reason: "설계 문서도 바뀌었습니다. 터미널에서 /do 로 설계를 확인해 주세요" };
        return startV2Run(key);
      }
      case "deploy": {
        const e = env ?? "";
        if (!(DO_AUTO_ENVS as readonly string[]).includes(e)) return { ok: false, reason: "배포 환경은 dev, rc1, rc4 중 하나입니다" };
        // 자동 배포가 중간에 사람을 부르지 않도록 사람만 풀 수 있는 준비를 먼저 본다(auto-mode.md 의 사전 확인).
        const why = (
          await dobbyBash(
            `gh auth status >/dev/null 2>&1 || { echo "gh 로그인이 필요합니다: gh auth login"; exit 0; }; ` +
              `[ -n "\${TEST_LOGIN_PW:-}" ] || { echo "config.env 에 테스트 계정 비밀번호(TEST_LOGIN_PW)가 없습니다"; exit 0; }; ` +
              `if _v2_worktrees ${k} | cut -f1 | grep -qx com.wadiz.web; then s="$(_ship_argo_server ${shq(e)})"; ` +
              `argocd account get-user-info --server "$s" --grpc-web 2>/dev/null | grep -q 'Logged In: *true' || ` +
              `{ echo "argocd 로그인이 필요합니다: argocd login $s --sso --grpc-web"; exit 0; }; fi; ` +
              `dobby_v2_set_env ${k} ${shq(e)}`
          )
        ).trim();
        if (why) return { ok: false, reason: why };
        return startV2Run(key);
      }
      default:
        return { ok: false, reason: "모르는 동작입니다" };
    }
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
