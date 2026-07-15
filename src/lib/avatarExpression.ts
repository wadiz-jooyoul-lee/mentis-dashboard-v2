/**
 * 에이전트 상태 → 아바타 표정 오버라이드(BTS·프로미스 공용). 5상태 모델(대기·분석·구현·리뷰·완료).
 * 옛 상태의 기존 표정을 그대로 재사용한다:
 *  - 대기 : 심심한 표정 (반쯤 감긴 눈 + 일자 입)
 *  - 구현 : 옛 구현중(집중) + 수정중(헐레벌떡) 두 표정 중 **랜덤**(에이전트별 고정 — 멤버 시드)
 *  - 분석·리뷰·완료 : 옛 대응 상태에 전용 표정이 없었으므로 멤버 기본 표정(null)
 */
export type AvatarEyes = "calm" | "bright" | "sleepy" | "happy" | "soft" | "droopy" | "round";
export type AvatarMouth = "neutral" | "smile" | "flat" | "bigSmile" | "softSmile" | "gentle" | "grin" | "gasp";
export type AvatarBrow = "worry" | "focus";
export type StateFace = { eyes: AvatarEyes; mouth: AvatarMouth; brow?: AvatarBrow; sweat?: boolean };

// 구현 상태의 두 후보 표정(옛 구현중=집중 / 수정중=헐레벌떡)
const IMPL_FACES: StateFace[] = [
  { eyes: "calm", mouth: "neutral", brow: "focus" }, // 집중
  { eyes: "round", mouth: "gasp", brow: "worry", sweat: true }, // 헐레벌떡
];

/** 시드(멤버명 등)로 배열에서 하나를 결정적으로 고른다 — 같은 시드면 항상 같은 선택(렌더마다 안 흔들림·SSR 안전). */
function seedPick<T>(arr: T[], seed?: string): T {
  if (!seed) return arr[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

export function stateFace(state?: string, seed?: string): StateFace | null {
  const s = (state ?? "").replace(/\s/g, "");
  if (!s) return null;
  if (/대기/.test(s)) return { eyes: "sleepy", mouth: "flat" };
  if (/구현|산출|수정/.test(s)) return seedPick(IMPL_FACES, seed); // 두 표정 중 랜덤
  return null; // 분석·리뷰·완료 → 멤버 기본 표정
}
