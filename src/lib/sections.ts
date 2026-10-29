/**
 * 메인 허브에 노출할 섹션 목록.
 * go-dobby는 모든 작업이 오케스트레이션(오더)이므로, 첫 페이지는 오케스트레이션 카드만
 * 두되 개발 작업 카드와 데이터 분석·아티팩트·릴리즈 카드를 보여준다.
 */
export type SectionArea = "orchestration";

export type Section = {
  /** 고유 키 */
  key: string;
  /** 카드 제목 */
  title: string;
  /** 카드 설명 */
  description: string;
  /** 이동 경로 */
  path: string;
  /** 아이콘 이름(@ant-design/icons 컴포넌트명) */
  icon:
    | "ExperimentOutlined"
    | "RocketOutlined"
    | "CheckSquareOutlined"
    | "DeploymentUnitOutlined"
    | "ClusterOutlined"
    | "ShareAltOutlined"
    | "BarChartOutlined";
  /** 소속 영역 */
  area: SectionArea;
  /** false면 "준비 중"으로 비활성 표시 */
  enabled: boolean;
};

/** 영역 표시명 */
export const AREA_LABELS: Record<SectionArea, string> = {
  orchestration: "오케스트레이션 (dobby-order)",
};

export const AREA_ORDER: SectionArea[] = ["orchestration"];

export const sections: Section[] = [
  {
    key: "orch-code",
    title: "개발 작업",
    description: "코드 오케스트레이션(dobby-impl) — 착수·구현·리뷰·통합",
    path: "/orchestration?type=code",
    icon: "ClusterOutlined",
    area: "orchestration",
    enabled: true,
  },
  {
    key: "data",
    title: "데이터 분석",
    description: "해결된 작업의 성과(dobby-data) — 와디태그로 본 변화와 판정",
    path: "/data",
    icon: "BarChartOutlined",
    area: "orchestration",
    enabled: true,
  },
  {
    key: "artifacts",
    title: "아티팩트",
    description: "공개용으로 게시한 아티팩트(dobby-share) — 갱신 최신순",
    path: "/artifacts",
    icon: "ShareAltOutlined",
    area: "orchestration",
    enabled: true,
  },
  {
    key: "releases",
    title: "릴리즈",
    description: "정기배포 stage 검증(dobby-stage) — 배포일별 핵심 TC 결과",
    path: "/releases",
    icon: "RocketOutlined",
    area: "orchestration",
    enabled: true,
  },
];
