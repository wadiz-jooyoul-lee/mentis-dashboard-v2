/**
 * 오더 상세 진입 중에 보여 주는 골격(스켈레톤).
 *
 * 왜 필요한가: 예전에는 목록에서 오더를 클릭하면 서버 렌더가 끝날 때까지 이전 화면이
 * 그대로 남아 아무 반응이 없는 것처럼 보였다(먹통처럼 느껴짐). Next.js는 라우트 폴더에
 * `loading.tsx`가 있으면 서버가 준비되기 전에 이 화면을 즉시 그려 준다.
 *
 * 왜 antd를 쓰지 않는가: antd의 Skeleton을 쓰면 그 컴포넌트의 CSS-in-JS 스타일이 통째로
 * 따라붙어 **모든 상세 화면의 응답이 약 140 KB씩 커졌다**(실측). 로딩 골격은 회색 사각형만
 * 있으면 되므로 순수 CSS로 그린다. 서버 컴포넌트라 자바스크립트도 전송되지 않는다.
 *
 * 실제 화면(공통 헤더 + 칸반 4열)과 같은 자리·높이를 잡아, 데이터가 도착했을 때
 * 레이아웃이 튀지 않게 한다.
 */

/** 회색 사각형 하나. w는 CSS 너비(숫자면 px). */
function Bar({ w, h = 16, mt = 0 }: { w: number | string; h?: number; mt?: number }) {
  return (
    <div
      className="order-skeleton-bar"
      style={{ width: typeof w === "number" ? `${w}px` : w, height: h, marginTop: mt }}
    />
  );
}

export default function OrderDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="불러오는 중">
      <style>{`
        .order-skeleton-bar {
          border-radius: 4px;
          background: linear-gradient(90deg, #f2f2f2 25%, #e6e6e6 37%, #f2f2f2 63%);
          background-size: 400% 100%;
          animation: order-skeleton-shimmer 1.4s ease infinite;
        }
        @keyframes order-skeleton-shimmer {
          0% { background-position: 100% 50%; }
          100% { background-position: 0 50%; }
        }
        .order-skeleton-cols {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
        }
        @media (max-width: 992px) { .order-skeleton-cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 576px) { .order-skeleton-cols { grid-template-columns: 1fr; } }
        .order-skeleton-card {
          border: 1px solid #f0f0f0;
          border-radius: 8px;
          padding: 12px;
          background: #fff;
        }
      `}</style>

      {/* 공통 헤더 자리: 브레드크럼 + 제목 + 탭 바 */}
      <div style={{ marginBottom: 24 }}>
        <Bar w={160} h={14} />
        <Bar w={320} h={30} mt={12} />
        <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Bar key={i} w={56} h={14} />
          ))}
        </div>
      </div>

      {/* 칸반 4열 자리 */}
      <div className="order-skeleton-cols">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="order-skeleton-card">
            <Bar w="50%" h={14} />
            <Bar w="100%" h={12} mt={12} />
            <Bar w="90%" h={12} mt={8} />
            <Bar w="70%" h={12} mt={8} />
          </div>
        ))}
      </div>
    </div>
  );
}
