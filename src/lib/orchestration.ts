/**
 * go-dobby 오케스트레이션 리더. (서버 전용, node I/O)
 * go-dobby는 이슈당 폴더 1개(`$ORCHESTRATION_META/{키}/`)를 쓴다. 각 키를 하나의 "에픽"으로 본다.
 * K≥2면 orchestration.md·agents/·reviews/·agent-logs.json이 있고, K=1이면 status.md의
 * 에이전트 표로 오케스트레이션을 합성한다. 컴포넌트(OrchestrationList/Board/Changes)가
 * 쓰는 EpicSummary/EpicDetail shape은 유지하고 workType만 추가한다.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { getDefaultBase, getMetaDir, getReposRoot, getWorkspaceDir } from "@/lib/issues";
import { ORDER_KEY_RE } from "@/lib/keys";
import {
  parseOrchestration,
  type Orchestration,
  type AgentState,
  type AgentRow,
} from "@/lib/parseOrchestration";
import { parseOrderStatus, phaseText, type PhaseKey } from "@/lib/parseOrderStatus";
import { listConsoleAgents } from "@/lib/transcript";
import {
  assignOrderAvatars,
  type AssignedAvatar,
  type AvatarGroup,
  ORCHESTRATOR_SLUG,
  AVATAR_GROUPS,
  avatarHash,
  groupFirstMember,
} from "@/lib/avatarAssign";
import type { Metric, CardStats } from "@/lib/lifecycle";
import type { ReportRun } from "@/lib/issues";

/** 이슈 키(FE1-1187) 또는 문서 전용 작업 키(TASK-slug). */
const KEY_RE = /^([A-Za-z][A-Za-z0-9]*-\d+|TASK-[A-Za-z0-9-]+)$/;

export type WorkType = "code" | "nonsource" | null;

function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** 오더 폴더 경로. */
function orderDir(key: string): string {
  return path.join(getMetaDir(), key);
}

/**
 * status.md `## 세션`에서 오케스트레이터 세션 ID·작업 경로(cwd)를 뽑는다.
 * 사용자가 터미널에서 `cd <cwd> && claude --resume <세션ID>`로 그 세션을 이어가기 위함.
 * 둘 다 없을 수 있다(방어적). 세션 섹션이 없으면 문서 전체에서 찾는다.
 */
export function readOrderSession(key: string): { sessionId: string | null; cwd: string | null } {
  const md = readFileSafe(path.join(orderDir(key), "status.md"));
  if (!md) return { sessionId: null, cwd: null };
  const sec = md.match(/(?:^|\n)##\s*세션[^\n]*\n([\s\S]*?)(?=\n##\s|$)/)?.[1] ?? md;
  const sessionId =
    sec.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] ?? null;
  const cwdRaw = sec.match(/작업\s*경로[^\n]*?[:：]\s*([^\n]+)/)?.[1] ?? null;
  const cwd = cwdRaw ? cwdRaw.trim().replace(/^`|`$/g, "").trim() || null : null;
  return { sessionId, cwd };
}

/** `$ORCHESTRATION_META` 아래 오더(이슈/작업) 키들. status.md 또는 orchestration.md가 있는 폴더. */
function epicKeys(): string[] {
  const root = getMetaDir();
  if (!fs.existsSync(root)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && KEY_RE.test(d.name))
    .filter(
      (d) =>
        fs.existsSync(path.join(root, d.name, "status.md")) ||
        fs.existsSync(path.join(root, d.name, "orchestration.md"))
    )
    .map((d) => d.name);
}

/** work-type: produce.md → 비소스, implementation.md → code, status 힌트, 그 외 기본 개발(code). */
function workTypeOf(key: string, statusMd: string | null): WorkType {
  const dir = orderDir(key);
  // produce.md는 최상위(repo에 들어가는 산출물) 또는 deliverables/(repo 밖 리포트)에 있을 수 있다 — 둘 다 비소스 신호.
  if (
    fs.existsSync(path.join(dir, "produce.md")) ||
    fs.existsSync(path.join(dir, "deliverables", "produce.md"))
  )
    return "nonsource";
  if (fs.existsSync(path.join(dir, "implementation.md"))) return "code";
  // deliverables/는 비소스 신호로 쓰지 않는다 — 개발 오더도 감사·분석 에이전트가
  // deliverables/에 분석·보고서를 남기므로(FE1-1406·FE-10884), 있다는 것만으로
  // 비개발로 보면 코드 오더가 오분류된다. 비소스 판정은 produce.md(dobby-produce)만.
  if (statusMd) {
    const wt = parseOrderStatus(statusMd, key).workTypeHint;
    if (wt) return wt;
  }
  // 명시적 비소스 근거(produce.md·힌트)가 없으면 개발(code)로 본다.
  // → 분석 초기라 산출물이 아직 없는 오더도 개발 카드/필터에 잡힌다(미분류로 사라지지 않음).
  return "code";
}

/**
 * 이 슬러그의 산출물(deliverables/{슬러그}.md 또는 폴더)이 있으면 완료로 본다.
 * 오케스트레이터가 상태표 갱신을 미뤄도(감사·산출 에이전트가 결과물만 남긴 경우)
 * 대시보드가 결과물을 근거로 완료를 즉시 반영하기 위함. 코드 에이전트는 deliverables를
 * 만들지 않으므로 이 보정에 걸리지 않는다(잘못된 완료 표시 방지).
 */
function completedByDeliverable(key: string, slug: string): boolean {
  if (!slug || slug === "-") return false;
  const base = path.join(orderDir(key), "deliverables");
  try {
    return fs.existsSync(path.join(base, `${slug}.md`)) || fs.existsSync(path.join(base, slug));
  } catch {
    return false;
  }
}

/** reviews/round-N 폴더 아래 리뷰 파일이 하나라도 있으면 true(리뷰가 실제로 수행됨). */
function hasAnyReview(key: string): boolean {
  const dir = path.join(orderDir(key), "reviews");
  try {
    for (const rd of fs.readdirSync(dir, { withFileTypes: true })) {
      if (rd.isDirectory() && fs.readdirSync(path.join(dir, rd.name)).some((f) => f.endsWith(".md")))
        return true;
    }
  } catch {
    /* reviews 없음 */
  }
  return false;
}

/** agent-logs.json의 슬러그 목록(스폰된 에이전트). 문자열·객체 값 모두 키만 취한다. */
function agentLogSlugs(key: string): string[] {
  const raw = readFileSafe(path.join(orderDir(key), "agent-logs.json"));
  if (!raw) return [];
  try {
    return Object.keys(JSON.parse(raw) as Record<string, unknown>).filter((k) => k && k !== "-");
  } catch {
    return [];
  }
}

/** 상태표가 진행 상태여도, 산출물이 있으면 완료로 보정한다. */
function applyDeliverableCompletion(key: string, o: Orchestration): Orchestration {
  o.agents = o.agents.map((a) =>
    a.state !== "완료" && completedByDeliverable(key, a.agent) ? { ...a, state: "완료" } : a
  );
  return o;
}

/**
 * 스폰됐지만(agent-logs.json에 있음) 상태표에는 없는 에이전트를 보드에 병합한다.
 * 오케스트레이터가 새 에이전트 행 추가를 누락해도 대시보드에 보이게 한다.
 * 상태는 항상 5-state 중 하나로 추정한다(옛 "진행중" 금지):
 *   산출물 있음→완료 / 리뷰 에이전트+리뷰파일 있음→완료(끝난 라운드 잔재) / 리뷰 에이전트→리뷰 / 그 외→구현.
 */
function mergeSpawnedAgents(key: string, o: Orchestration): Orchestration {
  const have = new Set(o.agents.map((a) => a.agent));
  for (const slug of agentLogSlugs(key)) {
    if (have.has(slug)) continue;
    const isReview = /review|리뷰/i.test(slug);
    const state: AgentState = completedByDeliverable(key, slug)
      ? "완료"
      : isReview
      ? hasAnyReview(key)
        ? "완료"
        : "리뷰"
      : "구현";
    o.agents.push({
      agent: slug,
      issue: "",
      branch: "",
      state,
      round: "",
      updatedAt: "",
      startedAt: "",
    });
  }
  return o;
}

/** orchestration.md가 있으면 파싱, 없으면 status.md 에이전트 표로 합성. 이후 산출물·스폰로그로 보정. */
function orchestrationOf(key: string, statusMd: string | null): Orchestration | null {
  const omd = readFileSafe(path.join(orderDir(key), "orchestration.md"));
  let o: Orchestration | null = null;
  if (omd) {
    o = parseOrchestration(omd);
    if (!o.epicKey) o.epicKey = key;
  } else if (statusMd) {
    const st = parseOrderStatus(statusMd, key);
    if (st.agents.length > 0) {
      o = { epicKey: key, mode: null, agents: st.agents, scope: [], conflicts: "", events: [], restMarkdown: "" };
    }
  }
  // 상태표가 없어도 스폰된 에이전트가 있으면 보드를 만든다.
  if (!o) {
    if (agentLogSlugs(key).length === 0) return null;
    o = { epicKey: key, mode: null, agents: [], scope: [], conflicts: "", events: [], restMarkdown: "" };
  }
  return mergeSpawnedAgents(key, applyDeliverableCompletion(key, o));
}

export type Counts = { total: number } & Record<string, number>;

function countAgents(o: Orchestration): Counts {
  const c: Counts = { total: 0 };
  for (const a of o.agents) {
    c.total++;
    c[a.state] = (c[a.state] ?? 0) + 1;
  }
  return c;
}

/** 기록된 워크트리 경로가 있고 모두 디스크에서 사라졌으면 true(dobby-end 정리 등). 기록 없으면 false(알 수 없음). */
function worktreesGone(worktrees: { path: string }[]): boolean {
  const withPath = worktrees.filter((w) => w.path);
  if (withPath.length === 0) return false;
  return withPath.every((w) => {
    const p = w.path.startsWith("~") ? path.join(os.homedir(), w.path.slice(1)) : w.path;
    return !fs.existsSync(p);
  });
}

export type EpicSummary = {
  epicKey: string;
  mode: string | null;
  /** 에픽 대표 아바타(핀된 오케스트레이터/최빈 그룹 기준). 리스트 "에픽" 컬럼 앞 표시용. */
  avatar: AssignedAvatar | null;
  counts: Counts;
  agentCount: number;
  latestEventTime: string | null;
  latestEventText: string | null;
  lastActivity: string | null;
  /** 최초 활동 시각(가장 이른 이벤트/갱신) — "오늘 시작" 판정용. */
  firstActivity: string | null;
  /** 활성 에이전트 중 착수 후 오래 멈춘(정체) 것이 하나라도 있으면 true — "주의" 판정용. */
  stalled: boolean;
  /** go-dobby 확장: 개발/비개발 구분 + 제목 */
  workType: WorkType;
  /** 오더 종류(status.md `종류`) — 상세 탭 구성 분기용. summary=작업 내용 정리. */
  orderKind: "development" | "deliverable" | "summary" | null;
  title: string | null;
  /** 기록된 워크트리가 모두 삭제됨(dobby-end 정리). status.md 워크트리 표 경로 존재로 판단. */
  worktreeRemoved: boolean;
  /** status.md 현재 단계(정규화 버킷) + 짧은 라벨 — 에이전트 표가 아직 없는 착수 직후 표시용 */
  phase: PhaseKey;
  phaseLabel: string;
};

// "일하는 중"인 상태 + 마지막 상태 변경(갱신) 후 STALE_MIN분 이상 경과면 정체(보드와 동일 기준).
const CARD_ACTIVE_STATES = ["분석", "구현", "리뷰"];
const CARD_STALE_MIN = 30;
function agentStalled(a: { updatedAt: string; startedAt: string }): boolean {
  // 기준 = 마지막 상태 변경(갱신). 시:분 없으면 착수로 폴백, 그것도 없으면 판정 안 함(오탐 방지).
  const base = /\d{1,2}:\d{2}/.test(a.updatedAt) ? a.updatedAt : a.startedAt;
  if (!/\d{1,2}:\d{2}/.test(base)) return false;
  const d = new Date(base.replace(" ", "T"));
  if (isNaN(d.getTime())) return false;
  return Math.floor((Date.now() - d.getTime()) / 60000) >= CARD_STALE_MIN;
}

function summarize(key: string, o: Orchestration | null, statusMd: string | null): EpicSummary {
  const counts = o ? countAgents(o) : { total: 0 };
  const times = o
    ? [...o.events.map((e) => e.time), ...o.agents.map((a) => a.updatedAt).filter(Boolean)].sort()
    : [];
  const st = statusMd ? parseOrderStatus(statusMd, key) : null;
  const stalled = !!o?.agents.some(
    (a) => CARD_ACTIVE_STATES.includes(a.state) && agentStalled(a)
  );
  // 대표 아바타: 핀된 오케스트레이터 → 최빈 그룹 대표 → (미핀) 균형 배정 대표.
  // 미핀 폴백도 epicAvatars가 실제로 핀할 그룹(pickBalancedGroup)과 같은 규칙을 써야
  // 핀 전/후 대표가 일치한다. (해시 primaryGroup을 쓰면 핀 순간 BTS→도비처럼 바뀜)
  const pinned = readPinnedAvatars(orderDir(key));
  const domG = dominantGroup(pinned);
  const avatar =
    pinned[ORCHESTRATOR_SLUG] ??
    (domG ? groupFirstMember(domG) : groupFirstMember(pickBalancedGroup(key)));
  return {
    epicKey: key,
    mode: o?.mode ?? null,
    avatar,
    counts,
    agentCount: o?.agents.length ?? 0,
    latestEventTime: o?.events[0]?.time ?? null,
    latestEventText: o?.events[0]?.text ?? null,
    lastActivity: (times.length ? times[times.length - 1] : null) ?? st?.updatedAt ?? null,
    firstActivity: (times.length ? times[0] : null) ?? null,
    stalled,
    workType: workTypeOf(key, statusMd),
    orderKind: st?.orderKind ?? null,
    title: st?.meta.title ?? null,
    worktreeRemoved: st ? worktreesGone(st.worktrees) : false,
    phase: st?.phase ?? "unknown",
    phaseLabel: st ? phaseText(st.phaseRaw, st.phase) : "-",
  };
}

export function listEpics(): EpicSummary[] {
  const epics: EpicSummary[] = [];
  for (const key of epicKeys()) {
    const statusMd = readFileSafe(path.join(orderDir(key), "status.md"));
    epics.push(summarize(key, orchestrationOf(key, statusMd), statusMd));
  }
  epics.sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
  return epics;
}

/**
 * 각 에이전트의 현재 "작업 지문" = `상태#라운드`(결과물 완료 보정 반영). 슬러그→지문.
 * 아바타 소감(재미기능)이 "소감 만든 뒤 추가 작업했는지"를 판단하는 근거로 쓴다.
 */
export function agentSigs(key: string): Record<string, string> {
  const statusMd = readFileSafe(path.join(orderDir(key), "status.md"));
  const o = orchestrationOf(key, statusMd);
  const out: Record<string, string> = {};
  if (o) {
    for (const a of o.agents) out[a.agent] = `${a.state}#${a.round}`;
    // 오케스트레이터 브리핑 서명 = 전체 상태 "모양"(상태 목록 정렬 + 최대 라운드).
    // 에이전트 추가·상태 전이·라운드 증가 때마다 바뀜 → avatar-quips가 브리핑 재생성.
    // ⛔ avatar-quips 스킬도 동일 공식으로 sig를 계산해야 매칭됨(SKILL 참조).
    out[ORCHESTRATOR_SLUG] = orchestratorSig(o);
  }
  return out;
}

/** 오케스트레이터 브리핑 재생성 서명. 상태표만 근거(본문 X). avatar-quips와 공식 일치 필수. */
export function orchestratorSig(o: Orchestration): string {
  const states = o.agents.map((a) => a.state).sort().join("|");
  const maxRound = o.agents.reduce((m, a) => Math.max(m, Number(a.round) || 0), 0);
  return `${states}#r${maxRound}`;
}

export type Contract = { slug: string; role: string; raw: string };
export type ReviewFile = { round: number; slug: string; content: string };
export type EditHunk = { old: string; new: string };
export type FileDiff = { file: string; hunks: EditHunk[] };
export type AgentWork = {
  slug: string;
  logPath: string;
  found: boolean;
  baseDir: string;
  files: string[];
  diffs: FileDiff[];
  commits: string[];
  summary: string;
  /** 코드 변경의 출처. 기본은 대화 로그(Edit/Write 호출), "git"이면 워크트리 브랜치 diff로 보강한 것. */
  source?: "log" | "git";
};

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}
function commonDir(paths: string[]): string {
  if (paths.length === 0) return "";
  // 파일명(마지막 세그먼트)은 공통 접두어 계산에서 제외한다. 안 그러면 파일이 1개일 때
  // base가 전체 경로가 되어 rel(f)가 빈 문자열이 되고 → 파일명이 사라지고 diff 패널 key가
  // 빈 문자열이라 펼쳐지지도 않는다(단일 파일 변경이 안 보이던 원인).
  const dirs = paths.map((p) => p.split("/").slice(0, -1));
  const first = dirs[0];
  let i = 0;
  for (; i < first.length; i++) if (!dirs.every((s) => s[i] === first[i])) break;
  return first.slice(0, i).join("/");
}

function parseAgentLog(rawPath: string): Omit<AgentWork, "slug"> {
  const logPath = expandHome(rawPath);
  const empty = { logPath, found: false, baseDir: "", files: [] as string[], diffs: [] as FileDiff[], commits: [] as string[], summary: "" };
  let content: string;
  try {
    content = fs.readFileSync(logPath, "utf8");
  } catch {
    return empty;
  }
  const metaRoot = getMetaDir();
  const claudeHome = path.join(os.homedir(), ".claude");
  // 코드가 아닌 경로는 코드 변경에서 제외한다.
  // ① 메타(진행 기록): 현재 v2 메타 루트뿐 아니라, 알려진 메타 루트 이름(orchestration-meta·
  //    dobby-meta)과 v1 work-dobby 분리 트리(.issue-start/.issue-test/.issue-end/.agent-start).
  // ② `~/.claude/**`: 기억 파일(projects/{슬러그}/memory/*.md)·개인 스킬·커맨드·settings.json.
  //    오더 진행 중 기억을 저장하는 건 정상 동작인데, 이게 "코드 변경"으로 잡히면 실제 구현과
  //    섞여 화면이 오염된다(사례 FE1-1681: 실제 코드 변경은 셸로 이뤄져 로그에 없고, 남은
  //    Write 1건이 기억 파일이라 그것만 코드 변경으로 표시됐다).
  // ③ 세션 임시 경로(`/tmp/claude-{pid}/…`): 스크래치패드·태스크 산출물.
  const isNonCode = (p: string) =>
    p.startsWith(metaRoot) ||
    /\/(orchestration-meta|dobby-meta)\//.test(p) ||
    /\/\.(issue-start|issue-test|issue-end|agent-start)\//.test(p) ||
    p === claudeHome ||
    p.startsWith(claudeHome + path.sep) ||
    /\/tmp\/claude-\d+\//.test(p);
  const fileSet = new Set<string>();
  const diffMap = new Map<string, EditHunk[]>();
  const commits: string[] = [];
  let summary = "";
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let d: unknown;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = (d as { message?: unknown }).message;
    if (!msg || typeof msg !== "object") continue;
    const blocks = (msg as { content?: unknown }).content;
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const type = (b as { type?: string }).type;
      if (type === "tool_use") {
        const name = (b as { name?: string }).name;
        const input = (b as { input?: Record<string, unknown> }).input ?? {};
        if (name === "Edit" || name === "Write" || name === "NotebookEdit") {
          const fp = input.file_path;
          // 메타 파일($ORCHESTRATION_META 하위: status.md·implementation.md 등)은
          // 코드 구현이 아니라 진행 기록이므로 파일 목록·diff 모두에서 제외한다.
          if (typeof fp === "string" && !isNonCode(fp)) {
            fileSet.add(fp);
            const hunk: EditHunk =
              name === "Write"
                ? { old: "", new: String(input.content ?? "") }
                : { old: String(input.old_string ?? ""), new: String(input.new_string ?? "") };
            const arr = diffMap.get(fp) ?? [];
            arr.push(hunk);
            diffMap.set(fp, arr);
          }
        } else if (name === "Bash") {
          const cmd = input.command;
          if (typeof cmd === "string" && /git (commit|push)/.test(cmd)) {
            commits.push(cmd.replace(/\s+/g, " ").trim().slice(0, 200));
          }
        }
      } else if (type === "text") {
        const t = (b as { text?: string }).text;
        if (typeof t === "string" && t.trim()) summary = t;
      }
    }
  }
  const files = Array.from(fileSet);
  const base = commonDir(files);
  const rel = (f: string) => (base && f.startsWith(base) ? f.slice(base.length + 1) : f);
  const diffs: FileDiff[] = Array.from(diffMap.entries()).map(([f, hunks]) => ({ file: rel(f), hunks }));
  return { logPath, found: true, baseDir: base, files: files.map(rel), diffs, commits, summary };
}

/** diff 본문을 만들지 않고 파일 목록에만 남기는 크기 상한(lock 파일 등 거대 텍스트 방어). */
const GIT_DIFF_MAX_BYTES = 256 * 1024;

function git(wt: string, args: string[]): string | null {
  const r = spawnSync("git", ["-C", wt, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) return null;
  return r.stdout;
}

/**
 * 워크트리의 브랜치 변경(= 스킬 리뷰 규약과 같은 `git diff {merge-base origin/base HEAD}`).
 * 커밋된 변경 + 미커밋 변경을 모두 포함한다.
 *
 * 왜 필요한가: 로그 기반 추출은 `Edit`/`Write` 도구 호출만 읽으므로, 에이전트가 셸(sed·python
 * heredoc 등)로 파일을 고치면 코드 변경이 통째로 누락된다(사례 FE1-1681: 실제로 3파일 71줄이
 * 바뀌었는데 화면엔 0건). git은 도구 사용 방식과 무관한 정본이라 이 누락을 메운다.
 */
function gitBranchChanges(wt: string): { files: string[]; diffs: FileDiff[] } | null {
  if (!wt || !fs.existsSync(wt)) return null;
  const base = getDefaultBase();
  const fork =
    git(wt, ["merge-base", `origin/${base}`, "HEAD"])?.trim() ||
    git(wt, ["merge-base", base, "HEAD"])?.trim();
  if (!fork) return null;
  const names = (git(wt, ["diff", "--name-only", fork]) ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) return null;
  const diffs: FileDiff[] = [];
  for (const name of names) {
    const before = git(wt, ["show", `${fork}:${name}`]) ?? ""; // 신규 파일이면 빈 문자열
    let after = "";
    try {
      const abs = path.join(wt, name);
      after = fs.statSync(abs).size > GIT_DIFF_MAX_BYTES ? "" : fs.readFileSync(abs, "utf8");
    } catch {
      after = ""; // 삭제된 파일
    }
    if (before.length > GIT_DIFF_MAX_BYTES) continue; // 목록에는 남고 diff만 생략
    if (before === after) continue;
    diffs.push({ file: name, hunks: [{ old: before, new: after }] });
  }
  return { files: names, diffs };
}

/**
 * 로그에서 코드 변경이 안 나온 구현 에이전트에게 브랜치 diff를 채워 준다.
 * 귀속을 틀리게 하지 않기 위해 **구현 롤이 정확히 1명**일 때만 채운다(여럿이면 어느 에이전트가
 * 어느 파일을 고쳤는지 git만으로는 알 수 없어 그대로 비워 둔다).
 */
function fillGitChanges(
  works: AgentWork[],
  agents: AgentRow[],
  worktrees: { repo: string; path: string }[]
): void {
  const isImplName = (n: string) => /개발자|산출자/.test(n);
  const implSlugs = agents.filter((a) => isImplName(a.name ?? "")).map((a) => a.agent);
  if (implSlugs.length !== 1) return;
  const target = works.find((w) => w.slug === implSlugs[0]);
  if (!target || target.diffs.length > 0 || target.files.length > 0) return;
  for (const wt of worktrees) {
    const changed = gitBranchChanges(wt.path);
    if (!changed) continue;
    target.files.push(...changed.files);
    target.diffs.push(...changed.diffs);
    target.baseDir = target.baseDir || wt.path;
    target.source = "git";
  }
}

export type Deliverable = { name: string; content: string; kind: "md" | "html" | "other" };

export type EpicDetail = {
  epicKey: string;
  orchestration: Orchestration | null;
  contracts: Contract[];
  reviews: ReviewFile[];
  agentWorks: AgentWork[];
  /** 슬러그별 핀 고정 아바타(avatars.json). 에이전트 추가돼도 기존은 불변. */
  avatars: Record<string, AssignedAvatar>;
  /** go-dobby 오더 산출물(v1처럼 상세에 함께 표시) */
  workType: WorkType;
  /** 오더 종류(status.md `종류`) — 상세 탭 구성 분기용. summary=작업 내용 정리. */
  orderKind: "development" | "deliverable" | "summary" | null;
  title: string | null;
  /** 기록된 워크트리가 모두 삭제됨(dobby-end 정리). */
  worktreeRemoved: boolean;
  /** 해결/종료 상태(해결 처리 버튼 토글용). 단계 해결·종료 또는 워크트리 삭제. */
  resolved: boolean;
  /** status.md 현재 단계 라벨(에이전트 상태표가 아직 없을 때 표시용). */
  phaseLabel: string | null;
  analysisMd: string | null;
  implementationMd: string | null;
  produceMd: string | null;
  summaryMd: string | null;
  /** 자율 판단 기록(decisions.md). 대시보드가 카드로 렌더. 없으면 null. */
  decisionsMd: string | null;
  /** 사이드 이펙트 분석(side-effects.md). 대시보드가 카드로 렌더. 없으면 null. */
  sideEffectsMd: string | null;
  /** 사용자 수동 확인 가이드(test-guide.md). 대시보드가 카드로 렌더. 없으면 null. */
  testGuideMd: string | null;
  deliverables: Deliverable[];
  runs: ReportRun[];
  /** 대시보드가 띄운 잡(run.log)이 있는지 — 실시간 콘솔 가용 여부. */
  hasJob: boolean;
  /** 비전공자용 쉬운 설명(explainer.md). 없으면 null. */
  explainerMd: string | null;
  retroMd: string | null;
  /** 아티팩트 탭 — dobby-share가 게시한 claude.ai 공개 아티팩트 URL(artifact-share.md에서 추출). 없으면 null. */
  artifactShareUrl: string | null;
  /** Jira 탭 — dobby-order가 저장한 이슈 원문(jira-issue.md). 있으면 Jira 탭 표시. */
  jiraIssueMd: string | null;
  /** Jira 탭 — 읽기 쉽게 정리한 이슈(jira-issue-clean.md). 버튼 생성. */
  jiraIssueCleanMd: string | null;
  /** Jira 탭 — 코멘트 핵심 정리(jira-comments.md). 버튼 생성. */
  jiraCommentsMd: string | null;
  /** Jira 탭 — 업데이트 내용 정리(jira-enrich.md). 버튼 생성·편집 가능. */
  jiraEnrichMd: string | null;
  /** Jira 탭 — 게시 여부 플래그(jira-enrich.json). desc/comment별 반영 시각. */
  jiraPosted: { desc?: string; comment?: string };
};

/** test-runs/{시각}/result.md 회차들(최신순). */
function readRuns(key: string): ReportRun[] {
  const runsDir = path.join(orderDir(key), "test-runs");
  if (!fs.existsSync(runsDir)) return [];
  const runs: ReportRun[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const runDir = path.join(runsDir, e.name);
    let mds: string[] = [];
    try {
      mds = fs.readdirSync(runDir).filter((f) => f.toLowerCase().endsWith(".md"));
    } catch {
      continue;
    }
    const file = mds.find((f) => /result/i.test(f)) ?? mds[0];
    if (!file) continue;
    const content = readFileSafe(path.join(runDir, file)) ?? "";
    const m = e.name.match(/(\d{4})-?(\d{2})-?(\d{2})[-_ ]?(\d{2}):?(\d{2}):?(\d{2})/);
    const label = m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : e.name;
    const sortKey = m
      ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
      : 0;
    runs.push({ id: e.name, label, file: path.join("test-runs", e.name, file), content, sortKey });
  }
  runs.sort((a, b) => b.sortKey - a.sortKey);
  return runs;
}

/** deliverables/ 산출물(produce.md 제외). md/html/기타 구분. */
function readDeliverables(key: string): Deliverable[] {
  const dir = path.join(orderDir(key), "deliverables");
  if (!fs.existsSync(dir)) return [];
  const out: Deliverable[] = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f === "produce.md") continue;
      const lower = f.toLowerCase();
      const kind = lower.endsWith(".md") ? "md" : lower.endsWith(".html") || lower.endsWith(".htm") ? "html" : "other";
      const content = kind === "other" ? "" : readFileSafe(path.join(dir, f)) ?? "";
      out.push({ name: f, content, kind });
    }
  } catch {
    /* skip */
  }
  return out;
}

export type PrTarget = { repo: string; branch: string; repoUrl: string | null };

/** 소스 저장소 .git/config의 origin url을 github https 형태로 정규화. 없으면 null. */
function githubUrlOf(repo: string): string | null {
  if (!repo) return null;
  const txt = readFileSafe(path.join(getReposRoot(), repo, ".git", "config"));
  if (!txt) return null;
  // [remote "origin"] 블록의 url = ... 추출
  const block = txt.match(/\[remote "origin"\]([\s\S]*?)(?:\n\[|$)/)?.[1] ?? txt;
  const url = block.match(/url\s*=\s*(\S+)/)?.[1];
  if (!url) return null;
  const gh = url.match(/github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  return gh ? `https://github.com/${gh[1]}/${gh[2]}` : null;
}

/** git 워크트리 폴더의 현재 브랜치를 파일로 읽는다(git 스폰 없이). 못 읽으면 "". */
function branchFromWorktree(dir: string): string {
  try {
    const gitPath = path.join(dir, ".git");
    let gitDir: string;
    if (fs.statSync(gitPath).isDirectory()) {
      gitDir = gitPath;
    } else {
      // 워크트리는 .git이 파일: "gitdir: /…/worktrees/{name}"
      const m = readFileSafe(gitPath)?.match(/gitdir:\s*(.+)/);
      if (!m) return "";
      gitDir = path.isAbsolute(m[1].trim()) ? m[1].trim() : path.resolve(dir, m[1].trim());
    }
    const head = (readFileSafe(path.join(gitDir, "HEAD")) ?? "").trim();
    return head.match(/ref:\s*refs\/heads\/(.+)/)?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

/** {workspace}/subtree/ 에서 `{repo}-{키}[...]` 폴더를 찾아 repo명을 얻는다(status.md에 워크트리 미기록 시). */
function repoFromSubtree(key: string, branch?: string): string {
  try {
    const subtree = path.join(getWorkspaceDir(), "subtree");
    const re = new RegExp(`^(.+)-${key}(?:-.*)?$`);
    const matched: { repo: string; dir: string }[] = [];
    for (const name of fs.readdirSync(subtree)) {
      const m = name.match(re);
      if (m) matched.push({ repo: m[1], dir: path.join(subtree, name) });
    }
    if (matched.length === 0) return "";
    // ⛔ 첫 폴더를 그냥 집지 않는다: 한 오더에 워크트리가 여럿이면(FE·BE) 이름순 첫 폴더가
    // 그 브랜치의 저장소가 아닐 수 있다(사례 FE1-1320: 브랜치는 wadiz-frontend 것인데
    // com.wadiz.web-… 폴더가 이름순으로 앞서 잘못된 저장소로 PR 링크가 만들어졌다).
    if (branch) {
      const hit = matched.find((m) => branchFromWorktree(m.dir) === branch);
      if (hit) return hit.repo;
    }
    return matched[0].repo;
  } catch {
    /* subtree 없음 */
  }
  return "";
}

/**
 * PR 생성 링크용 대상: 이 오더의 (repo, 개발 브랜치, github repo URL) 목록.
 * status.md의 세 형식을 모두 수용한다:
 *  ① 워크트리 표(`| repo | 브랜치 | 경로 |`)  ② 라벨 불릿(`- **브랜치**: …`)  ③ `## 브랜치` 아래 브랜치 불릿.
 * repo는 표의 repo 컬럼 → 워크트리 경로 basename → subtree 폴더 글롭 순으로 도출한다.
 */
/**
 * status.md `## 세션`의 작업 경로에서 저장소 이름을 추론한다(마지막 단서).
 * 워크트리가 정리되고(`dobby-end`) `## 브랜치` 줄에도 저장소가 안 적혀 있으면
 * 다른 단서가 없어 PR 링크가 통째로 사라진다(사례 QA-22718: 괄호에 저장소 대신 커밋 메모).
 * 경로 세그먼트 중 `$ORCHESTRATION_REPOS_ROOT` 아래 실제 git 저장소인 이름을 택한다.
 */
function repoFromSessionCwd(statusMd: string): string {
  const cwd =
    statusMd.match(/작업\s*경로[^\n]*?[:：]\s*([^\n]+)/)?.[1]?.trim().replace(/^`|`$/g, "") ?? "";
  if (!cwd) return "";
  const root = getReposRoot();
  for (const seg of cwd.split("/").filter(Boolean)) {
    if (fs.existsSync(path.join(root, seg, ".git"))) return seg;
  }
  return "";
}

export function prTargets(key: string): PrTarget[] {
  const statusMd = readFileSafe(path.join(orderDir(key), "status.md"));
  if (!statusMd) return [];
  const st = parseOrderStatus(statusMd, key);
  const repoFromPath = (p: string) => {
    const base = (p || "").split("/").filter(Boolean).pop() ?? "";
    return base.replace(new RegExp(`-${key}(?:-.*)?$`), "");
  };

  const pairs: { repo: string; branch: string }[] = [];
  // ① 워크트리 표(멀티레포면 repo별 행)
  for (const w of st.worktrees) {
    if (w.branch) pairs.push({ repo: w.repo || repoFromPath(w.path), branch: w.branch });
  }
  // ② 라벨 불릿 "- **브랜치**: …" (+ "- **워크트리**: /…/{repo}-{키}")
  if (pairs.length === 0) {
    const bm = statusMd.match(/^\s*[-*]\s*\*{0,2}브랜치\*{0,2}\s*[:：]\s*`?([^\s`(]+)/m);
    const wm = statusMd.match(/^\s*[-*]\s*\*{0,2}워크트리\*{0,2}\s*[:：]\s*`?(\S+)/m);
    if (bm) pairs.push({ repo: wm ? repoFromPath(wm[1]) : "", branch: bm[1] });
  }
  // ③ "## 브랜치" 섹션의 브랜치 불릿(예: "- bugfix/QA-22718 (커밋 …)", "- feature/FE1-1320 (wadiz-frontend)")
  //    ⛔ 첫 줄에서 멈추지 않는다: 멀티 repo 오더는 저장소마다 한 줄씩 적히므로, 하나만 읽으면
  //    나머지 저장소의 PR 링크가 통째로 사라진다(사례 FE1-1320: FE·BE 두 워크트리인데 링크 1개).
  //    줄 뒤 괄호에 저장소 이름이 있으면(`(wadiz-frontend)`) 그것을 repo로 쓴다 — 없으면 나중에 추론.
  if (pairs.length === 0) {
    const lines = statusMd.split("\n");
    let inSec = false;
    for (const line of lines) {
      if (/^##\s/.test(line)) inSec = /브랜치/.test(line.replace(/[#*]/g, ""));
      else if (inSec) {
        const m = line.match(/^\s*[-*]\s*`?([A-Za-z0-9._-]+\/[A-Za-z0-9._\/-]+)/);
        if (!m) continue;
        // 괄호 안이 저장소 이름처럼 보이면 채택(커밋 해시·설명 문구는 제외).
        const paren = line.match(/\(([^)]+)\)/)?.[1]?.trim() ?? "";
        const repo = /^[A-Za-z][A-Za-z0-9._-]*$/.test(paren) && !/^[0-9a-f]{7,40}$/.test(paren) ? paren : "";
        pairs.push({ repo, branch: m[1] });
      }
    }
  }
  // ④ status.md에 브랜치가 전혀 없으면 실제 워크트리(subtree)에서 직접 읽는다.
  //    파일시스템(=실제 브랜치)이 진실이라, 오케스트레이터가 status.md에 브랜치를 안 남겨도 PR 링크가 뜬다.
  if (pairs.length === 0) {
    try {
      const subtree = path.join(getWorkspaceDir(), "subtree");
      const re = new RegExp(`^(.+)-${key}(?:-.*)?$`);
      for (const name of fs.readdirSync(subtree)) {
        const m = name.match(re);
        if (!m) continue;
        const branch = branchFromWorktree(path.join(subtree, name));
        if (branch) pairs.push({ repo: m[1], branch });
      }
    } catch {
      /* subtree 없음 */
    }
  }

  const seen = new Set<string>();
  const out: PrTarget[] = [];
  for (const p of pairs) {
    const branch = p.branch.replace(/`/g, "").trim();
    if (!branch || branch === "-") continue;
    let repo = p.repo;
    if (!repo) {
      repo =
        st.worktrees.length === 1
          ? st.worktrees[0].repo || repoFromPath(st.worktrees[0].path)
          : repoFromSubtree(key, branch);
      // 워크트리가 정리돼 subtree에도 단서가 없으면 세션 작업 경로에서 추론한다.
      if (!repo) repo = repoFromSessionCwd(statusMd);
    }
    const dk = `${repo}|${branch}`;
    if (seen.has(dk)) continue;
    seen.add(dk);
    out.push({ repo, branch, repoUrl: githubUrlOf(repo) });
  }
  return out;
}

function readPinnedAvatars(dir: string): Record<string, AssignedAvatar> {
  const raw = readFileSafe(path.join(dir, "avatars.json"));
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? (o as Record<string, AssignedAvatar>) : {};
  } catch {
    return {};
  }
}

function sameAvatars(a: Record<string, AssignedAvatar>, b: Record<string, AssignedAvatar>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => b[k] && a[k].group === b[k].group && a[k].member === b[k].member);
}

/**
 * status.md `## 세션`의 오케스트레이터 세션 ID를 가리키는 에이전트 슬러그를 찾는다.
 * = 오케스트레이터가 인라인(light/K=1 인라인)으로 직접 구현한 에이전트. 없으면 null.
 * (인라인 에이전트의 agent-logs 경로는 메인 세션 전사(…/{세션ID}.jsonl)를 가리킨다.)
 */
function inlineOrchestratorSlug(dir: string, statusMd: string | null): string | null {
  const sid = statusMd?.match(/세션 ID[^\n]*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1];
  if (!sid) return null;
  const raw = readFileSafe(path.join(dir, "agent-logs.json"));
  if (!raw) return null;
  let logs: Record<string, unknown>;
  try {
    logs = JSON.parse(raw);
  } catch {
    return null;
  }
  for (const [slug, v] of Object.entries(logs)) {
    const paths = typeof v === "string" ? [v] : Object.values(v ?? {});
    if (paths.some((p) => typeof p === "string" && p.includes(sid))) return slug;
  }
  return null;
}

/** 핀된 아바타 맵에서 이 에픽의 대표 그룹(에이전트 최빈 그룹). 오케스트레이터 슬롯은 제외. */
function dominantGroup(avatars: Record<string, AssignedAvatar>): AvatarGroup | null {
  const tally: Partial<Record<AvatarGroup, number>> = {};
  for (const [k, v] of Object.entries(avatars)) {
    if (k === ORCHESTRATOR_SLUG || !v) continue;
    tally[v.group] = (tally[v.group] ?? 0) + 1;
  }
  const entries = Object.entries(tally) as [AvatarGroup, number][];
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/** 이미 핀된 다른 에픽들의 대표 그룹 사용 횟수. 그룹 균형(decay) 계산용. */
function groupUsageCounts(excludeKey: string): Record<AvatarGroup, number> {
  const counts: Record<AvatarGroup, number> = { bts: 0, fromis: 0, ive: 0, rescene: 0, dobby: 0 };
  for (const k of epicKeys()) {
    if (k === excludeKey) continue;
    const g = dominantGroup(readPinnedAvatars(orderDir(k)));
    if (g) counts[g] += 1;
  }
  return counts;
}

/**
 * 그룹 균형(decay): 지금까지 **가장 적게 쓰인 그룹**을 고른다(동률은 에픽 키 해시로 결정적).
 * → 이미 많이 나온 그룹은 가중치가 떨어지고, 비노출 그룹의 출현율이 올라간다.
 */
function pickBalancedGroup(epicKey: string): AvatarGroup {
  const counts = groupUsageCounts(epicKey);
  const min = Math.min(...AVATAR_GROUPS.map((g) => counts[g]));
  const cands = AVATAR_GROUPS.filter((g) => counts[g] === min);
  return cands[avatarHash(epicKey) % cands.length];
}

/**
 * 에픽 아바타를 `avatars.json`에 1회 핀(고정)하고 반환한다.
 * - **최초 핀**: 그룹 균형(decay)으로 primary 그룹을 정해(비노출 그룹 우선) 배정.
 * - 실제 에이전트 슬러그는 그룹 응집으로 배정·고정(추가돼도 기존 불변).
 * - 오케스트레이터(`__orchestrator__`)는 슬롯을 소비하지 않고 파생: 인라인 구현이면 그
 *   에이전트와 **같은 아바타 공유**, 아니면 **에픽 대표 그룹 멤버 #0**(팀과 같은 그룹).
 */
function epicAvatars(
  epicKey: string,
  dir: string,
  slugs: string[],
  inlineSlug: string | null
): Record<string, AssignedAvatar> {
  const existing = readPinnedAvatars(dir);
  const realSlugs = slugs.filter((s) => s && s !== "-");
  // 실제 에이전트가 아직 없고 핀도 없으면: 핀하지 않고 임시 대표만 계산해 반환한다.
  // (여기서 오케스트레이터를 먼저 핀해버리면 firstPin이 소진돼, 나중에 생긴 에이전트는
  //  해시 그룹(primaryGroup)으로 배정되고 대표가 그 그룹으로 재파생돼 뒤집힌다 —
  //  균형그룹→에이전트그룹 플리커(FE1-1421 류). 에이전트가 생긴 뒤 한 번에 핀한다.)
  if (Object.keys(existing).length === 0 && realSlugs.length === 0) {
    return { [ORCHESTRATOR_SLUG]: groupFirstMember(pickBalancedGroup(epicKey)) };
  }
  const firstPin = Object.keys(existing).length === 0;
  // 최초 핀은 균형 그룹으로, 이후 핀은 **이미 확정된 그룹(기존 핀의 dominant)** 을 이어 쓴다.
  // undefined로 두면 assignOrderAvatars가 해시 primaryGroup으로 폴백해, 뒤늦게 붙는 에이전트
  // (예: review-agent)가 팀과 다른 그룹으로 튄다(FE1-1518: 팀=프로미스인데 리뷰어만 아이브).
  const forced = firstPin
    ? pickBalancedGroup(epicKey)
    : dominantGroup(existing) ?? pickBalancedGroup(epicKey);
  const obj = Object.fromEntries(assignOrderAvatars(epicKey, slugs, existing, forced));
  // 오케스트레이터 아바타 파생(핀 슬롯 미소비). 대표는 이 에픽 실제 그룹 기준으로 팀과 일치시킨다.
  const epicGroup = dominantGroup(obj) ?? forced ?? "dobby";
  const rep = groupFirstMember(epicGroup);
  const orch = inlineSlug && obj[inlineSlug] ? obj[inlineSlug] : rep;
  if (orch) obj[ORCHESTRATOR_SLUG] = orch;
  // 배정이 실제로 바뀌었을 때만 저장(읽기 경로의 불필요한 쓰기 방지).
  if (!sameAvatars(obj, existing)) {
    try {
      fs.writeFileSync(path.join(dir, "avatars.json"), JSON.stringify(obj, null, 2));
    } catch {
      /* 저장 실패는 무시 — 다음 로드에서 재시도 */
    }
  }
  return obj;
}

export function getEpic(epicKey: string): EpicDetail | null {
  const dir = orderDir(epicKey);
  if (!fs.existsSync(dir)) return null;
  const statusMd = readFileSafe(path.join(dir, "status.md"));
  const orchestration = orchestrationOf(epicKey, statusMd);
  if (!orchestration) return null;

  const contracts: Contract[] = [];
  const agentsDir = path.join(dir, "agents");
  if (fs.existsSync(agentsDir)) {
    for (const f of fs.readdirSync(agentsDir)) {
      if (!f.toLowerCase().endsWith(".md")) continue;
      const raw = readFileSafe(path.join(agentsDir, f)) ?? "";
      const role = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? f.replace(/\.md$/, "");
      contracts.push({ slug: f.replace(/\.md$/, ""), role, raw });
    }
  }

  const reviews: ReviewFile[] = [];
  const reviewsDir = path.join(dir, "reviews");
  if (fs.existsSync(reviewsDir)) {
    for (const rd of fs.readdirSync(reviewsDir, { withFileTypes: true })) {
      if (!rd.isDirectory()) continue;
      const round = Number(rd.name.match(/round-(\d+)/)?.[1] ?? 0);
      const roundDir = path.join(reviewsDir, rd.name);
      for (const f of fs.readdirSync(roundDir)) {
        if (!f.toLowerCase().endsWith(".md")) continue;
        reviews.push({ round, slug: f.replace(/\.md$/, ""), content: readFileSafe(path.join(roundDir, f)) ?? "" });
      }
    }
  }
  reviews.sort((a, b) => b.round - a.round || a.slug.localeCompare(b.slug));

  // 코드 변경(로그 기반): agent-logs.json(문자열/단계별 객체) 우선, 없으면 projects 자동탐색.
  // listConsoleAgents가 두 경우를 모두 평탄화(id=슬러그[::단계])해 주므로, 같은 슬러그의
  // 여러 단계(analysis/impl 등)를 하나로 합쳐 구현 diff·커밋이 드러나게 한다.
  const agentWorks: AgentWork[] = [];
  {
    const bySlug = new Map<string, AgentWork>();
    for (const ca of listConsoleAgents(epicKey)) {
      const parsed = parseAgentLog(ca.path);
      const cur = bySlug.get(ca.slug);
      if (cur) {
        cur.files = Array.from(new Set([...cur.files, ...parsed.files]));
        cur.diffs.push(...parsed.diffs);
        cur.commits.push(...parsed.commits);
        cur.found = cur.found || parsed.found;
        if (parsed.diffs.length && parsed.summary) cur.summary = parsed.summary;
      } else {
        bySlug.set(ca.slug, { slug: ca.slug, ...parsed });
      }
    }
    agentWorks.push(...bySlug.values());
  }
  agentWorks.sort((a, b) => a.slug.localeCompare(b.slug));

  const st = statusMd ? parseOrderStatus(statusMd, epicKey) : null;
  // 로그(Edit/Write)에 코드 변경이 없으면 워크트리 브랜치 diff로 보강한다(셸로 수정한 경우).
  if (st) fillGitChanges(agentWorks, orchestration.agents, st.worktrees);
  const avatars = epicAvatars(
    epicKey,
    dir,
    [
      ...orchestration.agents.map((a) => a.agent),
      ...contracts.map((c) => c.slug),
      ...agentWorks.map((w) => w.slug),
    ],
    inlineOrchestratorSlug(dir, statusMd)
  );
  return {
    epicKey,
    orchestration,
    contracts,
    reviews,
    agentWorks,
    avatars,
    workType: workTypeOf(epicKey, statusMd),
    orderKind: st?.orderKind ?? null,
    title: st?.meta.title ?? null,
    worktreeRemoved: st ? worktreesGone(st.worktrees) : false,
    resolved: st ? worktreesGone(st.worktrees) || st.phase === "해결" || st.phase === "종료" : false,
    phaseLabel: st ? phaseText(st.phaseRaw, st.phase) : null,
    analysisMd: readFileSafe(path.join(dir, "analysis.md")),
    implementationMd: readFileSafe(path.join(dir, "implementation.md")),
    produceMd:
      readFileSafe(path.join(dir, "produce.md")) ??
      readFileSafe(path.join(dir, "deliverables", "produce.md")),
    summaryMd: readFileSafe(path.join(dir, "summary.md")),
    decisionsMd: readFileSafe(path.join(dir, "decisions.md")),
    sideEffectsMd: readFileSafe(path.join(dir, "side-effects.md")),
    testGuideMd: readFileSafe(path.join(dir, "test-guide.md")),
    deliverables: readDeliverables(epicKey),
    runs: readRuns(epicKey),
    hasJob: fs.existsSync(path.join(getMetaDir(), ".mentis-jobs", epicKey, "run.json")),
    explainerMd: readFileSafe(path.join(dir, "explainer.md")),
    retroMd: readFileSafe(path.join(dir, "retro.md")),
    artifactShareUrl:
      (readFileSafe(path.join(dir, "artifact-share.md")) ?? "").match(
        /https?:\/\/[^\s)>\]]+/
      )?.[0] ?? null,
    jiraIssueMd: readFileSafe(path.join(dir, "jira-issue.md")),
    jiraIssueCleanMd: readFileSafe(path.join(dir, "jira-issue-clean.md")),
    jiraCommentsMd: readFileSafe(path.join(dir, "jira-comments.md")),
    jiraEnrichMd: readFileSafe(path.join(dir, "jira-enrich.md")),
    jiraPosted: readJiraPosted(dir),
  };
}

/** jira-enrich.json에서 게시 여부 플래그를 읽는다(없으면 빈 객체). */
function readJiraPosted(dir: string): { desc?: string; comment?: string } {
  const raw = readFileSafe(path.join(dir, "jira-enrich.json"));
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as { desc?: unknown; comment?: unknown };
    const r: { desc?: string; comment?: string } = {};
    if (typeof o.desc === "string") r.desc = o.desc;
    if (typeof o.comment === "string") r.comment = o.comment;
    return r;
  } catch {
    return {};
  }
}

/**
 * 사용자가 편집한 업데이트 초안을 jira-enrich.md에 저장한다(게시 전 수정용).
 * 잡이 아니라 직접 파일 쓰기.
 */
export function saveJiraEnrichDraft(key: string, text: string): { ok: boolean; reason?: string } {
  if (!ORDER_KEY_RE.test(key)) return { ok: false, reason: "invalid_key" };
  const dir = orderDir(key);
  if (!fs.existsSync(dir)) return { ok: false, reason: "no_order" };
  try {
    fs.writeFileSync(path.join(dir, "jira-enrich.md"), text, "utf8");
    return { ok: true };
  } catch {
    return { ok: false, reason: "write_failed" };
  }
}

/** 오더가 끝난 상태인가(목록 "작업 상태"와 동일 기준): dobby-end 종료 또는 dobby-resolve 해결. */
function orderFinished(e: EpicSummary): boolean {
  return e.worktreeRemoved || e.phase === "종료" || e.phase === "해결";
}
/** 시각 문자열의 날짜(YYYY-MM-DD) 부분. 없으면 null. */
function dateOf(v: string | null): string | null {
  const m = v?.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
/** 로컬 기준 YYYY-MM-DD. */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 허브 카드용 work-type별 지표(개발/비개발). 전부 **오더 개수** 기준.
 * - 위(overall): 전체 · 진행 중 · 완료(+ 정체 있으면 주의).
 * - 아래(today): 오늘 시작 · 오늘 완료 · 오늘 활동.
 */
export function orchestrationCardStats(workType: WorkType): CardStats {
  const epics = listEpics().filter((e) => e.workType === workType);
  const total = epics.length;
  if (total === 0) return { overall: [{ label: "오더", value: 0 }], today: [] };

  const done = epics.filter(orderFinished).length;
  const inProgress = total - done;
  const attention = epics.filter((e) => !orderFinished(e) && e.stalled).length;

  const today = ymd(new Date());
  const startedToday = epics.filter((e) => dateOf(e.firstActivity) === today).length;
  const doneToday = epics.filter((e) => orderFinished(e) && dateOf(e.lastActivity) === today).length;
  const activeToday = epics.filter((e) => dateOf(e.lastActivity) === today).length;

  return {
    overall: [
      { label: "전체", value: total },
      { label: "진행 중", value: inProgress, color: "blue" },
      { label: "완료", value: done, color: "green" },
      ...(attention > 0 ? [{ label: "주의", value: attention, color: "red" }] : []),
    ],
    today: [
      { label: "오늘 시작", value: startedToday },
      { label: "오늘 완료", value: doneToday, color: "green" },
      { label: "오늘 활동", value: activeToday, color: "blue" },
    ],
  };
}

/** 허브 오케스트레이션 지표. */
export function orchestrationMetrics(): Metric[] {
  const epics = listEpics();
  if (epics.length === 0) return [];
  const sum = (k: string) => epics.reduce((n, e) => n + (e.counts[k] ?? 0), 0);
  const impl = sum("구현");
  const review = sum("리뷰");
  const done = sum("완료");
  return [
    { label: "오더", value: epics.length },
    ...(impl > 0 ? [{ label: "구현", value: impl, color: "blue" }] : []),
    ...(review > 0 ? [{ label: "리뷰", value: review, color: "orange" }] : []),
    ...(done > 0 ? [{ label: "완료", value: done, color: "green" }] : []),
  ];
}
