/**
 * 메인 허브에 노출할 섹션 목록.
 * go-dobby는 모든 작업이 오케스트레이션(오더)이므로, 첫 페이지는 오케스트레이션 카드만
 * 두되 개발 작업(code)/비개발 작업(비소스)으로 나눠 보여준다.
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
    | "ClusterOutlined";
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
    key: "orch-nonsource",
    title: "비개발 작업",
    description: "비소스 산출 오케스트레이션(dobby-produce) — 문서·리서치·분석",
    path: "/orchestration?type=nonsource",
    icon: "DeploymentUnitOutlined",
    area: "orchestration",
    enabled: true,
  },
];
