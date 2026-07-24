// IVE 멤버 에이전트용 실사진 아바타. 원형 크롭 + 시그니처 색 링, 작업 상태에 따라
// base/smile/surprise 표정 사진을 스왑한다(BTS·프로미스의 표정 오버라이드를 사진으로 옮긴 것).
// 사진은 로컬 전용(public/avatars/ive/). 알 수 없는 멤버면 null(호출부에서 폴백).

import { IVE_AVATARS, iveExpr, iveSrc } from "@/lib/ive";

export { IVE_AVATARS };

export default function IveAvatar({
  member,
  size = 56,
  state,
}: {
  member: string;
  size?: number;
  /** 있으면 상태에 맞는 표정 사진으로 스왑(완료→smile·수정→surprise). 없으면 base. */
  state?: string;
}) {
  const cfg = IVE_AVATARS[member];
  if (!cfg) return null;
  const expr = iveExpr(state);
  const ring = Math.max(2, Math.round(size * 0.05));
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        padding: ring,
        background: cfg.color,
        flexShrink: 0,
        lineHeight: 0,
      }}
      aria-label={`${member} 아바타`}
      role="img"
    >
      <img
        src={iveSrc(cfg.slug, expr)}
        alt={`${member} ${expr}`}
        width={size - ring * 2}
        height={size - ring * 2}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          objectFit: "cover",
          objectPosition: cfg.focal[expr],
          border: "2px solid rgba(255,255,255,0.85)",
          display: "block",
        }}
      />
    </span>
  );
}
