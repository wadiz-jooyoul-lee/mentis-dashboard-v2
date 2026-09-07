/**
 * 파일 내용 기반 계산 결과 캐시. (서버 전용)
 *
 * 키는 `경로 + 수정시각 + 크기`라서 파일이 바뀌면 키가 달라져 자동으로 무효화된다.
 * 별도 만료 시간이 필요 없고, 진행 중 오더처럼 로그가 계속 커지는 경우엔 매번 새로
 * 계산된다(정확성 우선 — 오래된 결과를 보여주지 않는다).
 *
 * 왜 필요한가: 에이전트 대화 로그(.jsonl/.output)는 오더에 따라 수십 MB이고 한 줄씩
 * JSON.parse 해야 해서 파싱에 수백 ms가 든다. 같은 화면을 다시 열거나 30초 자동 갱신이
 * 돌 때마다 이 비용을 다시 낼 이유가 없다.
 *
 * 로컬 1인용 대시보드이므로 개수 상한(LRU)만 둔다.
 */
import fs from "node:fs";

/** 캐시에 담아 두는 최대 항목 수. 항목 하나가 최대 수 MB(코드 diff 본문)일 수 있다. */
const MAX_ENTRIES = 32;

/** 삽입 순서를 그대로 쓰는 LRU. 맨 앞이 가장 오래 안 쓰인 항목. */
const store = new Map<string, unknown>();

/**
 * `file`의 (수정시각, 크기)가 같으면 이전 계산 결과를 그대로 돌려준다.
 * `ns`는 같은 파일에 서로 다른 계산을 캐시할 때 구분하는 이름표다.
 * 파일 정보를 못 읽으면 캐시하지 않고 그냥 계산한다(방어적).
 */
export function memoByFileStat<T>(ns: string, file: string, compute: () => T): T {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return compute();
  }
  const k = `${ns} ${file} ${st.mtimeMs} ${st.size}`;
  if (store.has(k)) {
    const hit = store.get(k) as T;
    store.delete(k); // 최근 사용으로 갱신
    store.set(k, hit);
    return hit;
  }
  const val = compute();
  store.set(k, val);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  return val;
}
