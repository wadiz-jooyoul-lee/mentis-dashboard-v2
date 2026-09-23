import fs from "node:fs";
import path from "node:path";
import { parseReport, type Verdict } from "@/lib/parseReport";

/**
 * 한 오더의 테스트 회차를 전부 모아 "무엇을 확인했고 어느 회차에서 봤나"로 다시 묶는다.
 *
 * 회차 하나만 보면 "1회차에서 무엇을 봤고 2회차에서 무엇이 달라졌나"를 알 수 없다.
 * 재실행한 회차는 대개 앞 회차의 일부만 다시 돌리므로, 항목별로 합쳐 봐야 전체가 보인다.
 *
 * ⛔ 결과를 파일로 남기지 않는다. 실측 1.1ms(오더 41개·회차 76개 전부 44ms)라 볼 때마다
 * 새로 세는 편이 싸고, 저장하면 회차가 늘 때마다 어긋난다.
 */

export type RunLine = {
  /** 폴더 이름(= 회차 id) */
  id: string;
  /** 1부터 — 시각 순 */
  no: number;
  label: string;
  /** dev·rc4 등. 못 찾으면 빈 문자열. */
  env: string;
  pass: number;
  fail: number;
  skip: number;
};

export type ItemLine = {
  /** 시나리오 번호(S1 등). 없으면 빈 문자열. */
  num: string;
  /** 이 항목이 확인하는 해결 조건 번호들(C1 등). 안 적혔으면 빈 배열. */
  conds: string[];
  /** 확인 항목 이름 — 가장 최근 회차에 적힌 것 */
  name: string;
  /** 이 항목을 확인한 회차 번호들 */
  runs: number[];
  /** 가장 최근 회차의 판정 */
  verdict: Verdict;
  /** 회차마다 판정이 달랐으면 그 흐름(예 fail→pass). 같으면 null. */
  changed: Verdict[] | null;
  /** 보류·실패일 때 왜인지 — 최근 회차의 실제/근거 */
  note: string;
};

export type ConditionLine = {
  /** C1 등 */
  id: string;
  text: string;
  /** 이 조건을 확인한 시나리오 번호들 */
  items: string[];
  /** 그 시나리오들을 합친 판정. 확인한 시나리오가 없으면 unknown. */
  verdict: Verdict;
};

export type TestSummary = {
  runs: RunLine[];
  items: ItemLine[];
  /**
   * status.md `## 닫히는 조건 항목` 표(C1…)에 테스트 결과를 붙인 것.
   * 조건을 쪼개 적지 않은 오더는 빈 배열 — 그때는 화면이 조건 섹션을 아예 안 그린다.
   */
  conditions: ConditionLine[];
  /** 고유 항목 기준 집계 — 회차를 여러 번 돌아도 한 번만 센다. */
  pass: number;
  fail: number;
  skip: number;
  /** status.md 의 닫히는 조건(한 줄). 없으면 null. */
  closing: string | null;
};

/**
 * 회차를 어느 환경에서 봤나(dev·rc4·stage…).
 *
 * 헬퍼가 `- **환경**:` 줄을 깔아 주기 전에 쌓인 회차는 표기가 제각각이다(실측 78개 중 40개만
 * 읽혔다). 아래를 다 받는다 — 값만 멀쩡히 들어 있지 라벨이 다를 뿐이다.
 *   `- **환경**: dev`  `- 환경: dev`  `- 환경: **dev**`  `대상 환경: rc4 어드민`  `| 환경 | dev |`
 */
function findEnv(md: string): string {
  const bullet = md.match(
    /^\s*[-*]?\s*\*{0,2}(?:대상\s*)?(?:환경|실행 환경|테스트 환경)\*{0,2}\s*[:：]\s*(.+)$/m
  );
  const table = md.match(/^\|\s*(?:환경|실행 환경|테스트 환경)\s*\|\s*([^|]+)\|/m);
  // 값 앞에도 꾸밈이 붙는다(`**dev**`, `` `rc4` ``).
  const raw = (bullet?.[1] ?? table?.[1] ?? "").trim().replace(/^[*`\s]+/, "");
  // 주소로 적은 회차가 있다 — 호스트 앞자리가 환경 이름이다(`https://stage.wadiz.io` → stage,
  // `www.wadiz.io` → 라이브).
  const host = raw.match(/^(?:https?:\/\/)?([A-Za-z0-9-]+)\.(?:[A-Za-z0-9-]+\.)*(?:io|kr|com)\b/);
  if (host) return host[1] === "www" ? "live" : host[1];
  // `rc4 (https://rc4.wadiz.io)` · `dev, 크롬 데스크톱, 창 너비 1440` 처럼 뒤에 설명이 붙는다.
  // 앞의 이름만 남긴다.
  const token = raw.split(/[\s,(—]/)[0].replace(/[*`'"]/g, "");
  if (/^라이브/.test(token)) return "live";
  if (/^로컬/.test(token)) return "local";
  // 환경 이름은 늘 영문이다. 우리말이 잡혔으면 설명 문장을 문 것이니 빈칸으로 둔다 —
  // 릴리즈 노트 환경 칸에 `빈` 같은 토막이 들어가는 것보다 낫다.
  return /^[A-Za-z][A-Za-z0-9]*$/.test(token) ? token : "";
}

/**
 * status.md 에서 닫히는 조건 한 줄과 그것을 쪼갠 조건 항목을 **한 번 읽어** 같이 뽑는다.
 *
 * ⛔ 조건 항목은 `## 닫히는 조건 항목` 아래의 표만 본다. 문서 전체에서 `| C1 |` 를 찾으면
 * 다른 표(회귀 목록 등)의 행까지 조건으로 센다.
 */
function readClosing(dir: string): {
  closing: string | null;
  conditions: { id: string; text: string }[];
} {
  let md: string;
  try {
    md = fs.readFileSync(path.join(dir, "status.md"), "utf8");
  } catch {
    return { closing: null, conditions: [] };
  }
  const one = md.match(/^\s*-\s*\*\*닫히는 조건\*\*\s*[:：]\s*(.+)$/m);
  const conditions: { id: string; text: string }[] = [];
  let inSection = false;
  for (const line of md.split("\n")) {
    if (/^##\s/.test(line)) {
      inSection = line.includes("닫히는 조건 항목");
      continue;
    }
    if (!inSection) continue;
    const m = line.match(/^\|\s*(C\d+)\s*\|\s*(.+?)\s*\|\s*$/);
    if (m) conditions.push({ id: m[1], text: m[2].trim() });
  }
  return { closing: one ? one[1].trim() : null, conditions };
}

/** `C1·C2` · `C1, C2` 어느 쪽으로 적혀 있어도 번호만 뽑는다. */
function parseConds(cell: string): string[] {
  return [...cell.matchAll(/C\d+/g)].map((m) => m[0]);
}

export function summarizeRuns(orderDir: string): TestSummary | null {
  const runsDir = path.join(orderDir, "test-runs");
  let entries: string[];
  try {
    entries = fs.readdirSync(runsDir).sort();
  } catch {
    return null;
  }

  const runs: RunLine[] = [];
  // 시나리오 번호 → 회차별 판정.
  // ⛔ 이름으로 묶으면 안 된다. 회차마다 같은 것을 다르게 적는다
  // (1회차 `홈 — 친구 활동 더보기` / 2회차 `/web/main`). 번호가 없을 때만 이름으로 묶는다.
  const seen = new Map<
    string,
    { num: string; name: string; conds: string[]; runs: number[]; verdicts: Verdict[]; note: string }
  >();

  for (const id of entries) {
    const dir = path.join(runsDir, id);
    let file: string | undefined;
    try {
      const mds = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".md"));
      file = mds.find((f) => /result/i.test(f)) ?? mds[0];
    } catch {
      continue;
    }
    if (!file) continue;
    let md: string;
    try {
      md = fs.readFileSync(path.join(dir, file), "utf8");
    } catch {
      continue;
    }

    const { scenarios, counts } = parseReport(md);
    const m = id.match(/(\d{4})-?(\d{2})-?(\d{2})[-_ ]?(\d{2}):?(\d{2})/);
    const no = runs.length + 1;
    runs.push({
      id,
      no,
      label: m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : id,
      env: findEnv(md),
      pass: counts.pass,
      fail: counts.fail,
      skip: counts.skip + counts.warn,
    });

    for (const s of scenarios) {
      const num = (s.num || "").trim();
      const name = (s.check || s.page || "").trim();
      const key = num || name;
      if (!key) continue;
      const cur = seen.get(key) ?? { num, name, conds: [], runs: [], verdicts: [], note: "" };
      // 이름·조건은 최근 회차 것으로 갱신한다(뒤 회차가 더 다듬어져 있는 편이다).
      if (name) cur.name = name;
      const conds = parseConds(s.cond || "");
      if (conds.length) cur.conds = conds;
      cur.runs.push(no);
      cur.verdicts.push(s.verdict);
      if (s.verdict === "fail" || s.verdict === "skip" || s.verdict === "warn") {
        cur.note = (s.actual || s.evidence || s.expected || "").trim();
      }
      seen.set(key, cur);
    }
  }

  if (runs.length === 0) return null;

  const items: ItemLine[] = [...seen.values()].map((v) => {
    const last = v.verdicts[v.verdicts.length - 1];
    const varied = new Set(v.verdicts).size > 1;
    return {
      num: v.num,
      conds: v.conds,
      name: v.name,
      runs: v.runs,
      verdict: last,
      changed: varied ? v.verdicts : null,
      note: v.note,
    };
  });

  const { closing, conditions: declared } = readClosing(orderDir);
  // 조건마다 그것을 확인한 시나리오를 모아 판정을 합친다.
  // 하나라도 실패면 실패, 보류가 섞였으면 보류, 전부 통과여야 통과다 — 통과가 제일 엄하다.
  const conditions: ConditionLine[] = declared.map((c) => {
    const mine = items.filter((i) => i.conds.includes(c.id));
    const verdict: Verdict =
      mine.length === 0
        ? "unknown"
        : mine.some((i) => i.verdict === "fail")
          ? "fail"
          : mine.some((i) => i.verdict === "skip" || i.verdict === "warn")
            ? "skip"
            : "pass";
    return { id: c.id, text: c.text, items: mine.map((i) => i.num || i.name), verdict };
  });

  return {
    runs,
    items,
    conditions,
    pass: items.filter((i) => i.verdict === "pass").length,
    fail: items.filter((i) => i.verdict === "fail").length,
    skip: items.filter((i) => i.verdict === "skip" || i.verdict === "warn").length,
    closing,
  };
}
