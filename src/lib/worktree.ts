import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expandHome, getDefaultBase, getMetaDir, getReposRoot, getWorkspaceDir } from "@/lib/issues";
import { parseOrderStatus } from "@/lib/parseOrderStatus";
import { ORDER_KEY_RE } from "@/lib/keys";

export type WorktreeState = {
  repo: string;
  branch: string;
  path: string;
  /** 폴더가 실제로 있는가. */
  exists: boolean;
  /** 원격에 안 올라간 커밋 수. 셀 수 없으면 null(원격 미설정 등). */
  unpushed: number | null;
};

export type WorktreeInfo = {
  worktrees: WorktreeState[];
  /** 지금 지워도 되는가. */
  removable: boolean;
  /** 못 지우는 이유(사용자에게 그대로 보여줄 문장). removable면 null. */
  reason: string | null;
};

/** 워크트리 폴더의 현재 브랜치를 파일로 읽는다(git 스폰 없이). 못 읽으면 "". */
function branchOf(dir: string): string {
  try {
    const gitPath = path.join(dir, ".git");
    let gitDir: string;
    if (fs.statSync(gitPath).isDirectory()) gitDir = gitPath;
    else {
      const m = fs.readFileSync(gitPath, "utf8").match(/gitdir:\s*(.+)/);
      if (!m) return "";
      gitDir = path.isAbsolute(m[1].trim()) ? m[1].trim() : path.resolve(dir, m[1].trim());
    }
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    return head.match(/ref:\s*refs\/heads\/(.+)/)?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * status.md에 워크트리 경로가 없을 때 `{workspace}/subtree/{repo}-{키}` 폴더를 직접 찾는다.
 * 오더마다 status.md 형식이 달라(표 없이 "## 브랜치"만 있거나 경로 칸이 빈 경우) 실제 폴더가
 * 있는데도 "기록 없음"으로 보이는 일이 있다(사례 FE1-1518·FE-10884).
 */
function fromSubtree(key: string): { repo: string; branch: string; path: string }[] {
  try {
    const subtree = path.join(getWorkspaceDir(), "subtree");
    const re = new RegExp(`^(.+)-${key}(?:-.*)?$`);
    return fs
      .readdirSync(subtree)
      .map((name) => ({ name, m: name.match(re) }))
      .filter((x) => x.m)
      .map((x) => {
        const dir = path.join(subtree, x.name);
        return { repo: x.m![1], branch: branchOf(dir), path: dir };
      });
  } catch {
    return [];
  }
}

function readStatus(key: string) {
  const f = path.join(getMetaDir(), key, "status.md");
  try {
    return parseOrderStatus(fs.readFileSync(f, "utf8"), key);
  } catch {
    return null;
  }
}

/** 원격에 안 올라간 커밋 수(dobby_wt_unpushed와 같은 판정). 못 세면 null. */
function unpushedCount(wt: string): number | null {
  const run = (args: string[]) => {
    try {
      return execFileSync("git", ["-C", wt, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
    } catch {
      return null;
    }
  };
  const n = run(["rev-list", "--count", "@{u}..HEAD"]);
  if (n !== null && /^\d+$/.test(n)) return Number(n);
  const br = run(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!br) return null;
  const n2 = run(["rev-list", "--count", `origin/${br}..HEAD`]);
  return n2 !== null && /^\d+$/.test(n2) ? Number(n2) : null;
}

/**
 * 워크트리 삭제 가능 여부. dobby-end의 안전 규칙을 그대로 옮긴다 —
 * 미푸시 커밋이 남아 있으면 지울 때 그 코드가 사라지므로 막는다.
 * (해결 상태 확인은 호출부(화면)가 이미 하므로 여기서는 워크트리 사실만 본다.)
 */
export function worktreeInfo(key: string): WorktreeInfo {
  if (!ORDER_KEY_RE.test(key)) return { worktrees: [], removable: false, reason: "잘못된 키입니다." };
  const st = readStatus(key);
  // ① status.md 워크트리 표(경로가 채워진 행) → ② 없으면 subtree 폴더에서 직접 찾기
  let rows: { repo: string; branch: string; path: string }[] = (st?.worktrees ?? []).filter(
    (w) => w.path
  );
  if (rows.length === 0) rows = fromSubtree(key);
  if (rows.length === 0) {
    return {
      worktrees: [],
      removable: false,
      reason: "이 오더에는 삭제할 워크트리가 없습니다(문서 전용이거나 이미 정리됨).",
    };
  }
  const worktrees: WorktreeState[] = rows.map((row) => {
    // `~/work/...`로 적힌 경로는 fs가 못 푸므로 먼저 전개한다(사례 FE1-1212).
    const w = { ...row, path: expandHome(row.path) };
    const exists = fs.existsSync(w.path);
    return {
      repo: w.repo || (w.path.split("/").filter(Boolean).pop() ?? "").replace(new RegExp(`-${key}(?:-.*)?$`), ""),
      branch: w.branch || (exists ? branchOf(w.path) : ""),
      path: w.path,
      exists,
      unpushed: exists ? unpushedCount(w.path) : null,
    };
  });

  const live = worktrees.filter((w) => w.exists);
  if (live.length === 0) {
    return { worktrees, removable: false, reason: "이미 삭제되었습니다." };
  }
  const risky = live.filter((w) => (w.unpushed ?? 0) > 0);
  if (risky.length > 0) {
    const detail = risky.map((w) => `${w.repo} ${w.unpushed}개`).join(", ");
    return {
      worktrees,
      removable: false,
      reason: `푸시되지 않은 커밋이 있습니다(${detail}). 지우면 그 코드가 사라지므로, 먼저 푸시하세요.`,
    };
  }
  return { worktrees, removable: true, reason: null };
}

/**
 * 워크트리 삭제 — dobby-end와 같은 절차로, 제거 전 코드 변경을 code-changes/에 남기고
 * **브랜치는 보존**한다(되살릴 수 있어야 이어가기가 가능하다). 삭제 전 안전 조건을 다시 확인한다.
 */
export function removeWorktrees(key: string): {
  ok: boolean;
  error?: string;
  removed?: string[];
  /** 스냅샷 결과 — 화면이 "기록 남김/변경 없음/실패"를 구분해 알릴 수 있게 돌려준다. */
  snapshot?: { repo: string; state: "saved" | "empty" | "failed" }[];
} {
  const info = worktreeInfo(key);
  if (!info.removable) return { ok: false, error: info.reason ?? "삭제할 수 없습니다." };

  const removed: string[] = [];
  const snapshot: { repo: string; state: "saved" | "empty" | "failed" }[] = [];
  for (const w of info.worktrees.filter((x) => x.exists)) {
    const src = path.join(getReposRoot(), w.repo);
    // 스냅샷: 헬퍼(dobby_end_snapshot)와 같은 산출물 — code-changes/{repo}.commits · .diff
    // ⛔ 내용이 없으면 파일을 만들지 않는다. 0바이트 파일은 "변경이 없었다"와 "스냅샷이 실패했다"를
    //    구분할 수 없어, 나중에 기록을 볼 때 판단이 안 선다.
    const dir = path.join(getMetaDir(), key, "code-changes");
    try {
      const base = getDefaultBase();
      const git = (args: string[]) =>
        execFileSync("git", ["-C", w.path, ...args], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 30000,
          maxBuffer: 64 * 1024 * 1024,
        });
      // 원격에 base가 있으면 그쪽 기준(로컬 base가 낡아 diff가 부풀지 않도록) — 헬퍼와 동일.
      let ref = base;
      try {
        git(["rev-parse", "--verify", "-q", `origin/${base}`]);
        ref = `origin/${base}`;
      } catch {
        /* 로컬 base 사용 */
      }
      const commits = git(["log", "--oneline", `${ref}..HEAD`]);
      const diff = git(["diff", `${ref}...HEAD`]);
      if (commits.trim() || diff.trim()) {
        fs.mkdirSync(dir, { recursive: true });
        if (commits.trim()) fs.writeFileSync(path.join(dir, `${w.repo}.commits`), commits);
        if (diff.trim()) fs.writeFileSync(path.join(dir, `${w.repo}.diff`), diff);
        snapshot.push({ repo: w.repo, state: "saved" });
      } else {
        snapshot.push({ repo: w.repo, state: "empty" });
      }
    } catch {
      // 스냅샷 실패는 삭제를 막지 않는다(브랜치가 남아 복원 가능) — 대신 실패를 알린다.
      snapshot.push({ repo: w.repo, state: "failed" });
    }
    try {
      execFileSync("git", ["-C", src, "worktree", "remove", w.path], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
      });
      removed.push(w.path);
    } catch {
      try {
        execFileSync("git", ["-C", src, "worktree", "remove", "--force", w.path], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30000,
        });
        removed.push(w.path);
      } catch (e) {
        const err = e as { stderr?: string; stdout?: string };
        return {
          ok: false,
          error: (err.stderr || err.stdout || "").toString().slice(0, 200).trim() || "워크트리 제거 실패",
        };
      }
    }
  }
  return { ok: true, removed, snapshot };
}

/** 목록 화면용: 지울 워크트리가 있는 오더만 판정 결과를 담은 map. */
export type Deletability = Record<string, { removable: boolean; reason: string | null }>;

/**
 * 여러 오더의 삭제 가능 여부를 한 번에 판정한다(목록 화면 전용).
 *
 * 왜 목록에서 미리 계산하나: 마우스를 올렸을 때 조회하면 버튼이 활성(빨강)으로 그려졌다가
 * 커서 아래에서 비활성(회색)으로 바뀌어 버린다. 첫 렌더부터 옳은 상태로 그리는 게 맞다.
 * ⛔ listEpics()에 넣지 않는다 — 홈 화면 지표도 그 함수를 쓰는데 git 호출이 붙으면 같이 느려진다.
 *
 * **지울 워크트리가 없는 오더는 map에 넣지 않는다**(호출부가 버튼 자체를 그리지 않게 —
 * 이미 정리된 종료 오더·문서 전용 오더에 비활성 버튼을 늘어놓을 이유가 없다).
 * 실측: 워크트리 1개당 git 호출 약 19ms, 실재하는 워크트리는 보통 10개 미만이다.
 */
export function deletabilityOf(keys: string[]): Deletability {
  const out: Deletability = {};
  for (const key of keys) {
    const info = worktreeInfo(key);
    // 실재하는 워크트리가 하나도 없으면 대상 아님(버튼 미노출).
    if (!info.worktrees.some((w) => w.exists)) continue;
    out[key] = { removable: info.removable, reason: info.reason };
  }
  return out;
}
