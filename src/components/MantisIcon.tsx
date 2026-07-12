/** 귀여운 사마귀 캐릭터 아이콘(큰 눈·볼터치·기도 앞다리). */
export default function MantisIcon({
  size = 26,
  color = "#73d13d",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      role="img"
    >
      {/* 더듬이 */}
      <g stroke={color} strokeWidth={1.3} strokeLinecap="round">
        <path d="M9 4.6 C 8.2 3, 8.4 2.2, 9.2 1.9" />
        <path d="M15 4.6 C 15.8 3, 15.6 2.2, 14.8 1.9" />
      </g>
      <circle cx="9.4" cy="1.8" r="1" fill={color} />
      <circle cx="14.6" cy="1.8" r="1" fill={color} />

      {/* 몸통 */}
      <ellipse cx="12" cy="17" rx="3" ry="3.4" fill={color} />
      {/* 기도하는 앞다리 */}
      <g
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9.9 15 C 8 15, 7.2 16, 7.7 17.3" />
        <path d="M14.1 15 C 16 15, 16.8 16, 16.3 17.3" />
      </g>
      {/* 다리 */}
      <g stroke={color} strokeWidth={1.3} strokeLinecap="round">
        <path d="M10.6 19.7 L9.6 21.3" />
        <path d="M13.4 19.7 L14.4 21.3" />
      </g>

      {/* 머리 */}
      <path
        fill={color}
        d="M6 6.2 C 9 4.4, 15 4.4, 18 6.2 C 17 11, 14.6 13.4, 12 13.8 C 9.4 13.4, 7 11, 6 6.2 Z"
      />
      {/* 볼터치 */}
      <circle cx="7.7" cy="10.3" r="0.9" fill="#ff9ea6" opacity={0.75} />
      <circle cx="16.3" cy="10.3" r="0.9" fill="#ff9ea6" opacity={0.75} />
      {/* 눈 */}
      <circle cx="9" cy="7.9" r="2.1" fill="#fff" />
      <circle cx="15" cy="7.9" r="2.1" fill="#fff" />
      <circle cx="9.3" cy="8.2" r="1" fill="#20303a" />
      <circle cx="14.7" cy="8.2" r="1" fill="#20303a" />
      <circle cx="8.8" cy="7.6" r="0.35" fill="#fff" />
      <circle cx="14.2" cy="7.6" r="0.35" fill="#fff" />
      {/* 미소 */}
      <path
        d="M10.7 11 Q 12 12.2 13.3 11"
        fill="none"
        stroke="#20303a"
        strokeWidth={1}
        strokeLinecap="round"
      />
    </svg>
  );
}
