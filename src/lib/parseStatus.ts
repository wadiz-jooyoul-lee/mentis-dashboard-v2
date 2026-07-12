/**
 * issue-test 스킬의 status.md(진행 상태 파일)를 파싱한다. (순수 함수, node 의존 없음)
 * 규격: SKILL.md "진행 상태 파일 (status.md)" 참조.
 */

export type TestState =
  | "분석중"
  | "테스트중"
  | "완료"
  | "완료(이슈 있음)"
  | "중단"
  | "unknown";

export type IssueStatus = {
  state: TestState;
  /** 진행률 완료 수 */
  done: number | null;
  /** 진행률 전체 수 */
  total: number | null;
  pass: number | null;
  fail: number | null;
  skip: number | null;
  /** 실행 회차 */
  run: number | null;
  /** 마지막 갱신 시각(원문) */
  updatedAt: string | null;
};

// 긴 라벨을 먼저 두어 "완료(이슈 있음)"이 "완료"보다 먼저 매칭되게 한다.
const STATES: TestState[] = [
  "완료(이슈 있음)",
  "분석중",
  "테스트중",
  "완료",
  "중단",
];

export function parseStatus(md: string): IssueStatus {
  const stateLine = md.match(/\*\*상태\*\*\s*[:：]\s*(.+)/);
  let state: TestState = "unknown";
  if (stateLine) {
    const v = stateLine[1];
    state = STATES.find((s) => v.includes(s)) ?? "unknown";
  }

  const prog = md.match(/\*\*진행률\*\*\s*[:：]\s*(\d+)\s*\/\s*(\d+)/);
  const pass = md.match(/성공\s*(\d+)/);
  const fail = md.match(/실패\s*(\d+)/);
  const skip = md.match(/skip\s*(\d+)/i);
  const run = md.match(/\*\*회차\*\*\s*[:：]\s*(\d+)/);
  const upd = md.match(
    /\*\*갱신\*\*\s*([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9:]+)/
  );

  return {
    state,
    done: prog ? Number(prog[1]) : null,
    total: prog ? Number(prog[2]) : null,
    pass: pass ? Number(pass[1]) : null,
    fail: fail ? Number(fail[1]) : null,
    skip: skip ? Number(skip[1]) : null,
    run: run ? Number(run[1]) : null,
    updatedAt: upd ? upd[1] : null,
  };
}

export type BadgeStatus =
  | "success"
  | "processing"
  | "warning"
  | "error"
  | "default";

/** 상태 → antd Badge status/text 매핑. */
export function stateBadge(state: TestState): {
  status: BadgeStatus;
  text: string;
} {
  switch (state) {
    case "분석중":
      return { status: "processing", text: "분석중" };
    case "테스트중":
      return { status: "processing", text: "테스트중" };
    case "완료":
      return { status: "success", text: "완료" };
    case "완료(이슈 있음)":
      return { status: "warning", text: "완료(이슈 있음)" };
    case "중단":
      return { status: "error", text: "중단" };
    default:
      return { status: "default", text: "-" };
  }
}
