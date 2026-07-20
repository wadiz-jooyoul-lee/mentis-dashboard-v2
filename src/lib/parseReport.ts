/**
 * issue-test 결과 md를 구조화한다. (순수 함수, node 의존 없음 → 클라이언트에서 사용 가능)
 * 구 포맷(상단 불릿 + 시나리오 표)과 신 포맷(## 한눈 요약 + 시나리오별 결과(전체))을 모두 지원한다.
 */

export type Verdict = "pass" | "fail" | "skip" | "warn" | "unknown";

export type Scenario = {
  num: string;
  page: string;
  check: string;
  expected: string;
  actual: string;
  evidence: string;
  verdict: Verdict;
};

export type MetaItem = { label: string; value: string };

export type Counts = {
  total: number;
  pass: number;
  fail: number;
  skip: number;
  warn: number;
};

export type ParsedReport = {
  title: string;
  meta: MetaItem[];
  scenarios: Scenario[];
  counts: Counts;
  /** 메타·시나리오 표를 제거한 나머지 마크다운(변경요약·상세·근거 등) */
  restMarkdown: string;
};

const META_RE = /^\s*-\s*\*\*(.+?)\*\*\s*[:：]\s*(.+?)\s*$/;

export function normalizeVerdict(raw: string): Verdict {
  const s = raw.replace(/\*/g, "").trim();
  if (/❌|FAIL/i.test(s)) return "fail";
  if (/⏭️|⏭|SKIP/i.test(s)) return "skip";
  if (/⚠️|⚠|주의|WARN/i.test(s)) return "warn";
  if (/✅|PASS/i.test(s)) return "pass";
  return "unknown";
}

function splitRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}

/** 헤더 셀에 특정 키워드가 포함된 컬럼의 인덱스를 찾는다. */
function colIndex(headers: string[], ...keywords: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].replace(/\*/g, "");
    if (keywords.some((k) => h.includes(k))) return i;
  }
  return -1;
}

type TableBlock = { start: number; end: number; headers: string[] };

function tableAt(lines: string[], i: number): TableBlock {
  const headers = splitRow(lines[i]);
  let end = i;
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim().startsWith("|")) end = j;
    else break;
  }
  return { start: i, end, headers };
}

/**
 * 시나리오 표 블록을 찾는다.
 * 1순위: "판정" 컬럼이 있는 표. 2순위: "결과" 컬럼 + 시나리오/ID 성격의 표.
 * (스킬 출력 편차 대응: 판정/결과 컬럼명 모두 지원)
 */
function findScenarioTable(lines: string[]): TableBlock | null {
  let fallback: TableBlock | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith("|")) continue;
    const headers = splitRow(lines[i]).map((h) => h.replace(/\*/g, ""));
    if (headers.some((h) => h.includes("판정"))) return tableAt(lines, i);
    if (
      !fallback &&
      headers.some((h) => h.includes("결과")) &&
      headers.some((h) => /시나리오|확인|항목|ID|#|URL|페이지/i.test(h))
    ) {
      fallback = tableAt(lines, i);
    }
  }
  return fallback;
}

function parseScenarios(lines: string[], table: TableBlock): Scenario[] {
  const { headers, start, end } = table;
  const idxNum = colIndex(headers, "#", "ID");
  const idxPage = colIndex(headers, "페이지", "URL");
  const idxCheck = colIndex(headers, "확인", "항목", "시나리오");
  const idxExpected = colIndex(headers, "기대");
  const idxActual = colIndex(headers, "실제");
  // 판정 우선, 없으면 결과 컬럼을 판정으로 사용
  const idxVerdict =
    colIndex(headers, "판정") >= 0
      ? colIndex(headers, "판정")
      : colIndex(headers, "결과");
  const idxEvidence = colIndex(headers, "근거");

  const at = (cells: string[], i: number) =>
    i >= 0 && i < cells.length ? cells[i] : "";

  const rows: Scenario[] = [];
  // start = 헤더, start+1 = 구분선, 이후가 데이터 행
  for (let i = start + 2; i <= end; i++) {
    const cells = splitRow(lines[i]);
    // 구분선(---만 있는 행) 스킵
    if (cells.every((c) => /^:?-{1,}:?$/.test(c) || c === "")) continue;
    rows.push({
      num: at(cells, idxNum),
      page: at(cells, idxPage),
      check: at(cells, idxCheck),
      expected: at(cells, idxExpected),
      actual: at(cells, idxActual),
      evidence: at(cells, idxEvidence),
      verdict: normalizeVerdict(at(cells, idxVerdict)),
    });
  }
  return rows;
}

function countVerdicts(scenarios: Scenario[]): Counts {
  const counts: Counts = { total: 0, pass: 0, fail: 0, skip: 0, warn: 0 };
  for (const s of scenarios) {
    counts.total++;
    if (s.verdict === "pass") counts.pass++;
    else if (s.verdict === "fail") counts.fail++;
    else if (s.verdict === "skip") counts.skip++;
    else if (s.verdict === "warn") counts.warn++;
  }
  return counts;
}

/**
 * 표가 없는 신 포맷 대비 — 집계 요약 한 줄("PASS 2 / FAIL 0 / SKIP 4",
 * "통과 2 · 실패 0 · 스킵 4" 등)에서 직접 카운트를 뽑는다. PASS·FAIL을 모두 포함한
 * 줄만 요약으로 인정한다(개별 시나리오 헤딩의 "— PASS" 오탐 방지).
 */
function findSummaryCounts(lines: string[]): Counts | null {
  for (const line of lines) {
    if (!/(PASS|통과)/i.test(line) || !/(FAIL|실패)/i.test(line)) continue;
    const n = (re: RegExp) => {
      const m = line.match(re);
      return m ? parseInt(m[1], 10) : 0;
    };
    const pass = n(/(?:PASS|통과)\s*[:：]?\s*(\d+)/i);
    const fail = n(/(?:FAIL|실패)\s*[:：]?\s*(\d+)/i);
    const skip = n(/(?:SKIP|스킵)\s*[:：]?\s*(\d+)/i);
    const warn = n(/(?:WARN|주의)\s*[:：]?\s*(\d+)/i);
    const total = pass + fail + skip + warn;
    if (total > 0) return { total, pass, fail, skip, warn };
  }
  return null;
}

/**
 * 표가 없을 때 시나리오 헤딩("### TC-1 … — PASS")·판정 불릿("- 판정: PASS")에서 카운트한다.
 * 요약 라인이 없을 때의 폴백.
 */
function countHeadingVerdicts(lines: string[]): Counts {
  const counts: Counts = { total: 0, pass: 0, fail: 0, skip: 0, warn: 0 };
  const HEAD = /^#{2,4}\s+.+?\s*[—–-]\s*\*{0,2}(PASS|FAIL|SKIP|WARN|주의|통과|실패|스킵)\b/i;
  const BULLET = /^\s*[-*]\s*\*{0,2}판정\*{0,2}\s*[:：]\s*\*{0,2}(PASS|FAIL|SKIP|WARN|주의|통과|실패|스킵)\b/i;
  for (const line of lines) {
    const m = line.match(HEAD) ?? line.match(BULLET);
    if (!m) continue;
    const v = normalizeVerdict(m[1]);
    counts.total++;
    if (v === "pass") counts.pass++;
    else if (v === "fail") counts.fail++;
    else if (v === "skip") counts.skip++;
    else if (v === "warn") counts.warn++;
  }
  return counts;
}

export function parseReport(md: string): ParsedReport {
  const lines = md.split("\n");

  // 제목: 첫 번째 # 헤딩
  let titleIdx = lines.findIndex((l) => /^#\s+/.test(l));
  const title =
    titleIdx >= 0 ? lines[titleIdx].replace(/^#\s+/, "").trim() : "";

  const table = findScenarioTable(lines);
  const scenarios = table ? parseScenarios(lines, table) : [];
  let counts = countVerdicts(scenarios);
  // 표가 없어 집계가 비면(신 포맷) 요약 라인 → 헤딩/판정 불릿 순으로 카운트를 보정한다.
  if (counts.total === 0) {
    const alt = findSummaryCounts(lines) ?? countHeadingVerdicts(lines);
    if (alt.total > 0) counts = alt;
  }

  // 메타 수집 범위: 표 시작 전(표 없으면 "변경 요약" 헤딩 전, 그것도 없으면 전체)
  let metaEnd = lines.length;
  if (table) metaEnd = table.start;
  else {
    const changeIdx = lines.findIndex((l) => /^##\s+변경\s*요약/.test(l));
    if (changeIdx >= 0) metaEnd = changeIdx;
  }

  const meta: MetaItem[] = [];
  const dropIdx = new Set<number>();
  if (titleIdx >= 0) dropIdx.add(titleIdx);
  for (let i = 0; i < metaEnd; i++) {
    const m = lines[i].match(META_RE);
    if (m) {
      meta.push({ label: m[1].trim(), value: m[2].trim() });
      dropIdx.add(i);
    }
  }
  // 시나리오 표 라인 제거
  if (table) {
    for (let i = table.start; i <= table.end; i++) dropIdx.add(i);
    // 표 바로 위의 "## 시나리오..." 헤딩도 제거(중복 방지)
    for (let i = table.start - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (t === "") continue;
      if (/^##+\s*시나리오/.test(t)) dropIdx.add(i);
      break;
    }
  }

  const restMarkdown = lines
    .filter((_, i) => !dropIdx.has(i))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, meta, scenarios, counts, restMarkdown };
}

/** 카운트로 종합 판정을 낸다. */
export function overallStatus(counts: Counts): {
  label: string;
  color: string;
  status: "success" | "warning" | "error";
} {
  if (counts.total === 0)
    return { label: "결과 없음", color: "default", status: "warning" };
  if (counts.fail === 0)
    return { label: "통과", color: "success", status: "success" };
  if (counts.pass > 0)
    return { label: "부분 통과", color: "warning", status: "warning" };
  return { label: "실패", color: "error", status: "error" };
}
