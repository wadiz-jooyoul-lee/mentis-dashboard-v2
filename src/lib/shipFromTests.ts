import { summarizeRuns } from "@/lib/testSummary";
import type { ShipRow } from "@/lib/parseOrderStatus";

/**
 * `## 배포` 기록이 없는 환경을 **검증 회차에서 미루어** 배포 행으로 만든다.
 *
 * 왜 필요한가: `## 배포` 표는 dobby-ship 이 쓰는데 최근에 생겨서, 실측 오더 138개 중
 * 2개에만 있다. 반면 검증 회차(test-runs)에는 어느 환경에서 봤는지가 적혀 있고 44개
 * 오더가 가지고 있다. 그것만으로도 보드의 배포 칸이 2개에서 38개로 는다.
 *
 * ⛔ 기록을 덮지 않는다. `## 배포` 에 그 환경 행이 이미 있으면 그대로 두고, 없는 환경만
 * 보탠다. PR·리뷰·머지·빌드는 dobby-ship 을 돌려야 알 수 있는 값이라 **비운다** —
 * 검증 기록이 말해 주는 사실은 "이 환경에서 검증했다" 하나뿐이다.
 */

/**
 * 같은 곳인데 다르게 적힌 이름을 합친다.
 *
 * `cdev` 는 `dev.wadiz.io` 를 가리키는 다른 이름이다. 회차 본문에 주소를 앞에 쓰면
 * (`dev.wadiz.io (cdev)`) `dev` 로, 이름을 앞에 쓰면 (`cdev = https://dev.wadiz.io`)
 * `cdev` 로 갈려서, 같은 서버가 태그 두 개로 보인다.
 */
const ENV_ALIAS: Record<string, string> = { cdev: "dev" };

/**
 * 태그를 늘어놓는 차례 — 앞에서 뒤로 나아가는 순서다.
 * 여기 없는 이름(새 환경)은 뒤로 민다.
 */
const ENV_ORDER = ["local", "dev", "rc", "rc1", "rc2", "rc4", "stage", "live"];

/** ENV_ORDER 차례. 목록에 없으면 뒤로 민다. */
function envRank(env: string): number {
  const i = ENV_ORDER.indexOf(env);
  return i === -1 ? ENV_ORDER.length : i;
}

/** 회차에 적힌 환경 이름을 태그에 쓸 이름으로 고친다. */
function normalizeEnv(raw: string): string {
  const v = raw.trim().toLowerCase(); // 실측 `RC(rc.wadiz.kr)` 한 건만 대문자였다
  return v ? (ENV_ALIAS[v] ?? v) : "";
}

export function shipFromTestRuns(orderDir: string, recorded: ShipRow[]): ShipRow[] {
  const summary = summarizeRuns(orderDir);
  if (!summary?.runs.length) return recorded;

  const known = new Set(recorded.map((r) => r.env));
  // 한 환경을 여러 회차 돌렸으면 마지막 회차가 지금 상태다. 회차는 시각 순이라 뒤가 이긴다.
  const latest = new Map<string, (typeof summary.runs)[number]>();
  for (const run of summary.runs) {
    const env = normalizeEnv(run.env);
    if (!env || known.has(env)) continue;
    latest.set(env, run);
  }
  if (!latest.size) return recorded;

  const made: ShipRow[] = [...latest].map(([env, run]) => {
    // ⛔ 실패가 있다고 «검증 중» 으로 두지 않는다. 검증은 **돌았고 끝났다** — 결과가 나쁠 뿐이다.
    // 진행중으로 보이면 «기다리면 되는 일» 로 읽혀, 사람이 손대야 하는 자리가 묻힌다.
    // 끝난 것으로 두고 빨갛게 세운다.
    const ran = run.pass + run.fail > 0;
    return {
      env,
      stage: ran ? "검증 완료" : "검증 중",
      pr: null,
      build: null,
      updatedAt: run.label || null,
      note: run.fail > 0 ? `실패 ${run.fail}건` : null,
      blocked: run.fail > 0,
      milestone: 4, // 다섯 칸 중 마지막(검증) — 앞 네 칸은 모르므로 켜지 않는다
      done: ran,
      inferred: true,
    };
  });
  // 기록이 앞, 추론이 뒤로 붙으면 dev 다음에 rc4, 그다음에 다시 dev 가 오는 줄이 생긴다.
  // 환경이 나아가는 차례로 다시 늘어놓아야 어디까지 갔는지가 한눈에 읽힌다.
  return [...recorded, ...made].sort((a, b) => envRank(a.env) - envRank(b.env));
}
