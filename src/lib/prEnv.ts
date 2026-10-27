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
  state: "OPEN" | "MERGED";
};
