/** /do 오더 회고 결과(retro.json). 숫자(basis·measure)는 go-dobby 측정 헬퍼가, 나머지는 회고 세션이 쓴다. */

export type RetroSegment = {
  when: string;
  stage: string;
  group: string;
  mode: "새로" | "이어 씀";
  calls: number;
  ctxStart: number | null;
  ctxEnd: number | null;
  cost: number;
  active: number;
  gap?: number;
  ttl?: number;
  altCost?: number;
  altTime?: number;
  diffPct?: number;
  judge: string;
  best?: string;
};

export type RetroFix = { where: "스킬" | "서버" | "사람"; target?: string; change: string };

export type RetroTotal = { cost: number; time: number };

export type RetroData = {
  basis: { phase: string; lastSession: string; changes: number; testRounds: number; madeAt: string };
  measure: {
    fastPct: number;
    reuseRule: { maxCtx: number; maxGap: number };
    sessions: number;
    missing: number;
    medians: { start: number | null; first: number | null; startup: number | null };
    totals: { actual: RetroTotal; allNew: RetroTotal; rule: RetroTotal; best: RetroTotal };
    byStage: { group: string; sessions: number; calls: number; cost: number; active: number }[];
    segments: RetroSegment[];
  };
  summary?: string;
  sessionFindings?: { title: string; segments?: string[]; why?: string; impact?: number; evidence?: string[] }[];
  ruleProposals?: { title: string; target: string; value: string; why?: string; evidence?: string[] }[];
  defects?: {
    title: string;
    change?: number;
    foundAt: string;
    couldAt?: string;
    judgment?: string;
    what?: string;
    why?: string;
    prevent?: string;
    causes?: string[];
    fixes?: RetroFix[];
    evidence?: string[];
  }[];
  proposals?: { type?: string; title: string; target?: string; section?: string; text?: string; evidence?: string[] }[];
  evidence?: string[];
};

export function parseRetroJson(raw: string | null): RetroData | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as RetroData;
    return o?.basis && o?.measure?.totals ? o : null;
  } catch {
    return null;
  }
}

/** 잘못한 판단을 그리는 단계 띠. go-dobby 회고 절차(do-order.md)의 foundAt·couldAt 이름과 같다. */
export const RETRO_STAGES = ["설계", "구현", "리뷰", "통합", "배포", "검증", "사람 확인"] as const;

/**
 * 한 건의 판단을 그릴 단계 띠. 산출(문서·조사) 단계에서 잡혔거나 잡을 수 있었던 판단이면 구현 다음에 산출 칸을 더한다.
 * 그 밖의 회고는 지금까지와 같은 일곱 칸이다.
 */
export function retroStages(found: string, could?: string): readonly string[] {
  if (found !== "산출" && could !== "산출") return RETRO_STAGES;
  return RETRO_STAGES.flatMap((s) => (s === "구현" ? [s, "산출"] : [s]));
}

/**
 * 회고를 막는 이유. 없으면 null. go-dobby `dobby_retro_gate` 와 같은 조건이다 —
 * 회고는 멈춘 오더에서만 한다. 진행 중에 만든 회고는 곧 낡고, 아직 쌓이는 세션을 잘못 센다.
 */
export function retroBlockReason(o: {
  autoRunning: boolean;
  busyAgents: string[];
  liveSessions: number;
  qaActive: boolean;
}): string | null {
  if (o.autoRunning) return "자동 실행이 돌고 있습니다. 끝나고 멈춘 뒤에 회고할 수 있습니다.";
  if (o.busyAgents.length) return `${o.busyAgents.join(", ")} 담당자가 아직 일하는 중입니다.`;
  if (o.liveSessions > 0) return "이 오더를 잡고 일하는 세션이 있습니다. 세션이 끝난 뒤에 회고할 수 있습니다.";
  if (o.qaActive) return "QA 감시가 돌고 있습니다. 감시를 멈춘 뒤에 회고할 수 있습니다.";
  return null;
}
