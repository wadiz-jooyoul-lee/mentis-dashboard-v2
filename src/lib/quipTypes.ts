/**
 * 아바타 소감(재미기능)의 **화면에서도 쓰는** 타입과 순수 함수.
 * 파일을 읽는 쪽(`@/lib/quips`)은 fs를 쓰는 서버 전용이라 클라이언트 컴포넌트가
 * 가져오면 번들이 깨진다. 그래서 타입과 펴는 함수만 여기로 떼어 둔다.
 */
export type QuipMood = "happy" | "cheer" | "complain" | "ponder" | "chill" | "tired" | "bored";
export type Quip = { mood: QuipMood; text: string };
export type QuipContext = "board" | "changes" | "reviews";
/**
 * 한 슬러그의 소감 묶음. 스킬이 여러 개를 만들어 두면 돌려가며 보여 준다.
 * 예전 파일은 소감이 하나뿐이라 객체 하나로 저장돼 있어, 둘 다 받아 `quipList`로 펴서 쓴다.
 */
export type QuipSet = Quip | Quip[];
/** 시간별 소감 한 줄(에이전트 상세 타임라인용). */
export type QuipEntry = { at: string; state: string; mood: QuipMood; text: string };
export type QuipsFile = {
  sig?: string;
  generatedAt?: string;
  /** 슬러그별 "생성 당시 작업 지문"(상태#라운드). 추가 작업 여부 판단용. */
  agents?: Record<string, { sig: string }>;
  board?: Record<string, QuipSet>;
  changes?: Record<string, QuipSet>;
  reviews?: Record<string, QuipSet>;
  /** 슬러그별 시간순 소감 기록(생성 때마다 board 소감 1줄 append). */
  history?: Record<string, QuipEntry[]>;
};

/** 소감 묶음을 항상 배열로 펴서 돌려준다(예전 파일이면 길이 1, 없으면 빈 배열). */
export function quipList(set?: QuipSet | null): Quip[] {
  if (!set) return [];
  return Array.isArray(set) ? set.filter((q) => q?.text) : set.text ? [set] : [];
}
