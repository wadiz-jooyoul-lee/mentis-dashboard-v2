/**
 * go-dobby 설정·경로 해석 (서버 전용, node I/O).
 * go-dobby는 이슈당 폴더 1개(`$DOBBY_META/{키}/`)를 쓴다.
 * v1의 `.issue-start`/`.issue-test`/`.issue-end`/`.agent-start` 분리 트리는 없다.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/** 경로 문자열의 `~`·`$HOME`을 홈 디렉터리로 확장한다. */
export function expandPath(v: string): string {
  let s = v.trim().replace(/\$\{?HOME\}?/g, os.homedir());
  if (s.startsWith("~")) s = path.join(os.homedir(), s.slice(1));
  return s;
}

/** work-dobby 설정 파일(~/.config/work-dobby/config.env)에서 변수 값을 읽는다. */
function readConfigEnv(name: string): string | undefined {
  try {
    const conf = path.join(os.homedir(), ".config", "work-dobby", "config.env");
    const txt = fs.readFileSync(conf, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`));
      if (m) return expandPath(m[1].replace(/^["']|["']$/g, ""));
    }
  } catch {
    /* 파일 없음 → undefined */
  }
  return undefined;
}

/** 설정 해석: 환경변수 → config.env → 기본값 순. */
function resolveConfig(envName: string, fallback: string): string {
  const fromEnv = process.env[envName];
  if (fromEnv && fromEnv.trim()) return expandPath(fromEnv);
  return readConfigEnv(envName) ?? fallback;
}

/** 작업 루트($DOBBY_WORKSPACE). 하위에 subtree/ 와 meta/ 가 있다. */
export function getWorkspaceDir(): string {
  return resolveConfig(
    "DOBBY_WORKSPACE",
    path.join(os.homedir(), "work", "dobby-workspace")
  );
}

/**
 * 메타 루트 `$DOBBY_META`. 이슈/작업 폴더가 이 아래에 바로 놓인다.
 * `${DOBBY_META_PATH:-$DOBBY_WORKSPACE/meta}` (redesign-spec §5 / config.md).
 * (DOBBY_META_DIR은 레거시 별칭.)
 */
export function getMetaDir(): string {
  const explicit = process.env.DOBBY_META_PATH || process.env.DOBBY_META_DIR;
  if (explicit && explicit.trim()) return expandPath(explicit);
  const fromConf = readConfigEnv("DOBBY_META_PATH");
  if (fromConf) return fromConf;
  return path.join(getWorkspaceDir(), "meta");
}

/** 워크트리 루트($DOBBY_WORKSPACE/subtree). */
export function getSubtreeDir(): string {
  return path.join(getWorkspaceDir(), "subtree");
}

/** 원본 소스 저장소들이 있는 루트($DOBBY_REPOS_ROOT). */
export function getReposRoot(): string {
  return resolveConfig("DOBBY_REPOS_ROOT", path.join(os.homedir(), "work", "repos"));
}

/** Jira 이슈 키(`FE1-1187`) 또는 문서 전용 작업 키(`TASK-{slug}`). */
export const ORDER_KEY_RE = /^([A-Za-z][A-Za-z0-9]*-\d+|TASK-[A-Za-z0-9-]+)$/;

export function isOrderKey(name: string): boolean {
  return ORDER_KEY_RE.test(name);
}

/**
 * `$DOBBY_META` 아래의 오더(이슈/작업) 폴더명을 나열한다.
 * 키 패턴에 맞고 status.md가 있는 폴더만. 잡·숨김 폴더(.mentis-jobs 등)는 제외.
 */
export function listOrderKeys(): string[] {
  const root = getMetaDir();
  if (!fs.existsSync(root)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && isOrderKey(d.name))
    .filter((d) => fs.existsSync(path.join(root, d.name, "status.md")))
    .map((d) => d.name);
}

/** 오더 폴더 경로. */
export function orderDir(key: string): string {
  return path.join(getMetaDir(), key);
}

/** 파일을 안전하게 읽는다(없거나 오류면 null). */
export function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}
