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
import { readAsk, type AskInfo } from "@/lib/ask";
import { autoRunState } from "@/lib/presence";
import { readOrderRoles } from "@/lib/orderRoles";
import { isProductOrder } from "@/lib/parseOrderStatus";
import { autoDecisions } from "@/lib/autoDecisions";

export type { AskInfo, AskKind, AskOption } from "@/lib/ask";

/** mine 사람이 할 일 있음(TODO) · notice 알림만 · auto 자동 진행 중 · wait 날짜나 조건 기다림 · work 터미널에서 작업 중 */
export type NextGroup = "mine" | "notice" | "auto" | "wait" | "work";
export type NextAction = "resolve" | "approve" | "approve-deploy" | "autorun" | "deploy" | "drift" | "ask" | "";

const GROUPS: readonly NextGroup[] = ["mine", "notice", "auto", "wait", "work"];

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
  /** 판단 요청(단계 보류)이면 설계 문서 '확인이 필요했던 것' 절. 오더 화면 맨 위 카드가 보여 준다 */
  detail: string;
  /** 질문(kind ask)일 때만 — 오더 폴더의 ask.json */
  ask?: AskInfo;
  /** 개발자 없이 산출물만 만드는 오더인가. 배포·검증으로 가는 버튼을 숨기고 확인 문구를 바꾼다 */
  product: boolean;
};

/**
 * 스스로 정한 결정 알림 — 진행 중인 오더의 설계 문서에 `자동 결정 —` 줄이 있으면 오더마다 한 건.
 * 다음 할 일(items)에 끼워 넣지 않는다. 오더 하나에 할 일 한 건을 전제하는 화면이 있고, 사람 차례 숫자에도 세지 않기 때문이다.
 */
export type AutoDecisionNote = {
  key: string;
  title: string;
  /** 스스로 정한 결정 수 */
  count: number;
  /** 그 가운데 "확인해 보세요"가 적힌 수 */
  check: number;
  /** 가장 최근(표의 마지막) 결정: 무엇을 · 고른 답 */
  what: string;
  pick: string;
  /** 결정 목록의 지문. 결정이 더해지거나 바뀌면 달라져 알림이 한 번 더 뜬다 */
  sig: string;
};

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const CACHE_MS = 10_000;
type Loaded = { items: NextItem[]; error: string | null; notes: AutoDecisionNote[] };
let cache: (Loaded & { at: number }) | null = null;
let inflight: Promise<Loaded> | null = null;

const plain = (v: string) => v.replace(/[*`]/g, "").trim();

/** 짧은 지문(FNV-1a). 결정 목록이 바뀌었는지만 가린다. */
function hash(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

/** 그 오더의 설계 문서에서 스스로 정한 결정을 읽어 알림 한 건으로 만든다. 없으면 null. */
function autoDecisionNote(key: string, title: string): AutoDecisionNote | null {
  let md: string;
  try {
    md = fs.readFileSync(path.join(getMetaDir(), key, "design.md"), "utf8");
  } catch {
    return null;
  }
  const list = autoDecisions(md);
  if (!list.length) return null;
  const last = list[list.length - 1];
  return {
    key,
    title,
    count: list.length,
    check: list.filter((d) => d.check).length,
    what: plain(last.what),
    pick: plain(last.pick),
    sig: `${list.length}-${hash(list.map((d) => `${d.what}|${d.pick}|${d.why}`).join("\n"))}`,
  };
}

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

/** 자동 실행이 살아서 답을 기다리는가. 판정 문구(플러그인이 프로세스를 보고 고른다)와 상태 문서의 자동 실행 줄 가운데 하나라도 그렇다고 하면 살아 있다. */
function askWaiting(key: string, text: string): boolean {
  if (text.startsWith("자동 실행이 ")) return true;
  try {
    const md = fs.readFileSync(path.join(getMetaDir(), key, "status.md"), "utf8");
    return autoRunState(md.match(/^- \*\*자동 실행\*\*:[ \t]*(.+)$/m)?.[1].trim() ?? null)?.running ?? false;
  } catch {
    return false;
  }
}

function decisionDetail(key: string): string {
  try {
    const md = fs.readFileSync(path.join(getMetaDir(), key, "design.md"), "utf8");
    return md.match(/(?:^|\n)##\s*확인이 필요했던 것[^\n]*\n([\s\S]*?)(?=\n##\s|$)/)?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

async function load(): Promise<Loaded> {
  let out: string;
  try {
    out = await dobbyBash("declare -F dobby_v2_next_all >/dev/null || exit 5; dobby_v2_next_all");
  } catch (e) {
    const err = e as Error & { exitCode?: number };
    return { items: [], notes: [], error: err.exitCode === 5 ? "go-dobby 플러그인을 업데이트해 주세요(다음 할 일 판정 없음)" : err.message };
  }
  const stopped = new Map(
    listFinishedV2Runs()
      .filter((r) => !r.ok)
      .map((r) => [r.key, (r.result ?? "").replace(/\s*복기:.*$/, "").replace(/^자동 실행 중단:\s*/, "")])
  );
  const items: NextItem[] = [];
  const notes: AutoDecisionNote[] = [];
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
    const roles = readOrderRoles(key);
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
      // 모르는 묶음 값이 와도 화면이 멈추지 않게 알림으로 받는다.
      group: (GROUPS as readonly string[]).includes(raw.group ?? "mine") ? ((raw.group ?? "mine") as NextGroup) : "notice",
      kind: raw.kind ?? "",
      // 담당자 줄이 있는 오더에서 기획자가 설계를 다시 보는 차례는 화면 이름이 "설계 다시 보기"다(단계값은 그대로 실패분석).
      text: roles ? (raw.text ?? "").replaceAll("실패분석", "설계 다시 보기") : raw.text ?? "",
      since: raw.since ?? "",
      env: raw.env ?? "",
      cmd: raw.cmd ?? "",
      command,
      link: raw.link ?? "",
      action: (raw.action as NextAction) ?? "",
      note: raw.group === "mine" ? stopped.get(key) ?? "" : "",
      detail: raw.kind === "decision" ? decisionDetail(key) : "",
      ...(raw.kind === "ask" ? { ask: readAsk(key, askWaiting(key, raw.text ?? "")) } : {}),
      product: isProductOrder(roles),
    });
    const note = autoDecisionNote(key, raw.title ?? "");
    if (note) notes.push(note);
  }
  return { items, notes, error: null };
}

/** 판정 결과. 판정 한 번이 수 초라 10초 동안은 저장해 둔 것을 주고, 동시에 온 요청은 한 번의 판정을 함께 기다린다. fresh 면 저장분을 건너뛴다. */
export async function nextActions(fresh = false): Promise<Loaded & { at: number }> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache;
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
  env?: string,
  value?: string
): Promise<{ ok: boolean; reason?: string; jobId?: string; restarted?: boolean; note?: string }> {
  if (!ORDER_KEY_RE.test(key)) return { ok: false, reason: "잘못된 오더 키입니다" };
  const k = shq(key);
  cache = null;
  const approve = (how: string) =>
    dobbyBash(
      `dobby_design_ack ${k} 사용자 >/dev/null || exit 1; ` +
        `r="$(dobby_v2_end ${k} 확정 2>&1)" || { printf '%s\\n' "$r" | grep -m1 '^거부' >&2; exit 1; }; ` +
        `dobby_event ${k} "설계 확정 — 대시보드에서 승인, ${how}"`
    );
  // 자동 배포가 중간에 사람을 부르지 않도록 사람만 풀 수 있는 준비를 먼저 보고 환경을 적는다(auto-mode.md 의 사전 확인).
  // 막히면 이유를, 통과하면 빈 문자열을 돌려준다.
  const prepareDeploy = async (): Promise<string> => {
    const e = env ?? "";
    if (!(DO_AUTO_ENVS as readonly string[]).includes(e)) return "배포 환경은 dev, rc1, rc4 중 하나입니다";
    return (
      await dobbyBash(
        `gh auth status >/dev/null 2>&1 || { echo "gh 로그인이 필요합니다: gh auth login"; exit 0; }; ` +
          `[ -n "\${TEST_LOGIN_PW:-}" ] || { echo "config.env 에 테스트 계정 비밀번호(TEST_LOGIN_PW)가 없습니다"; exit 0; }; ` +
          `if _v2_worktrees ${k} | cut -f1 | grep -qx com.wadiz.web; then s="$(_ship_argo_server ${shq(e)})"; ` +
          `argocd account get-user-info --server "$s" --grpc-web 2>/dev/null | grep -q 'Logged In: *true' || ` +
          `{ echo "argocd 로그인이 필요합니다: argocd login $s --sso --grpc-web"; exit 0; }; fi; ` +
          `dobby_v2_set_env ${k} ${shq(e)}`
      )
    ).trim();
  };
  try {
    switch (action) {
      case "resolve":
        return startResolve(key);
      case "autorun":
        return startV2Run(key);
      case "approve":
        await approve("자동 실행");
        return startV2Run(key);
      case "approve-deploy": {
        const why = await prepareDeploy();
        if (why) return { ok: false, reason: why };
        await approve(`${env} 배포·검증까지 자동 실행`);
        return startV2Run(key);
      }
      case "drift": {
        const r = (await dobbyBash(`dobby_v2_drift_apply ${k}`)).trim();
        if (r === "design") return { ok: false, reason: "설계 문서도 바뀌었습니다. 터미널에서 /do 로 설계를 확인해 주세요" };
        return startV2Run(key);
      }
      case "deploy": {
        const why = await prepareDeploy();
        if (why) return { ok: false, reason: why };
        return startV2Run(key);
      }
      case "ask": {
        // 답을 적는다. 기다리던 run.sh 가 살아 있으면 1분 안에 읽고 이어 간다(멈추기면 끝낸다).
        // 죽어 있으면(8시간 넘게 답이 없어 멈춘 뒤 등) 자동 실행을 다시 띄워 잇는다. 살아 있는지는 플러그인의 판정과 같은 방법으로 본다.
        const v = value?.trim();
        if (!v) return { ok: false, reason: "답이 비었습니다" };
        const alive = (
          await dobbyBash(
            `dobby_v2_ask_answer ${k} ${shq(v)} || exit 1; ` +
              `if ps -axo command 2>/dev/null | grep -Eq "run\\.sh'? '?"${k}"'?( |\$)"; then echo alive; else echo dead; fi`
          )
        )
          .trim()
          .endsWith("alive");
        if (alive || v === "멈추기") return { ok: true, restarted: false };
        const r = startV2Run(key);
        if (r.ok) return { ok: true, jobId: r.jobId, restarted: true };
        // 답은 이미 적혔다. 다시 띄우지 못한 이유만 알린다(이미 도는 잡이 있으면 그 잡이 이어 간다).
        return { ok: true, restarted: false, ...(r.reason === "already_running" ? {} : { note: r.reason }) };
      }
      default:
        return { ok: false, reason: "모르는 동작입니다" };
    }
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
