/**
 * 에이전트 상태 → 아바타 표정 오버라이드(BTS·프로미스 공용).
 * 지정된 상태만 표정을 바꾸고, 나머지 상태는 null을 반환해 멤버 기본 표정을 유지한다.
 *  - 대기   : 심심한 표정 (반쯤 감긴 눈 + 일자 입)
 *  - 수정중 : 헐레벌떡 표정 (동그란 눈 + 벌린 입 + 걱정 눈썹 + 땀방울)
 *  - 구현중 : 집중한 표정 (차분한 눈 + 다문 입 + 찡그린 눈썹)
 */
export type AvatarEyes = "calm" | "bright" | "sleepy" | "happy" | "soft" | "droopy" | "round";
export type AvatarMouth = "neutral" | "smile" | "flat" | "bigSmile" | "softSmile" | "gentle" | "grin" | "gasp";
export type AvatarBrow = "worry" | "focus";
export type StateFace = { eyes: AvatarEyes; mouth: AvatarMouth; brow?: AvatarBrow; sweat?: boolean };

export function stateFace(state?: string): StateFace | null {
  const s = (state ?? "").replace(/\s/g, "");
  if (!s) return null;
  if (/대기/.test(s)) return { eyes: "sleepy", mouth: "flat" };
  if (/수정/.test(s)) return { eyes: "round", mouth: "gasp", brow: "worry", sweat: true };
  if (/구현|산출/.test(s)) return { eyes: "calm", mouth: "neutral", brow: "focus" };
  return null;
}
