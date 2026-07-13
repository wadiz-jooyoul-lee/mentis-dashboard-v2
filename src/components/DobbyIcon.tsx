/**
 * 도비(해리포터 집요정) 캐릭터 아이콘 — 표정 변화 지원.
 * 특징: 크고 뾰족한 박쥐 귀 · 대머리 · 테니스공만 한 큰 초록 눈 · 긴 코.
 * 표정: happy(기쁨) · thinking(고민) · tired(힘듦) · curious(궁금) · neutral(기본).
 */
export type DobbyExpression =
  | "happy"
  | "resting"
  | "thinking"
  | "tired"
  | "curious"
  | "neutral";

/** 에이전트 상태 → 도비 표정(오케스트레이션 보드·전체 아바타 페이지 공용). */
export function dobbyExpression(state: string): DobbyExpression {
  switch (state) {
    case "대기":
    case "재통합대기":
      return "resting";
    case "완료":
      return "happy";
    case "분석중":
    case "분석완료":
      return "thinking";
    case "구현중":
    case "진행중":
    case "수정중":
      return "tired";
    case "리뷰중":
      return "curious";
    default:
      return "neutral";
  }
}

/** 헥스 색을 factor(0~1)만큼 어둡게 만든다(윤곽선용). */
function darken(hex: string, factor: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  const ch = (shift: number) =>
    Math.round(((n >> shift) & 255) * factor)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

export default function DobbyIcon({
  size = 32,
  expression = "neutral",
  color = "#d8c39a",
}: {
  size?: number;
  expression?: DobbyExpression;
  /** 머리·귀·몸통 스킨색(에이전트별 주입). 눈/귀안쪽/윤곽 accent는 고정. */
  color?: string;
}) {
  const skin = color;
  const skinDark = darken(color, 0.8);
  const ear = "#e3b7a6";
  const eye = "#7cc24a";
  const ink = "#20303a";

  // 표정별 시선(동공 위치)
  const gaze = {
    happy: { lx: 10.1, rx: 13.9, cy: 12.2 },
    resting: { lx: 10.1, rx: 13.9, cy: 12.2 }, // 눈 감음(미사용)
    thinking: { lx: 10.5, rx: 14.3, cy: 11.5 }, // 위쪽·바깥 응시
    tired: { lx: 10.1, rx: 13.9, cy: 12.7 }, // 처진 시선
    curious: { lx: 10.3, rx: 14.1, cy: 11.9 },
    neutral: { lx: 10.1, rx: 13.9, cy: 12.2 },
  }[expression];

  const eyesClosed = expression === "resting";

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      role="img"
      style={{ flexShrink: 0 }}
    >
      {/* 귀 */}
      <path
        d="M9 9.5 C 5 6.5, 2 6, 1.4 7.8 C 2.6 11, 5.6 13.2, 9 13.6 Z"
        fill={skin}
        stroke={skinDark}
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
      <path
        d="M15 9.5 C 19 6.5, 22 6, 22.6 7.8 C 21.4 11, 18.4 13.2, 15 13.6 Z"
        fill={skin}
        stroke={skinDark}
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
      <path d="M8 10.2 C 5.4 8.6, 3.6 8.4, 3 9.4 C 4 11, 5.8 12, 8 12.4 Z" fill={ear} opacity={0.75} />
      <path d="M16 10.2 C 18.6 8.6, 20.4 8.4, 21 9.4 C 20 11, 18.2 12, 16 12.4 Z" fill={ear} opacity={0.75} />

      {/* 머리 */}
      <ellipse cx="12" cy="13" rx="4.3" ry="5.2" fill={skin} stroke={skinDark} strokeWidth={0.6} />

      {/* 눈: 감음(휴식) 또는 뜬 눈(그 외) */}
      {eyesClosed ? (
        <g stroke={ink} strokeWidth={0.6} strokeLinecap="round" fill="none">
          {/* 편안하게 감은 눈 ‿ ‿ */}
          <path d="M8.6 11.8 Q 10.1 12.9 11.6 11.8" />
          <path d="M12.4 11.8 Q 13.9 12.9 15.4 11.8" />
        </g>
      ) : (
        <>
          <ellipse cx="10.1" cy="12" rx="1.7" ry="2" fill="#fff" />
          <ellipse cx="13.9" cy="12" rx="1.7" ry="2" fill="#fff" />
          <circle cx={gaze.lx} cy={gaze.cy} r={1.15} fill={eye} />
          <circle cx={gaze.rx} cy={gaze.cy} r={1.15} fill={eye} />
          <circle cx={gaze.lx} cy={gaze.cy + 0.1} r={0.55} fill={ink} />
          <circle cx={gaze.rx} cy={gaze.cy + 0.1} r={0.55} fill={ink} />
          <circle cx={gaze.lx - 0.4} cy={gaze.cy - 0.5} r={0.28} fill="#fff" />
          <circle cx={gaze.rx - 0.4} cy={gaze.cy - 0.5} r={0.28} fill="#fff" />
        </>
      )}

      {/* 코 */}
      <path
        d="M12 14 C 11.6 14.8, 11.6 15.4, 12 15.7 C 12.4 15.4, 12.4 14.8, 12 14 Z"
        fill={skinDark}
        opacity={0.65}
      />

      {/* --- 표정별 눈썹 --- */}
      {expression === "thinking" && (
        <g stroke={ink} strokeWidth={0.55} strokeLinecap="round">
          <path d="M8.7 9.7 L10.2 9.3" />
          <path d="M13.6 9.1 L15.3 9.6" />
        </g>
      )}
      {expression === "tired" && (
        <g stroke={ink} strokeWidth={0.55} strokeLinecap="round">
          {/* 처진 눈꺼풀 */}
          <path d="M8.4 11.3 Q 10.1 10.7 11.8 11.3" fill="none" />
          <path d="M12.2 11.3 Q 13.9 10.7 15.6 11.3" fill="none" />
          {/* 안쪽이 올라간 눈썹 */}
          <path d="M8.6 9.9 L10.3 9.4" />
          <path d="M13.7 9.4 L15.4 9.9" />
        </g>
      )}
      {expression === "curious" && (
        <g stroke={ink} strokeWidth={0.55} strokeLinecap="round" fill="none">
          <path d="M8.7 9.5 Q 9.5 9.1 10.3 9.4" />
          <path d="M13.6 9.0 Q 14.5 8.5 15.4 9.1" />
        </g>
      )}

      {/* --- 표정별 입 --- */}
      {expression === "happy" && (
        <>
          <path
            d="M9.7 15.5 Q 12 18.4 14.3 15.5"
            fill="none"
            stroke={ink}
            strokeWidth={0.85}
            strokeLinecap="round"
          />
          <rect x="11.4" y="15.9" width="1.2" height="1" rx="0.2" fill="#fff" stroke={ink} strokeWidth={0.3} />
        </>
      )}
      {expression === "neutral" && (
        <>
          <path
            d="M10.4 16.4 Q 12 17.8 13.6 16.4"
            fill="none"
            stroke={ink}
            strokeWidth={0.85}
            strokeLinecap="round"
          />
          <rect x="11.5" y="16.5" width="1" height="0.9" rx="0.2" fill="#fff" stroke={ink} strokeWidth={0.3} />
        </>
      )}
      {expression === "thinking" && (
        <path
          d="M11 16.3 Q 12.4 15.7 13.2 16.6"
          fill="none"
          stroke={ink}
          strokeWidth={0.85}
          strokeLinecap="round"
        />
      )}
      {expression === "tired" && (
        <path
          d="M10.3 16 Q 11.15 15.4 12 16 Q 12.85 16.6 13.7 16"
          fill="none"
          stroke={ink}
          strokeWidth={0.85}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {expression === "resting" && (
        <path
          d="M10.7 16 Q 12 16.9 13.3 16"
          fill="none"
          stroke={ink}
          strokeWidth={0.85}
          strokeLinecap="round"
        />
      )}
      {expression === "curious" && (
        <ellipse cx="12" cy="16.3" rx="0.7" ry="0.9" fill={ink} />
      )}

      {/* --- 표정별 장식 --- */}
      {/* 기쁨: 볼터치 */}
      {expression === "happy" && (
        <>
          <circle cx="8.7" cy="14" r="0.9" fill="#ff9ea6" opacity={0.6} />
          <circle cx="15.3" cy="14" r="0.9" fill="#ff9ea6" opacity={0.6} />
        </>
      )}
      {/* 휴식: 느긋한 볼터치 + 졸음 z */}
      {expression === "resting" && (
        <>
          <circle cx="8.7" cy="13.8" r="0.85" fill="#ff9ea6" opacity={0.5} />
          <circle cx="15.3" cy="13.8" r="0.85" fill="#ff9ea6" opacity={0.5} />
          <g stroke="#8aa0ab" strokeWidth={0.5} strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M16.6 8.4 h1.3 l-1.3 1.5 h1.3" />
            <path d="M18.4 6.6 h1 l-1 1.2 h1" />
          </g>
        </>
      )}
      {/* 고민: 생각 점 */}
      {expression === "thinking" && (
        <g fill={skinDark}>
          <circle cx="17.3" cy="8.4" r={0.4} />
          <circle cx="18.4" cy="7.5" r={0.3} />
          <circle cx="19.3" cy="6.8" r={0.22} />
        </g>
      )}
      {/* 힘듦: 땀방울 */}
      {expression === "tired" && (
        <path
          d="M16.4 8.9 Q 17.3 10.2 16.4 10.9 Q 15.5 10.2 16.4 8.9 Z"
          fill="#6cc5f5"
          stroke="#3aa0e0"
          strokeWidth={0.2}
        />
      )}
      {/* 궁금: 물음표 */}
      {expression === "curious" && (
        <g stroke="#f5a623" strokeWidth={0.7} strokeLinecap="round" fill="none">
          <path d="M16.8 6.5 Q 16.8 5.4 17.8 5.4 Q 18.8 5.4 18.8 6.4 Q 18.8 7.1 17.9 7.6 L 17.9 8.2" />
          <circle cx="17.9" cy="9.2" r={0.18} fill="#f5a623" stroke="none" />
        </g>
      )}
    </svg>
  );
}
