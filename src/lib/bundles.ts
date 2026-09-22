import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * 오더가 건드린 파일로 "어느 번들을 다시 배포해야 테스트할 수 있나"를 판정한다.
 *
 * 왜 git을 보는가: 오케스트레이션 메타만으로는 알 수 없다. `code-changes/*.diff`는 61개 중
 * 50개가 빈 파일이고(통합된 뒤 떠서 diff가 비었다), 에이전트 작업 로그는 `Edit`/`Write` 호출만
 * 읽어 셸로 고친 변경을 통째로 놓친다(FE1-1830 실측: git 153개 중 로그는 18개, 경로도 잘림).
 * git은 도구 사용 방식과 무관한 정본이다.
 */

export type Bundle = "global" | "account" | "static" | "studio";
export const ALL_BUNDLES: Bundle[] = ["global", "account", "static", "studio"];

/** 한 번들의 판정 결과. `direct`면 그 번들 소스를 직접 고친 것이고, 아니면 공유 패키지 탓이다. */
export type BundleImpact = {
  bundle: Bundle;
  direct: boolean;
  /** 왜 이 번들이 켜졌나 — 직접 고친 경로 또는 공유 패키지 이름. */
  reasons: string[];
};

export type BundleReport = {
  fileCount: number;
  impacts: BundleImpact[];
  /** 변경 파일을 하나도 못 찾음(브랜치·커밋을 못 찾은 경우) */
  unknown: boolean;
};

/**
 * 배포 단위가 소유한 소스 경로.
 *
 * 워크플로(`app-{앱}-ci-cd.yml`)가 전부 수동 실행이라 경로 필터가 없다. 그래서 폴더 구조로
 * 정한다. 저장소 구조가 바뀌면 이 표만 고치면 된다.
 */
const DIRECT_PATHS: [RegExp, Bundle][] = [
  [/^apps\/global\//, "global"],
  [/^apps\/account\//, "account"],
  [/^static\//, "static"],
  [/^studio\//, "studio"],
];

/**
 * 공유 `@wadiz/*` 패키지가 사는 곳. 루트 `packages/` 말고 `libraries/` 밑에도 있다
 * (`libraries/libraries/react-components` = `@wadiz/react-components` 등 8개).
 * 여기를 빠뜨리면 그 패키지를 고친 오더가 아무 번들도 안 켠다.
 */
const PACKAGE_PATH = /^(?:packages|libraries\/(?:libraries|packages))\/([a-z0-9-]+)\//;

/** 빌드 전반에 걸리는 루트 파일 — 전 번들 대상. */
const ROOT_WIDE = /^(pnpm-lock\.yaml|package\.json|eslint\.config\.|packages\/eslint-config-helper)/;

function git(dir: string, args: string[]): string {
  const r = spawnSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout : "";
}

/**
 * 번들별로 "쓰는 `@wadiz/*` 패키지 집합"을 만든다.
 *
 * ⛔ 패키지마다 grep 하면 (패키지 수 × 번들 수)회가 되어 8초까지 갔다. 번들마다 한 번씩만
 * 훑어 한 번에 집합을 만든다(실측 1.25초). 저장소 구조는 자주 안 바뀌므로 메모리에 캐시한다.
 */
const usageCache = new Map<string, Map<Bundle, Set<string>>>();
function usageTable(repoRoot: string): Map<Bundle, Set<string>> {
  const hit = usageCache.get(repoRoot);
  if (hit) return hit;
  const roots: [string, Bundle][] = [
    ["apps/global", "global"],
    ["apps/account", "account"],
    ["static", "static"],
    ["studio", "studio"],
  ];
  const table = new Map<Bundle, Set<string>>();
  for (const [rel, bundle] of roots) {
    const dir = path.join(repoRoot, rel);
    const used = new Set<string>();
    if (fs.existsSync(dir)) {
      const r = spawnSync(
        "grep",
        ["-rhoE", "@wadiz/[a-z0-9-]+", dir, "--include=*.ts", "--include=*.tsx", "--include=*.js", "--include=*.jsx"],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
      );
      for (const line of (r.stdout ?? "").split("\n")) {
        const name = line.trim().replace("@wadiz/", "");
        if (name) used.add(name);
      }
    }
    table.set(bundle, used);
  }
  usageCache.set(repoRoot, table);
  return table;
}

/** 원격 base가 있으면 그쪽을, 없으면 로컬 base를 쓴다. */
function baseRef(worktree: string, base: string): string {
  return git(worktree, ["rev-parse", "--verify", "--quiet", `origin/${base}`]).trim()
    ? `origin/${base}`
    : base;
}

/**
 * 이 오더가 건드린 파일 목록 — **최종 변경**만 센다.
 *
 * ① 브랜치 diff(커밋+미커밋) — 진행 중인 오더. 미커밋도 들어가 푸시 전에 알 수 있다.
 * ② 비면 이 오더가 base로 나간 머지들의 순 변경 — 통합된 뒤에는 ①이 빈다
 *    (merge-base가 HEAD가 되어 diff가 사라진다).
 * ③ 둘 다 없을 때만 커밋 메시지로 찾는다. 이건 **손댄 이력**이라 중간에 고쳤다가 되돌린
 *    파일까지 세므로 부정확하다(FE1-1830: studio 파일 2개를 되돌렸는데 studio 번들이 켜졌다).
 */
export function changedFiles(key: string, worktree: string, base: string): string[] {
  if (!worktree || !fs.existsSync(worktree)) return [];
  const collect = (raw: string) => {
    const out = new Set<string>();
    for (const f of raw.split("\n")) if (f.trim()) out.add(f.trim());
    return out;
  };

  const fork =
    git(worktree, ["merge-base", `origin/${base}`, "HEAD"]).trim() ||
    git(worktree, ["merge-base", base, "HEAD"]).trim();
  if (fork) {
    const out = collect(git(worktree, ["diff", "--name-only", fork]));
    if (out.size > 0) return [...out];
  }

  // 통합된 뒤에는 ①이 빈다. 이 오더의 브랜치가 base로 **나간** 머지를 찾아 순 변경을 센다.
  //
  // 방향이 핵심이다. 같은 키가 든 머지에는 두 종류가 섞여 있다.
  //   내보냄  "Merge pull request #29282 from wadiz-fe/feature/FE1-1830"   ← 이 오더의 변경
  //   받아옴  "Merge ... 'origin/cloud_live' into feature/FE1-1830"        ← dev를 따라잡은 것
  // 뒤엣것을 세면 dev 수백 개 파일이 통째로 딸려 온다(실측 124개 → 358개). `into`로 가른다.
  //
  // 찾는 범위도 워크트리 HEAD가 아니라 base여야 한다. 워크트리는 머지 **전** 상태라
  // 제 HEAD에서는 자기가 나간 머지가 안 보인다.
  const merges = git(worktree, [
    "log",
    "--merges",
    baseRef(worktree, base),
    "--format=%H%x09%s",
    "-E",
    `--grep=/${key}([^0-9]|$)`,
  ])
    .split("\n")
    .filter((l) => l.includes("\t") && !l.includes(" into "))
    .map((l) => l.split("\t")[0])
    .slice(0, 20);

  if (merges.length > 0) {
    // 머지마다 가져온 파일을 모은 뒤, **첫 머지 직전 대 마지막 머지 직후**로 다시 걸러
    // 중간에 고쳤다가 되돌린 파일을 뺀다(FE1-1830: 129개 중 5개가 이렇게 빠진다).
    const touched = new Set<string>();
    for (const m of merges) {
      for (const f of collect(git(worktree, ["diff", "--name-only", `${m}^1`, m]))) touched.add(f);
    }
    if (touched.size > 0 && touched.size <= 1000) {
      const net = collect(
        git(worktree, [
          "diff",
          "--name-only",
          `${merges[merges.length - 1]}^1`,
          merges[0],
          "--",
          ...touched,
        ])
      );
      if (net.size > 0) return [...net];
    }
    if (touched.size > 0) return [...touched];
  }

  return [...collect(git(worktree, ["log", "--name-only", "--format=", `--grep=${key}`]))];
}

/** 파일 목록 → 번들 판정. */
export function bundlesOf(files: string[], repoRoot: string): BundleImpact[] {
  const direct = new Map<Bundle, Set<string>>();
  const shared = new Map<Bundle, Set<string>>();
  const add = (m: Map<Bundle, Set<string>>, b: Bundle, why: string) => {
    if (!m.has(b)) m.set(b, new Set());
    m.get(b)!.add(why);
  };

  const packages = new Set<string>();
  for (const f of files) {
    const direct0 = DIRECT_PATHS.find(([re]) => re.test(f));
    if (direct0) {
      add(direct, direct0[1], f.split("/").slice(0, 2).join("/"));
      continue;
    }
    const pkg = f.match(PACKAGE_PATH);
    if (pkg) packages.add(pkg[1]);
    else if (ROOT_WIDE.test(f)) for (const b of ALL_BUNDLES) add(shared, b, "루트 설정");
  }

  if (packages.size > 0) {
    const table = usageTable(repoRoot);
    for (const p of packages) {
      for (const b of ALL_BUNDLES) {
        if (table.get(b)?.has(p)) add(shared, b, `@wadiz/${p}`);
      }
    }
  }

  const impacts: BundleImpact[] = [];
  for (const b of ALL_BUNDLES) {
    const d = direct.get(b);
    const s = shared.get(b);
    if (!d && !s) continue;
    impacts.push({
      bundle: b,
      direct: !!d,
      reasons: [...(d ?? []), ...(s ?? [])].sort(),
    });
  }
  return impacts;
}
