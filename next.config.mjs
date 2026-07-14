/** @type {import('next').NextConfig} */
const nextConfig = {
  // 검증용 격리 빌드 지원: NEXT_DIST_DIR로 산출 폴더를 바꿔 실행 중 서버의 .next를
  // 건드리지 않고 다른 포트에서 확인할 수 있다(미설정 시 기본 .next).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  eslint: {
    // eslint-plugin-react@7.37.5의 react/display-name 규칙이 side-channel@1.1.1
    // 상류 버그로 로드 시 크래시한다(우리 코드 무관). 빌드 린트를 끄고 타입
    // 안전성은 `tsc --noEmit`로 확보한다. 상류 수정 시 되돌린다.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
