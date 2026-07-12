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
  type OrderStatus,
  type PhaseKey,
} from "@/lib/parseOrderStatus";
import { getEpic, type EpicDetail } from "@/lib/orchestration";
import type { Orchestration } from "@/lib/parseOrchestration";
import { getReportRuns, type ReportRun } from "@/lib/issues";

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
  /** 비소스 산출물(deliverables/ 안의 md, produce.md 제외) */
  deliverables: { name: string; content: string }[];
  /** 테스트 회차(전체, 최신순) */
  runs: ReportRun[];
  /** K≥2 오케스트레이션 상세(K=1이면 null) */
  epic: EpicDetail | null;
};

/** deliverables/ 안의 md 파일들을 읽는다(produce.md는 제외 — 요약으로 따로 표시). */
function readDeliverables(key: string): { name: string; content: string }[] {
  const dir = path.join(orderDir(key), "deliverables");
  if (!fs.existsSync(dir)) return [];
  const out: { name: string; content: string }[] = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith(".md") || f === "produce.md") continue;
      const c = readFileSafe(path.join(dir, f));
      if (c != null) out.push({ name: f, content: c });
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
    const md = readFileSafe(path.join(orderDir(key), "status.md"));
    if (!md) continue;
    orders.push(toSummary(key, parseOrderStatus(md, key)));
  }
  orders.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return orders;
}

/** 오더 상세. 폴더 전체를 파싱한다(탭에서 필요한 산출물 포함). */
export function getOrder(key: string): OrderDetail | null {
  const dir = orderDir(key);
  const md = readFileSafe(path.join(dir, "status.md"));
  if (!md) return null;
  const status = parseOrderStatus(md, key);
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
