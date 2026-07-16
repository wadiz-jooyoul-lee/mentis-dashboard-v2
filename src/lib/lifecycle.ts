// 메인 허브 카드용 요약 지표 타입.
export type Metric = {
  label: string;
  value: number;
  /** 오늘자 카운트(없으면 전체만 표시) */
  today?: number;
  color?: string;
};

// 허브 카드를 두 구획으로 나눠 보여주기 위한 지표 묶음(위=전체, 아래=오늘).
export type CardStats = {
  overall: Metric[];
  today: Metric[];
};
