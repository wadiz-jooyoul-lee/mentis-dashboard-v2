"use client";

import Link from "next/link";
import { Card, Tag, Typography, Progress, Tooltip } from "antd";
import type { DataBadge, DataCardItem, DataHeadline } from "@/lib/data";

const { Text } = Typography;

export const BADGE_COLOR: Record<DataBadge, string> = {
  "성과 있음": "green",
  "나빠짐": "red",
  "판단 이르다": "orange",
  "차이 없음": "default",
  "수집 이상": "magenta",
  "수집 확인": "blue",
};

const BADGE_MEANING: Record<string, string> = {
  "수집 이상": "기록이 0건인 날이 있거나, 두 그룹에 사람이 고르게 나뉘지 않았습니다. 숫자를 믿기 전에 수집을 확인해야 합니다.",
  "성과 있음": "좋아진 차이가 우연이라고 보기 어렵습니다(우연일 가능성 5% 미만).",
  나빠짐: "나빠진 차이가 우연이라고 보기 어렵습니다(우연일 가능성 5% 미만).",
  "판단 이르다": "본 기기가 너무 적어 아직 차이가 우연인지 가릴 수 없습니다.",
  "차이 없음": "본 기기는 충분한데 차이가 우연과 구별되지 않습니다.",
  "수집 확인": "비교 없이 새 기록이 잘 쌓이는지만 봅니다.",
};

export function BadgeTag({ badge }: { badge: DataBadge | null | undefined }) {
  if (!badge) return null;
  return (
    <Tooltip title={BADGE_MEANING[badge]}>
      <Tag color={BADGE_COLOR[badge] ?? "default"}>{badge}</Tag>
    </Tooltip>
  );
}

export const pct = (v: number | null | undefined) => (v == null ? "-" : `${(v * 100).toFixed(2)}%`);
/** p값을 "우연으로도 생길 수 있는 차이일 가능성" 백분율로. 5% 보다 낮아야 우연이 아니라고 본다. */
export const pText = (p: number | null | undefined) => (p == null ? "-" : p < 0.01 ? "1% 미만" : `${Math.round(p * 100)}%`);

const DEVICE_NAME: Record<string, string> = { MOBILE_WEB: "모바일 웹", PC_WEB: "PC 웹", APP: "앱" };
export const deviceName = (name: string) => DEVICE_NAME[name] ?? name;

/** 변화율 ▲▼. 좋아진 방향이면 초록, 나빠지면 빨강. */
export function ChangeRate({ rate, direction }: { rate: number | null | undefined; direction: "up" | "down" }) {
  if (rate == null) return <Text type="secondary">-</Text>;
  const better = direction === "down" ? rate < 0 : rate > 0;
  return (
    <span style={{ color: rate === 0 ? undefined : better ? "#389e0d" : "#cf1322", fontWeight: 600 }}>
      {rate > 0 ? "▲" : rate < 0 ? "▼" : ""} {(Math.abs(rate) * 100).toFixed(1)}%
    </span>
  );
}

/** 핵심 지표 값. new_events 는 하루 평균 건수, 나머지는 비율. */
export function headlineValue(kind: string, h: DataHeadline | null) {
  if (!h) return "-";
  if (kind === "new_events") return h.target.value == null ? "-" : `${h.target.value.toLocaleString()}건/일`;
  return pct(h.target.value);
}

const LINE_COLORS = ["#1677ff", "#fa8c16", "#52c41a", "#eb2f96", "#722ed1", "#13c2c2"];

/** 일별 건수 선 그래프(라이브러리 없이 SVG). 가로는 칸 너비에 맞춰 늘어난다. */
export function DataLines({
  rows,
  series,
  height,
  legend = false,
}: {
  rows: { date: string; values: Record<string, number> }[];
  series: string[];
  height: number;
  legend?: boolean;
}) {
  if (rows.length === 0 || series.length === 0) return null;
  const W = 1000;
  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => r.values[s] ?? 0)));
  const x = (i: number) => (rows.length === 1 ? W / 2 : (i / (rows.length - 1)) * W);
  const y = (v: number) => height - 2 - (v / max) * (height - 4);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
        {series.map((s, si) => (
          <polyline
            key={s}
            fill="none"
            stroke={LINE_COLORS[si % LINE_COLORS.length]}
            strokeWidth={legend ? 2 : 1.5}
            vectorEffect="non-scaling-stroke"
            points={rows.map((r, i) => `${x(i)},${y(r.values[s] ?? 0)}`).join(" ")}
          />
        ))}
      </svg>
      {legend && (
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 12, marginTop: 4 }}>
          <Text type="secondary">{rows[0].date}</Text>
          <span style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {series.map((s, si) => (
              <span key={s}>
                <span style={{ color: LINE_COLORS[si % LINE_COLORS.length] }}>━</span> {s} (최대{" "}
                {Math.max(...rows.map((r) => r.values[s] ?? 0)).toLocaleString()})
              </span>
            ))}
          </span>
          <Text type="secondary">{rows[rows.length - 1].date}</Text>
        </div>
      )}
    </div>
  );
}

function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(`${date}T00:00:00+09:00`).getTime()) / 86400000);
}

/** /data 카드 한 장. 누르면 그 오더의 데이터 탭으로 간다. */
export default function DataCard({ card }: { card: DataCardItem }) {
  const h = card.headline;
  const last = card.lastRunId ? `${card.lastRunId.slice(0, 4)}-${card.lastRunId.slice(4, 6)}-${card.lastRunId.slice(6, 8)}` : "-";
  return (
    <Link href={`/orchestration/${card.key}/data`} style={{ display: "block", height: "100%" }}>
      <Card hoverable size="small" style={{ height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text strong>{card.key}</Text>
          <BadgeTag badge={card.verdict} />
          <Text ellipsis style={{ flex: 1, minWidth: 0 }}>
            {card.title ?? ""}
          </Text>
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          배포 {card.liveDate} · {daysSince(card.liveDate)}일 지남 · 분석 {card.runs}회 · 마지막 {last}
        </Text>
        <div style={{ margin: "8px 0", display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 24, fontWeight: 700 }}>{headlineValue(card.kind, h)}</span>
          {h?.compare && (
            <>
              <ChangeRate rate={h.changeRate} direction={card.direction} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {h.metric} · 비교 {h.compare.label} {pct(h.compare.value)} · 우연일 가능성 {pText(h.p)}
              </Text>
            </>
          )}
          {!h?.compare && h && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {h.metric}
            </Text>
          )}
        </div>
        {card.segments.map((s) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 90 }}>{s.name}</span>
            <ChangeRate rate={s.changeRate} direction={card.direction} />
            <BadgeTag badge={s.badge} />
            {s.badge === "판단 이르다" && s.requiredN ? (
              <Progress
                size="small"
                style={{ flex: 1, margin: 0 }}
                percent={Math.min(100, Math.round((Math.min(s.target.n, s.compare.n) / s.requiredN) * 100))}
              />
            ) : null}
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <DataLines rows={card.daily.rows} series={card.daily.series.slice(0, 1)} height={32} />
        </div>
        {card.oneLine && (
          <Text style={{ display: "block", marginTop: 6, fontSize: 12 }}>{card.oneLine}</Text>
        )}
      </Card>
    </Link>
  );
}
