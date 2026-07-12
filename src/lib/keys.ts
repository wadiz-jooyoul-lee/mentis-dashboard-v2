/** 오더 키 형식 (클라이언트/서버 공용, node 의존 없음). */

/** Jira 이슈 키(`FE1-1187`) 또는 문서 전용 작업 키(`TASK-{slug}`). */
export const ORDER_KEY_RE = /^([A-Za-z][A-Za-z0-9]*-\d+|TASK-[A-Za-z0-9-]+)$/;

export function isOrderKey(name: string): boolean {
  return ORDER_KEY_RE.test(name);
}
