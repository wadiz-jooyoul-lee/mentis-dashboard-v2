/**
 * 이어가기 명령 — 코드가 있는 워크트리로 이동해 새 세션을 연다. 화면·서버 공용(순수 함수).
 * "이어가기 v2" 팝오버와 자동 실행 완료 알림이 같은 명령을 쓰게 한 곳에 둔다.
 */

/** 저장소 하나의 행 — 워크트리 경로·브랜치와, 그 워크트리를 되살려야 하는지. */
export type ResumeTarget = { repo: string; branch: string; path: string; restoreFrom: string | null };

type SessionWorktrees = {
  worktrees: { repo: string; branch: string; path: string }[];
  restore: { repo: string; branch: string; worktreePath: string; srcRepo: string }[];
};

const q = (v: string) => `"${v}"`;

/** 살아 있는 워크트리 먼저, 사라져 되살려야 하는 워크트리를 뒤에. */
export function resumeTargets(s: SessionWorktrees): ResumeTarget[] {
  return [
    ...s.worktrees.map((w) => ({ ...w, restoreFrom: null })),
    ...s.restore.map((r) => ({ repo: r.repo, branch: r.branch, path: r.worktreePath, restoreFrom: r.srcRepo })),
  ];
}

/**
 * 워크트리로 이동해 **새 세션**을 여는 명령. 옛 대화를 불러오지 않는다(`--resume` 을 쓰지 않는다).
 * v2 오더면 첫 지시로 `/do {키}` 를 넘겨 메타 문서를 읽고 다음 단계를 이어가게 한다.
 * 사라진 워크트리는 먼저 되살리고(prune → 없을 때만 add), 실패하면
 * `&&` 에서 끊겨 claude 를 띄우지 않는다.
 */
export function resumeCommand(t: ResumeTarget, epicKey: string, isV2: boolean): string {
  const parts: string[] = [];
  if (t.restoreFrom) parts.push(restoreStep(t, t.restoreFrom));
  parts.push(`cd ${q(t.path)}`);
  parts.push(isV2 ? `claude ${q(`/do ${epicKey}`)}` : "claude");
  return parts.join(" && ");
}

/** 사라진 워크트리를 같은 경로로 되살리는 단계(prune → 없을 때만 add). */
export function restoreStep(t: ResumeTarget, from: string): string {
  return `(git -C ${q(from)} worktree prune; [ -d ${q(t.path)} ] || git -C ${q(from)} worktree add ${q(t.path)} ${t.branch})`;
}
