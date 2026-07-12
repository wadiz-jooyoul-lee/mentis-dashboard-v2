/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // eslint-plugin-react@7.37.5의 react/display-name 규칙이 side-channel@1.1.1
    // 상류 버그로 로드 시 크래시한다(우리 코드 무관). 빌드 린트를 끄고 타입
    // 안전성은 `tsc --noEmit`로 확보한다. 상류 수정 시 되돌린다.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
