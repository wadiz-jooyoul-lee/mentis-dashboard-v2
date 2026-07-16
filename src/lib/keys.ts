/** 오더 키 형식 (클라이언트/서버 공용, node 의존 없음). */

/** Jira 이슈 키(`FE1-1187`) 또는 문서 전용 작업 키(`TASK-{slug}`). */
export const ORDER_KEY_RE = /^([A-Za-z][A-Za-z0-9]*-\d+|TASK-[A-Za-z0-9-]+)$/;

export function isOrderKey(name: string): boolean {
  return ORDER_KEY_RE.test(name);
}

/**
 * 실제 Jira 이슈 키인지(`FE1-1187`·`QA-22647` 등). 문서 전용 `TASK-…`는 Jira가 없어 제외.
 * → Jira 탭 노출 여부(이슈를 아직 안 불러왔어도 키가 Jira면 탭을 띄운다) 판단용.
 */
export function isJiraIssueKey(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(name) && !/^TASK-/i.test(name);
}
