import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/** 경로 문자열의 `~`·`$HOME`을 홈 디렉터리로 확장한다. */
function expandPath(v: string): string {
  let s = v.trim().replace(/\$\{?HOME\}?/g, os.homedir());
  if (s.startsWith("~")) s = path.join(os.homedir(), s.slice(1));
  return s;
}

/** go-dobby 설정 파일(~/.config/go-dobby/config.env)에서 변수 값을 읽는다. */
function readConfigEnv(name: string): string | undefined {
  try {
    const conf = path.join(os.homedir(), ".config", "go-dobby", "config.env");
    const txt = fs.readFileSync(conf, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(
        new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`)
      );
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

/** 작업 루트($ORCHESTRATION_WORKSPACE). 하위에 subtree/ 와 meta/ 가 있다. */
export function getWorkspaceDir(): string {
  return resolveConfig(
    "ORCHESTRATION_WORKSPACE",
    path.join(os.homedir(), "work", "dobby-workspace")
  );
}

/**
 * 메타 루트. go-dobby 오더 폴더({키}/)와 잡 로그(.mentis-jobs/)가 여기 있다.
 * ORCHESTRATION_META_PATH가 있으면 그 경로, 없으면 $ORCHESTRATION_WORKSPACE/meta (스킬 규약과 동일).
 * (ORCHESTRATION_META_DIR은 레거시 별칭으로 계속 인정)
 */
export function getMetaDir(): string {
  const explicit = process.env.ORCHESTRATION_META_PATH || process.env.ORCHESTRATION_META_DIR;
  if (explicit && explicit.trim()) return expandPath(explicit);
  const fromConf = readConfigEnv("ORCHESTRATION_META_PATH");
  if (fromConf) return fromConf;
  return path.join(getWorkspaceDir(), "meta");
}

/** 원본 소스 저장소들이 있는 루트($ORCHESTRATION_REPOS_ROOT). */
export function getReposRoot(): string {
  return resolveConfig("ORCHESTRATION_REPOS_ROOT", path.join(os.homedir(), "work"));
}

export type ReportRun = {
  /** 회차 식별자(시각 폴더명 또는 "legacy") */
  id: string;
  /** 표시용 라벨(사람이 읽는 일시) */
  label: string;
  /** md 파일의 상대 표시 경로 */
  file: string;
  /** md 원문 */
  content: string;
  /** 정렬용 epoch(ms) */
  sortKey: number;
};
