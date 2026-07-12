/**
 * go-dobby 오더(이슈/작업) 통합 리더. (서버 전용, node I/O)
 * v1의 issues/lifecycle/orchestration 리더를 하나로 합친다.
 * 오더 = `$DOBBY_META/{키}/` 하나. status.md가 진행 인덱스이고, K/work-type은 속성이다.
 */
import fs from "node:fs";
import path from "node:path";
import { getMetaDir, orderDir, listOrderKeys, readFileSafe } from "@/lib/config";
import {
  parseOrderStatus,
  phaseKey,
  type OrderStatus,
  type PhaseKey,
} from "@/lib/parseOrderStatus";
import { getEpic, type EpicDetail } from "@/lib/orchestration";
import { normAgentState, type Orchestration } from "@/lib/parseOrchestration";
import { getReportRuns, type ReportRun } from "@/lib/issues";

/**
 * status.json(정본)을 OrderStatus로 매핑한다. 없거나 파싱 실패면 null → status.md 폴백.
 * 규격: mentis-plugins/plugins/go-dobby/reference/status-schema.md
 */
function statusFromJson(key: string, dir: string): OrderStatus | null {
  const raw = readFileSafe(path.join(dir, "status.json"));
  if (!raw) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  const s = (v: unknown) => (v == null ? "" : String(v));
  const sOrNull = (v: unknown) => (v == null || v === "" ? null : String(v));
  const num = (v: unknown) => (typeof v === "number" ? v : v == null ? null : Number(v) || null);
  const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : []);
  const phaseRaw = sOrNull(j.phase) ?? sOrNull(j.current);
  const wt = s(j.workType);
  const res = j.resolution as Record<string, unknown> | null | undefined;
  return {
    meta: {
      key,
      type: sOrNull(j.type),
      title: sOrNull(j.title),
      jira: sOrNull(j.jira),
      docPath: sOrNull(j.docPath),
    },
    phaseRaw,
    phase: phaseKey(phaseRaw),
    skill: sOrNull(j.skill),
    updatedAt: sOrNull(j.updatedAt),
    k: num(j.k),
    workTypeHint: wt === "code" ? "code" : wt === "nonsource" ? "nonsource" : null,
    agents: arr(j.agents).map((a) => ({
      agent: s(a.slug ?? a.agent),
      issue: s(a.issue),
      branch: s(a.branch),
      state: normAgentState(s(a.state)),
      round: s(a.round),
      updatedAt: s(a.updatedAt),
    })),
    progress: arr(j.progress).map((p) => ({
      phase: s(p.phase),
      skill: s(p.skill),
      state: s(p.state),
      artifact: s(p.artifact),
      updatedAt: s(p.updatedAt),
    })),
    testHistory: arr(j.testHistory).map((t) => ({
      round: s(t.round),
      startedAt: s(t.startedAt),
      state: s(t.state),
      countsRaw: `${s(t.pass) || 0}/${s(t.fail) || 0}/${s(t.skip) || 0}`,
      pass: num(t.pass),
      fail: num(t.fail),
      skip: num(t.skip),
      folder: s(t.folder),
    })),
    worktrees: arr(j.worktrees).map((w) => ({
      repo: s(w.repo),
      branch: s(w.branch),
      path: s(w.path),
    })),
    resolution: res
      ? { at: sOrNull(res.at), evidence: sOrNull(res.evidence), note: sOrNull(res.note) }
      : null,
    raw,
  };
}

/** status.json(정본) 우선, 없으면 status.md 파싱(폴백). */
function loadStatus(key: string): OrderStatus | null {
  const dir = orderDir(key);
  const j = statusFromJson(key, dir);
  if (j) return j;
  const md = readFileSafe(path.join(dir, "status.md"));
  return md ? parseOrderStatus(md, key) : null;
}

export type WorkType = "code" | "nonsource" | null;

export type OrderSummary = {
  key: string;
  /** TASK- 접두면 문서 전용 작업, 아니면 Jira 이슈 */
  kind: "issue" | "task";
  title: string | null;
  type: string | null;
  jira: string | null;
  docPath: string | null;
  phase: PhaseKey;
  phaseRaw: string | null;
  skill: string | null;
  /** 팬아웃 K */
  k: number | null;
  workType: WorkType;
  agentCount: number;
  /** 최신 테스트 회차 요약(status.md 이력 기반, 가벼움) */
  latestTest: { state: string; pass: number | null; fail: number | null; skip: number | null } | null;
  updatedAt: string | null;
  resolved: boolean;
  ended: boolean;
};

export type OrderDetail = OrderSummary & {
  status: OrderStatus;
  analysisMd: string | null;
  implementationMd: string | null;
  produceMd: string | null;
  testPlanMd: string | null;
  summaryMd: string | null;
  /** 비소스 산출물(deliverables/ 안, produce.md 제외). kind로 렌더 방식 구분. */
  deliverables: { name: string; content: string; kind: "md" | "html" | "other" }[];
  /** 테스트 회차(전체, 최신순) */
  runs: ReportRun[];
  /** K≥2 오케스트레이션 상세(K=1이면 null) */
  epic: EpicDetail | null;
};

/** deliverables/ 안의 산출물 파일들을 읽는다(produce.md 제외). md/html/기타 구분. */
function readDeliverables(
  key: string
): { name: string; content: string; kind: "md" | "html" | "other" }[] {
  const dir = path.join(orderDir(key), "deliverables");
  if (!fs.existsSync(dir)) return [];
  const out: { name: string; content: string; kind: "md" | "html" | "other" }[] = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f === "produce.md") continue;
      const lower = f.toLowerCase();
      const kind = lower.endsWith(".md")
        ? "md"
        : lower.endsWith(".html") || lower.endsWith(".htm")
        ? "html"
        : "other";
      // 큰 바이너리/기타는 내용을 읽지 않고 파일명만 표시
      const content = kind === "other" ? "" : readFileSafe(path.join(dir, f)) ?? "";
      out.push({ name: f, content, kind });
    }
  } catch {
    /* skip */
  }
  return out;
}

/**
 * K=1이라 orchestration.md가 없을 때, status.md의 에이전트 표(보통 1행)로
 * 최소 오케스트레이션을 합성한다. → K=1/K≥2 모두 "에이전트" 탭 칸반이 일관되게 보인다.
 * (계약·리뷰·이벤트는 비어 있어 보드가 칸반+요약만 깔끔하게 렌더된다.)
 */
function synthEpic(key: string, status: OrderStatus): EpicDetail | null {
  if (status.agents.length === 0) return null;
  const orchestration: Orchestration = {
    epicKey: key,
    mode: null,
    agents: status.agents,
    scope: [],
    conflicts: "",
    events: [],
    restMarkdown: "",
  };
  return { epicKey: key, orchestration, contracts: [], reviews: [], agentWorks: [] };
}

/** implementation.md / produce.md 존재로 work-type 추론. */
/** work-type: produce.md/implementation.md 파일 추론 우선, 없으면 deliverables/·status.md 힌트. */
function inferWorkType(key: string, status: OrderStatus): WorkType {
  const dir = orderDir(key);
  if (fs.existsSync(path.join(dir, "produce.md"))) return "nonsource";
  if (fs.existsSync(path.join(dir, "implementation.md"))) return "code";
  if (fs.existsSync(path.join(dir, "deliverables"))) return "nonsource";
  return status.workTypeHint;
}

function toSummary(key: string, status: OrderStatus): OrderSummary {
  const latest = status.testHistory[0] ?? null;
  return {
    key,
    kind: key.startsWith("TASK-") ? "task" : "issue",
    title: status.meta.title,
    type: status.meta.type,
    jira: status.meta.jira,
    docPath: status.meta.docPath,
    phase: status.phase,
    phaseRaw: status.phaseRaw,
    skill: status.skill,
    k: status.k,
    workType: inferWorkType(key, status),
    agentCount: status.agents.length,
    latestTest: latest
      ? { state: latest.state, pass: latest.pass, fail: latest.fail, skip: latest.skip }
      : null,
    updatedAt: status.updatedAt,
    resolved: status.phase === "해결" || status.phase === "종료",
    ended: status.phase === "종료" || fs.existsSync(path.join(orderDir(key), "summary.md")),
  };
}

/** 오더 목록. status.md만 읽어 가볍게 요약한다(상세 파일·로그는 읽지 않음). */
export function listOrders(): OrderSummary[] {
  const orders: OrderSummary[] = [];
  for (const key of listOrderKeys()) {
    const st = loadStatus(key);
    if (!st) continue;
    orders.push(toSummary(key, st));
  }
  orders.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return orders;
}

/** 오더 상세. 폴더 전체를 파싱한다(탭에서 필요한 산출물 포함). */
export function getOrder(key: string): OrderDetail | null {
  const dir = orderDir(key);
  const status = loadStatus(key); // status.json 우선, 없으면 status.md
  if (!status) return null;
  return {
    ...toSummary(key, status),
    status,
    analysisMd: readFileSafe(path.join(dir, "analysis.md")),
    implementationMd: readFileSafe(path.join(dir, "implementation.md")),
    // produce.md는 루트 또는 deliverables/ 안(실제 skill 포맷) 모두 대응
    produceMd:
      readFileSafe(path.join(dir, "produce.md")) ??
      readFileSafe(path.join(dir, "deliverables", "produce.md")),
    testPlanMd: readFileSafe(path.join(dir, "test-plan.md")),
    summaryMd: readFileSafe(path.join(dir, "summary.md")),
    deliverables: readDeliverables(key),
    runs: getReportRuns(key),
    // K≥2면 실제 오케스트레이션, K=1이면 status.md 에이전트로 합성(칸반 일관성)
    epic: getEpic(key) ?? synthEpic(key, status),
  };
}

// ── 허브 지표 ──────────────────────────────────────────────

export type Metric = { label: string; value: number; today?: number; color?: string };

function ymd(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** 허브 지표: 전체·단계별 분포·오늘 갱신. (Date.now 없이 파일 기반이라 today는 갱신일 문자열 비교) */
export function getMetrics(todayYmd: string): Metric[] {
  const orders = listOrders();
  if (orders.length === 0) return [];
  const count = (p: PhaseKey) => orders.filter((o) => o.phase === p).length;
  const active = orders.filter((o) => !o.resolved && !o.ended).length;
  const updatedToday = orders.filter((o) => ymd(o.updatedAt) === todayYmd).length;
  const review = orders.filter((o) => o.phase === "리뷰").length;
  const resolved = orders.filter((o) => o.phase === "해결").length;
  const ended = count("종료");
  return [
    { label: "오더", value: orders.length, today: updatedToday },
    { label: "진행중", value: active, color: "blue" },
    ...(review > 0 ? [{ label: "리뷰", value: review, color: "orange" }] : []),
    ...(resolved > 0 ? [{ label: "해결", value: resolved, color: "green" }] : []),
    ...(ended > 0 ? [{ label: "종료", value: ended, color: "default" }] : []),
  ];
}
