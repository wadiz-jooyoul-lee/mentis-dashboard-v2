import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { buildGraph, traceBundles, type DepGraph } from "@/lib/depgraph";

/**
 * 오더가 건드린 파일로 "어느 번들을 다시 배포해야 테스트할 수 있나"를 판정한다.
 *
 * 왜 git을 보는가: 오케스트레이션 메타만으로는 알 수 없다. `code-changes/*.diff`는 61개 중
 * 50개가 빈 파일이고(통합된 뒤 떠서 diff가 비었다), 에이전트 작업 로그는 `Edit`/`Write` 호출만
 * 읽어 셸로 고친 변경을 통째로 놓친다(FE1-1830 실측: git 153개 중 로그는 18개, 경로도 잘림).
 * git은 도구 사용 방식과 무관한 정본이다.
 */

export type Bundle =
  | "global"
  | "account"
  | "static"
  | "admin"
  | "studio"
  | "app-api"
  | "wadiz-web";

/** wadiz-frontend 모노레포가 쪼개지는 다섯 갈래. */
const FRONTEND_BUNDLES: Bundle[] = ["global", "account", "static", "admin", "studio"];

/**
 * 저장소 하나가 통째로 배포 단위인 것들.
 *
 * app-api 는 NestJS 앱 하나(Dockerfile 1개, 워크스페이스 아님), com.wadiz.web 은 Maven WAR
 * 한 덩어리(`<modules>` 없음)라 더 쪼갤 곳이 없다. 어느 파일을 고쳤든 그 저장소를 다시 배포한다.
 */
const WHOLE_REPO: Record<string, Bundle> = {
  "app-api": "app-api",
  "com.wadiz.web": "wadiz-web",
};

export const ALL_BUNDLES: Bundle[] = [...FRONTEND_BUNDLES, "app-api", "wadiz-web"];

/** 한 번들의 판정 결과. `direct`면 그 번들 폴더 안의 파일을 고친 것이고, 아니면 공유 코드 탓이다. */
export type BundleImpact = {
  bundle: Bundle;
  direct: boolean;
  /** 이 번들에 닿는 변경 파일 수. 1~2개면 스치기만 한 것이라 사람이 걸러 볼 만하다. */
  count: number;
  /** 왜 이 번들이 켜졌나 — 실제로 닿는 변경 파일들(많으면 앞의 몇 개). */
  reasons: string[];
};

export type BundleReport = {
  fileCount: number;
  impacts: BundleImpact[];
  /** 변경 파일을 하나도 못 찾음(브랜치·커밋을 못 찾은 경우) */
  unknown: boolean;
};

/**
 * 배포 단위가 소유한 폴더.
 *
 * 워크플로(`app-{앱}-ci-cd.yml`)가 전부 수동 실행이라 경로 필터가 없다. 그래서 폴더 구조로
 * 정한다. 저장소 구조가 바뀌면 이 표만 고치면 된다.
 */
const BUNDLE_ROOTS: [string, string][] = [
  ["global", "apps/global/"],
  ["account", "apps/account/"],
  // admin 은 static 안에 있지만 **따로 배포한다**. 기본 static 빌드는 admin 을 빼고 만든다
  // (`build-static.sh`: BUILD_ADMIN 이 false 면 `--ignore '@wadiz-static/admin'`).
  // static 보다 긴 경로라 아래 "가장 긴 것 하나만" 규칙에 따라 admin 이 이긴다.
  ["admin", "static/services/admin/"],
  ["static", "static/"],
  ["studio", "studio/"],
];

/** 그래프를 훑을 최상위 폴더. */
const GRAPH_TOPS = ["apps", "static", "studio", "packages", "libraries"];

/** 빌드 전반에 걸리는 루트 파일 — 어디에도 import 되지 않으므로 그래프로 못 잡는다. */
const ROOT_WIDE = /^(pnpm-lock\.yaml|package\.json|eslint\.config\.|packages\/eslint-config-helper)/;

/**
 * git 은 **비동기로** 부른다. `spawnSync` 를 쓰면 자식 프로세스가 끝날 때까지 이벤트 루프가
 * 통째로 멎어, 오더 하나를 판정하는 동안 다른 페이지가 같이 느려진다
 * (실측: 보드 응답 0.79초 → 2.42초).
 */
const run = promisify(execFile);
async function git(dir: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await run("git", ["-C", dir, ...args], { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch {
    return "";
  }
}

/**
 * 저장소의 의존성 그래프. 만드는 데 3초쯤 들지만(파일 1.9만 개·간선 3.8만 개) 저장소 구조는
 * 자주 안 바뀌므로 프로세스가 사는 동안 들고 있는다. 되짚기 자체는 50ms 안쪽이다.
 */
/**
 * 번들마다 "소스에 이름이 실제로 적혀 있는 `@wadiz/*` 패키지" 집합.
 *
 * 그래프와 **독립된 방법**으로 한 번 더 재기 위한 것이다. 그래프는 파일을 한 칸씩 이어 붙여
 * 가므로, 중간에 잘못된 고리가 하나라도 끼면 없는 길이 생긴다(실제로 JSDoc 주석 속 import를
 * 진짜로 읽어 studio 까지 닿은 적이 있다). 이름조차 안 쓰는 패키지라면 그 번들은 그 패키지를
 * 통해 영향을 받을 수 없다 — 그래프가 뭐라 하든 잘못이다.
 */
const usageCache = new Map<string, Map<Bundle, Set<string>>>();
async function packageUsage(repoRoot: string): Promise<Map<Bundle, Set<string>>> {
  const hit = usageCache.get(repoRoot);
  if (hit) return hit;
  const table = new Map<Bundle, Set<string>>();
  await Promise.all(
    BUNDLE_ROOTS.map(async ([bundle, prefix]) => {
      const dir = path.join(repoRoot, prefix);
      const used = new Set<string>();
      try {
        const { stdout } = await run(
          "grep",
          ["-rhoE", "@wadiz/[a-z0-9-]+", dir, "--include=*.ts", "--include=*.tsx", "--include=*.js", "--include=*.jsx"],
          { maxBuffer: 64 * 1024 * 1024 }
        );
        for (const line of stdout.split("\n")) {
          const name = line.trim().replace("@wadiz/", "");
          if (name) used.add(name);
        }
      } catch {
        /* 폴더가 없거나 일치가 없으면 빈 집합 */
      }
      table.set(bundle as Bundle, used);
    })
  );
  usageCache.set(repoRoot, table);
  return table;
}

/** 공유 패키지 경로에서 패키지 이름을 뽑는다. `packages/` 말고 `libraries/` 밑에도 있다. */
const PACKAGE_PATH = /^(?:packages|libraries\/(?:libraries|packages))\/([a-z0-9-]+)\//;

const graphCache = new Map<string, Promise<DepGraph>>();
function graphOf(repoRoot: string): Promise<DepGraph> {
  let g = graphCache.get(repoRoot);
  if (!g) {
    // 약속을 먼저 넣어 둔다. 빌드 도중 같은 저장소로 또 들어와도 두 번 만들지 않는다.
    g = buildGraph(repoRoot, GRAPH_TOPS);
    graphCache.set(repoRoot, g);
  }
  return g;
}

/** 원격 base가 있으면 그쪽을, 없으면 로컬 base를 쓴다. */
async function baseRef(worktree: string, base: string): Promise<string> {
  const found = (await git(worktree, ["rev-parse", "--verify", "--quiet", `origin/${base}`])).trim();
  return found ? `origin/${base}` : base;
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
export async function changedFiles(key: string, worktree: string, base: string): Promise<string[]> {
  if (!worktree || !fs.existsSync(worktree)) return [];
  const collect = (raw: string) => {
    const out = new Set<string>();
    for (const f of raw.split("\n")) if (f.trim()) out.add(f.trim());
    return out;
  };

  const fork =
    (await git(worktree, ["merge-base", `origin/${base}`, "HEAD"])).trim() ||
    (await git(worktree, ["merge-base", base, "HEAD"])).trim();
  if (fork) {
    const out = collect(await git(worktree, ["diff", "--name-only", fork]));
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
  const merges = (await git(worktree, [
    "log",
    "--merges",
    await baseRef(worktree, base),
    "--format=%H%x09%s",
    "-E",
    `--grep=/${key}([^0-9]|$)`,
  ]))
    .split("\n")
    .filter((l) => l.includes("\t") && !l.includes(" into "))
    .map((l) => l.split("\t")[0])
    .slice(0, 20);

  if (merges.length > 0) {
    // 머지마다 가져온 파일을 모은 뒤, **첫 머지 직전 대 마지막 머지 직후**로 다시 걸러
    // 중간에 고쳤다가 되돌린 파일을 뺀다(FE1-1830: 129개 중 5개가 이렇게 빠진다).
    const touched = new Set<string>();
    for (const m of merges) {
      for (const f of collect(await git(worktree, ["diff", "--name-only", `${m}^1`, m]))) touched.add(f);
    }
    if (touched.size > 0 && touched.size <= 1000) {
      const net = collect(
        await git(worktree, [
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

  return [...collect(await git(worktree, ["log", "--name-only", "--format=", `--grep=${key}`]))];
}

/**
 * 파일 목록 → 번들 판정.
 *
 * `repo` 는 오더 상태표에 적힌 저장소 이름이다. 아래 경로 규칙은 wadiz-frontend 것이라,
 * 다른 저장소에 그대로 대면 `static/` 같은 흔한 폴더 이름에 걸려 엉뚱한 번들이 켜진다.
 */
export async function bundlesOf(
  files: string[],
  repoRoot: string,
  repo: string
): Promise<BundleImpact[]> {
  const whole = WHOLE_REPO[repo];
  if (whole) {
    if (files.length === 0) return [];
    // 저장소 전체가 한 덩어리라 "어디를 고쳤나"만 근거로 보여 준다.
    // 폴더를 먼저 보인다 — 최상위 파일(`.env.dev` 등)이 이름 순으로 앞자리를 다 먹으면
    // 정작 알고 싶은 `src/api` 같은 것이 밀려난다.
    const tops = [...new Set(files.map((f) => f.split("/").slice(0, 2).join("/")))].sort(
      (a, b) => Number(b.includes("/")) - Number(a.includes("/")) || a.localeCompare(b)
    );
    return [{ bundle: whole, direct: true, count: files.length, reasons: tops.slice(0, 8) }];
  }

  // 루트 설정은 아무 데도 import 되지 않아 그래프로 못 잡는다. 바뀌면 전 번들을 다시 빌드한다.
  const rootWide = files.filter((f) => ROOT_WIDE.test(f));

  // 나머지는 실제로 닿는지 되짚는다. 패키지 이름만 맞으면 켜던 방식은 안 바뀐 것까지 켰다
  // (FE1-1953: `features/project-card`만 고쳤는데 `features/onelink`만 쓰는 account가 켜졌다).
  const [graph, usage] = await Promise.all([graphOf(repoRoot), packageUsage(repoRoot)]);
  const hit = traceBundles(graph, files, BUNDLE_ROOTS);

  const impacts: BundleImpact[] = [];
  for (const b of FRONTEND_BUNDLES) {
    const prefix0 = BUNDLE_ROOTS.find(([name]) => name === b)![1];
    // 안전망: 공유 패키지를 거쳐 닿는다는 판정은, 그 번들이 그 패키지 이름을 실제로 쓸 때만
    // 받아들인다. 그래프에 잘못된 고리가 끼어도 여기서 걸린다.
    const reached = [...(hit.get(b) ?? [])].filter((f) => {
      if (f.startsWith(prefix0)) return true;
      const pkg = f.match(PACKAGE_PATH);
      return pkg ? (usage.get(b)?.has(pkg[1]) ?? false) : true;
    });
    const all = [...new Set([...reached, ...rootWide])];
    if (all.length === 0) continue;
    const prefix = prefix0;
    impacts.push({
      bundle: b,
      direct: reached.some((f) => f.startsWith(prefix)),
      count: all.length,
      // 그 번들 폴더 안의 파일을 앞세운다 — 직접 고친 곳이 먼저 눈에 들어와야 한다.
      reasons: all
        .sort((x, y) => Number(y.startsWith(prefix)) - Number(x.startsWith(prefix)) || x.localeCompare(y))
        .slice(0, 8),
    });
  }
  return impacts;
}
