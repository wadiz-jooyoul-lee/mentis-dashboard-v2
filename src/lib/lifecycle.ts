// 메인 허브 카드용 요약 지표 타입.
export type Metric = {
  label: string;
  value: number;
  /** 오늘자 카운트(없으면 전체만 표시) */
  today?: number;
  color?: string;
};
