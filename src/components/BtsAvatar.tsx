// BTS 멤버 에이전트용 실사진 아바타. 원형 크롭 + 시그니처 색 링, 작업 상태에 따라
// 졸림·생각·집중·호기심·기쁨(=대기·분석·구현·리뷰·완료) 표정 사진을 스왑한다.
// 사진은 로컬 전용(public/avatars/bts/). 알 수 없는 멤버면 null(호출부에서 폴백).

import { BTS_AVATARS, btsColor, btsExpr, btsSrc, BTS_FOCAL } from "@/lib/bts";

export { BTS_AVATARS, btsColor };

export default function BtsAvatar({
  member,
  size = 56,
  state,
}: {
  member: string;
  size?: number;
  /** 있으면 상태에 맞는 표정 사진으로 스왑(대기·분석·구현·리뷰·완료). 없으면 생각(기본). */
  state?: string;
}) {
  const cfg = BTS_AVATARS[member];
  if (!cfg) return null;
  const expr = btsExpr(state);
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
        src={btsSrc(cfg.slug, expr)}
        alt={`${member} ${expr}`}
        width={size - ring * 2}
        height={size - ring * 2}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          objectFit: "cover",
          objectPosition: BTS_FOCAL[expr],
          border: "2px solid rgba(255,255,255,0.85)",
          display: "block",
        }}
      />
    </span>
  );
}
