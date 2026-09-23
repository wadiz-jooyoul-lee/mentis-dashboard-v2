import fs from "node:fs";
import path from "node:path";

/**
 * 저장소의 import 그래프를 만들어, 바뀐 파일이 어느 앱 폴더까지 닿는지 되짚는다.
 *
 * 왜 필요한가: "패키지 이름이 그 앱에서 import 되는가"로 재면 안 바뀐 것까지 켜진다.
 * FE1-1953은 `packages/features/project-card`만 고쳤는데, account는 같은 패키지의
 * `onelink`·`sms-auth`만 쓴다. 이름만 보면 account가 켜지고, 실제로는 닿지 않는다.
 */

const SKIP = new Set(["node_modules", "dist", "build", ".next", ".git", "coverage", "__snapshots__"]);
const CODE = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
// 스타일·이미지도 노드로 넣는다. scss 한 줄만 고쳐도 산출물이 바뀐다.
const ASSET = [".scss", ".css", ".sass", ".less", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".json", ".hbs"];
const EXT = [...CODE, ...ASSET];
const STYLE = [".scss", ".css", ".sass", ".less"];

const CONFIG_RE = /^(vite\.config\.[tj]s|webpack(\.\w+)?\.config\.js|craco\.config\.js)$/;
const ALIAS_RE = /['"](@wadiz\/[a-z0-9-]+)['"]\s*:\s*path\.(?:join|resolve)\(\s*([^,]+),\s*['"]([^'"]+)['"]\s*\)/g;
const EDGE_RE =
  /(?:^|[\s;}])(?:import|export)\s+([^'";]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|[\s;=(])(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
const SIDE_RE = /(?:^|[\s;])import\s*['"]([^'"]+)['"]/gm;
const AT_RE = /@(?:import|use|forward)\s+['"]([^'"]+)['"]/g;
const REEXPORT_RE =
  /export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]|export\s+\*\s*(?:as\s+[\w$]+\s*)?from\s*['"]([^'"]+)['"]/g;

/** `names: null`이면 무엇이 건너갈지 알 수 없다는 뜻(네임스페이스·동적 import 등) — 막지 않는다. */
type Edge = { importer: string; names: string[] | null };

export type DepGraph = {
  /** 대상 파일 → 그 파일을 import 하는 쪽들. 저장소 루트 기준 상대경로. */
  rev: Map<string, Edge[]>;
  /** 배럴 파일 → (밖에 내보이는 이름 → 그 이름이 실제로 오는 파일). `*`로 시작하면 `export *`. */
  reexport: Map<string, Map<string, string>>;
  files: number;
  edges: number;
  unresolved: number;
};

function listFiles(repoRoot: string, tops: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) walk(p);
      } else if (EXT.includes(path.extname(e.name))) out.push(p);
    }
  };
  for (const t of tops) walk(path.join(repoRoot, t));
  return out;
}

/**
 * `@wadiz/*` 가 가리키는 실제 폴더.
 *
 * 번들마다 설정이 달라 한 이름에 여러 후보가 붙는다(`@wadiz/artworks`는 어떤 곳에선
 * `src/components`, 어떤 곳에선 `src/assets`). 순서대로 시도한다.
 */
function buildAlias(repoRoot: string, files: string[]): Map<string, string[]> {
  const alias = new Map<string, string[]>();
  const add = (k: string, v: string) => {
    const a = alias.get(k) ?? [];
    if (!a.includes(v)) a.push(v);
    alias.set(k, a);
  };

  for (const f of files) {
    if (!CONFIG_RE.test(path.basename(f))) continue;
    let src: string;
    try {
      src = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const m of src.matchAll(ALIAS_RE)) {
      add(m[1], path.resolve(/__dirname/.test(m[2]) ? path.dirname(f) : repoRoot, m[3]));
    }
  }
  // 설정에 안 적힌 것은 폴더 관례로 채운다. `@wadiz/fetch-api/src/...`처럼 src를 직접
  // 적는 곳이 있어 패키지 루트도 후보에 넣는다.
  for (const d of ["packages", "libraries/libraries", "libraries/packages", "static/packages", "static/libraries"]) {
    const dir = path.join(repoRoot, d);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const base = path.join(dir, name);
      try {
        if (!fs.statSync(base).isDirectory()) continue;
      } catch {
        continue;
      }
      if (fs.existsSync(path.join(base, "src"))) add(`@wadiz/${name}`, path.join(base, "src"));
      add(`@wadiz/${name}`, base);
    }
  }
  return alias;
}

/**
 * 주석을 걷어낸다. JSDoc 에 사용 예시로 적어 둔 `import ... from '@wadiz/core'` 를 진짜
 * import 로 읽으면 없는 연결이 생긴다(저장소에 83건). 실제로 FE1-1979 에서 packages/api 가
 * `core/src/lib/AppBridge/AppBridge.ts` 의 주석을 타고 studio 까지 닿는 것으로 잘못 나왔다.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"\`\\])\/\/[^\n]*/g, "$1");
}

/** `import { A, B as C }` → ["A", "C"]. 전부 통과시켜야 하는 형태면 null. */
function namesOf(clause: string | undefined): string[] | null {
  if (!clause) return null;
  const t = clause.trim();
  if (t.startsWith("*")) return null;
  const out = new Set<string>();
  if (!t.startsWith("{") && /^[A-Za-z_$][\w$]*/.test(t)) out.add("default");
  const br = t.match(/\{([^}]*)\}/);
  if (br) {
    for (const part of br[1].split(",")) {
      const nm = part.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, "").trim();
      if (nm) out.add(nm);
    }
  }
  return out.size ? [...out] : null;
}

/**
 * 파일을 이만큼 읽을 때마다 이벤트 루프를 놓아 준다. 안 놓으면 그래프를 처음 만드는 3초 동안
 * 서버가 통째로 멎는다. 실측: 안 놓으면 다른 페이지 응답이 0.7초에서 3.8초로, 1,000마다
 * 놓으면 2.4초로, 200마다 놓으면 1.8초로 간다.
 */
const YIELD_EVERY = 200;
const yieldToLoop = () => new Promise<void>((r) => setImmediate(r));

export async function buildGraph(repoRoot: string, tops: string[]): Promise<DepGraph> {
  const files = listFiles(repoRoot, tops);
  const fileSet = new Set(files);
  const alias = buildAlias(repoRoot, files);
  const aliasKeys = [...alias.keys()].sort((a, b) => b.length - a.length);

  const tryPath = (base: string): string | null => {
    if (fileSet.has(base)) return base;
    for (const e of EXT) if (fileSet.has(base + e)) return base + e;
    for (const e of CODE) {
      const i = path.join(base, "index" + e);
      if (fileSet.has(i)) return i;
    }
    // scss 부분 파일(`_foo.scss`)
    const d = path.dirname(base);
    const b = path.basename(base);
    for (const e of [".scss", ".css", ".sass"]) {
      const p = path.join(d, "_" + b + e);
      if (fileSet.has(p)) return p;
    }
    return null;
  };

  const resolve = (spec: string, from: string): string | null => {
    const clean = spec.split("?")[0];
    if (clean.startsWith(".")) return tryPath(path.resolve(path.dirname(from), clean));
    const s = clean.startsWith("~") ? clean.slice(1) : clean;
    const k = aliasKeys.find((k) => s === k || s.startsWith(k + "/"));
    if (!k) return null;
    for (const b of alias.get(k)!) {
      const r = tryPath(path.join(b, s.slice(k.length)));
      if (r) return r;
    }
    return null;
  };

  const rel = (p: string) => path.relative(repoRoot, p);
  const rev = new Map<string, Edge[]>();
  const reexport = new Map<string, Map<string, string>>();
  let edges = 0;
  let unresolved = 0;

  let read = 0;
  for (const f of files) {
    if (++read % YIELD_EVERY === 0) await yieldToLoop();
    const ext = path.extname(f);
    const isStyle = STYLE.includes(ext);
    if (!isStyle && !CODE.includes(ext)) continue;
    let src: string;
    try {
      src = stripComments(fs.readFileSync(f, "utf8"));
    } catch {
      continue;
    }

    const push = (spec: string, names: string[] | null) => {
      if (!spec.startsWith(".") && !spec.startsWith("@wadiz/") && !spec.startsWith("~@wadiz/")) return;
      const t = resolve(spec, f);
      if (!t) {
        unresolved++;
        return;
      }
      const key = rel(t);
      const list = rev.get(key) ?? [];
      list.push({ importer: rel(f), names });
      rev.set(key, list);
      edges++;
    };

    if (isStyle) {
      for (const m of src.matchAll(AT_RE)) push(m[1], null);
      for (const m of src.matchAll(/from\s*['"]([^'"]+)['"]/g)) push(m[1], null);
      continue;
    }

    for (const m of src.matchAll(EDGE_RE)) {
      if (m[3] !== undefined) push(m[3], null);
      else push(m[2], namesOf(m[1]));
    }
    for (const m of src.matchAll(SIDE_RE)) push(m[1], null);

    for (const m of src.matchAll(REEXPORT_RE)) {
      const t = resolve(m[2] ?? m[3], f);
      if (!t) continue;
      const map = reexport.get(rel(f)) ?? new Map<string, string>();
      if (m[2] !== undefined) {
        for (const part of m[1].split(",")) {
          const raw = part.trim().replace(/^type\s+/, "");
          const [, as] = raw.split(/\s+as\s+/);
          const exposed = (as ?? raw).trim();
          if (exposed) map.set(exposed, rel(t));
        }
      } else {
        map.set("*" + rel(t), rel(t));
      }
      reexport.set(rel(f), map);
    }
  }

  return { rev, reexport, files: files.length, edges, unresolved };
}

/**
 * 바뀐 파일에서 역으로 거슬러 올라가, 어느 앱 폴더에 닿는지 본다.
 *
 * 배럴(`index.ts`)을 지날 때는 가져간 **이름**이 우리 변경에서 온 것인지 본다. 이게 없으면
 * 한 배럴이 묶어 내보내는 모든 파일이 서로 연결된 것처럼 보인다. FE1-1853에서
 * `AuthButton`은 `useSPALink`만 쓰는데 같은 배럴의 `useDetailPageSPALoader` 변경이
 * account까지 번지는 식이다.
 *
 * @param roots [번들 이름, 그 번들이 사는 폴더 접두사]
 * @returns 번들 이름 → 그 번들을 켜는 **바뀐 파일**들
 */
export function traceBundles(
  graph: DepGraph,
  changed: string[],
  roots: [string, string][]
): Map<string, Set<string>> {
  const hit = new Map<string, Set<string>>();
  const mark = (bundle: string, start: string) => {
    const s = hit.get(bundle) ?? new Set<string>();
    s.add(start);
    hit.set(bundle, s);
  };

  for (const start of changed) {
    const seen = new Set<string>([start + "|"]);
    const queue: [string, string | null][] = [[start, null]];
    while (queue.length) {
      const [cur, from] = queue.shift()!;
      // 경로가 겹치는 번들이 있다(admin 은 static 안에 산다). **가장 긴 것 하나만** 잡는다 —
      // 둘 다 켜면 admin 파일이 static 배포로도 반영되는 것처럼 보인다(실제로는 제외된다).
      let best: [string, string] | null = null;
      for (const r of roots) if (cur.startsWith(r[1]) && (!best || r[1].length > best[1].length)) best = r;
      if (best) mark(best[0], start);

      const barrel = graph.reexport.get(cur);
      for (const { importer, names } of graph.rev.get(cur) ?? []) {
        if (barrel && from && names) {
          let crosses = false;
          for (const [exposed, target] of barrel) {
            if (target !== from) continue;
            if (exposed.startsWith("*") || names.includes(exposed)) {
              crosses = true;
              break;
            }
          }
          if (!crosses) continue;
        }
        const key = importer + "|" + cur;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push([importer, cur]);
      }
    }
  }
  return hit;
}
