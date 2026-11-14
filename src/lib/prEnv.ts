/** 환경별 PR 대상 브랜치 — 저장소마다 원격에 실제로 있는 브랜치. com.wadiz.web 의 개발 환경은 cloud_dev. */
const ENV_BRANCHES: Record<string, string[]> = {
  "wadiz-frontend": ["dev", "rc1", "rc4", "stage"],
  "com.wadiz.web": ["cloud_dev", "dev", "rc1", "rc4", "stage"],
};
const DEFAULT_ENV_BRANCHES = ["dev", "rc1", "rc4", "stage"];

export const envBranchesOf = (repo: string): string[] => ENV_BRANCHES[repo] ?? DEFAULT_ENV_BRANCHES;

/** 이미 만들어진 PR — 출발 브랜치는 작업 브랜치 또는 충돌 해결 브랜치({브랜치}_into_{환경}). */
export type ExistingPr = {
  number: number;
  url: string;
  head: string;
  base: string;
  /** 열림 · 합쳐짐 · 닫힘(합치지 않고 닫음) */
  state: "OPEN" | "MERGED" | "CLOSED";
  /** 합쳐지거나 닫힌 시각(ISO). 열린 PR 은 만든 시각. 최근 순서를 정하는 데 쓴다. */
  at: string;
  /** 닫힌 PR 의 이유 — "변경요청으로 다시 설계" 또는 "닫힘". 닫힌 PR 에만 있다. */
  reason?: string;
};

/** 한 환경의 PR 을 지금 볼 것과 접어 둘 것으로 나눈 것. */
export type EnvPrs = {
  /** 지금 PR — 열린 PR 이 있으면 열린 것만, 없으면 가장 최근에 합쳐진 PR 하나. 둘 다 없으면 빈 배열. */
  current: ExistingPr[];
  /** 이전 PR — 그 밖의 닫힌 PR 과 합쳐진 PR(최근 것부터). 화면에서 접어 둔다. */
  previous: ExistingPr[];
};

const recentFirst = (a: ExistingPr, b: ExistingPr) => b.at.localeCompare(a.at) || b.number - a.number;

/** 한 환경으로 간 PR 들을 지금 PR 과 이전 PR 로 나눈다. */
export function splitEnvPrs(prs: ExistingPr[]): EnvPrs {
  const sorted = [...prs].sort(recentFirst);
  const open = sorted.filter((p) => p.state === "OPEN");
  const current = open.length ? open : sorted.filter((p) => p.state === "MERGED").slice(0, 1);
  return { current, previous: sorted.filter((p) => !current.includes(p)) };
}
