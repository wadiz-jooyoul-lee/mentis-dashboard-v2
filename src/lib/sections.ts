/**
 * 메인 허브에 노출할 대시보드 섹션 목록.
 * 새 대시보드를 추가하려면 여기에 항목을 하나 추가하고
 * `src/app/{path}/` 라우트를 만들면 된다.
 */
export type SectionArea = "issue" | "orchestration";

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
  issue: "이슈 단위 (개별 이슈 생명주기)",
  orchestration: "멀티 에이전트 (work-dobby 오케스트레이션)",
};

export const AREA_ORDER: SectionArea[] = ["issue", "orchestration"];

export const sections: Section[] = [
  {
    key: "issue-start",
    title: "이슈 착수",
    description: "단독 issue-start 착수·분석 현황",
    path: "/issue-start",
    icon: "RocketOutlined",
    area: "issue",
    enabled: true,
  },
  {
    key: "issue-test",
    title: "이슈 테스트",
    description: "issue-test 실행 결과를 이슈별로 확인",
    path: "/issue-test",
    icon: "ExperimentOutlined",
    area: "issue",
    enabled: true,
  },
  {
    key: "issue-end",
    title: "이슈 종료",
    description: "종료된 이슈의 워크트리 정리·종료 서머리",
    path: "/issue-end",
    icon: "CheckSquareOutlined",
    area: "issue",
    enabled: true,
  },
  {
    key: "lifecycle",
    title: "생명주기 개요",
    description: "착수 → 테스트 → 종료를 이슈별로 한눈에",
    path: "/lifecycle",
    icon: "DeploymentUnitOutlined",
    area: "issue",
    enabled: true,
  },
  {
    key: "orchestration",
    title: "오케스트레이션 보드",
    description: "에픽을 하위이슈로 나눈 멀티 에이전트 진행 관제탑",
    path: "/orchestration",
    icon: "ClusterOutlined",
    area: "orchestration",
    enabled: true,
  },
];
