"use client";

import { Space, Tag, Tooltip, Typography } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { ReleaseNoteRow } from "@/lib/parseOrderStatus";
import { REPO_OWNER } from "@/components/ShipProgress";

const { Text } = Typography;

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-10-16" → "10/16(목)". 모양이 다르면 그대로. */
function dayLabel(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${Number(m[2])}/${Number(m[3])}(${WEEKDAY[d.getDay()]})`;
}

/**
 * 한 배포일의 색. 모두 머지됐으면 끝(초록), 충돌이 있으면 막힘(빨강), 그 밖은 아직 남은 일(주황).
 * 릴리스 PR 이 머지돼야 그 배포에 실제로 실린다 — 등록만 하고 머지를 빠뜨리는 경우를 눈에 띄게 한다.
 */
function groupColor(rows: ReleaseNoteRow[]): string {
  if (rows.some((r) => r.merge === "충돌")) return "error";
  if (rows.every((r) => r.merge === "머지됨")) return "success";
  return "warning";
}

function byDate(rows: ReleaseNoteRow[]): [string, ReleaseNoteRow[]][] {
  const m = new Map<string, ReleaseNoteRow[]>();
  for (const r of rows) m.set(r.date, [...(m.get(r.date) ?? []), r]);
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function prUrl(r: ReleaseNoteRow): string | null {
  const owner = REPO_OWNER[r.repo];
  const n = r.pr?.match(/^#?(\d+)$/)?.[1];
  // 모르는 저장소면 주소를 지어내지 않는다 — 틀린 링크보다 링크가 없는 편이 낫다.
  return owner && n ? `https://github.com/${owner}/pull/${n}` : null;
}

function rowText(r: ReleaseNoteRow): string {
  return `${r.repo}${r.row ? ` ${r.row}행` : ""} · 릴리스 PR ${r.pr ?? "없음"} ${r.merge}`;
}

/** 목록용 한 줄 요약 — 배포일마다 태그 하나. 기록이 없으면 "미등록". */
export function ReleaseNoteTags({ rows }: { rows: ReleaseNoteRow[] }) {
  if (!rows.length) return <Text type="secondary">미등록</Text>;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {byDate(rows).map(([date, rs]) => (
        <Tooltip key={date} title={rs.map(rowText).join(" / ")}>
          <Tag color={groupColor(rs)} style={{ margin: 0 }}>
            {dayLabel(date)} {rs.every((r) => r.merge === "머지됨") ? "✓" : "⚠"}
          </Tag>
        </Tooltip>
      ))}
    </span>
  );
}

/** 보드 관제 카드용 — (배포일, 저장소)마다 한 줄. PR·페이지로 이어진다. 기록이 없으면 등록 안내. */
export function ReleaseNoteList({ rows, epicKey }: { rows: ReleaseNoteRow[]; epicKey: string }) {
  if (!rows.length) {
    return (
      <Text type="secondary" style={{ fontSize: 13 }}>
        미등록 — 터미널에서 <Text code>/dobby-release {epicKey}</Text> 로 등록하면 여기에 표시됩니다.
      </Text>
    );
  }
  return (
    <Space orientation="vertical" size={4}>
      {byDate(rows).flatMap(([date, rs]) =>
        rs.map((r) => {
          const pr = prUrl(r);
          return (
            <Space key={`${date}:${r.repo}`} size={8} wrap style={{ fontSize: 13 }}>
              <Tag color={groupColor([r])} style={{ margin: 0 }}>
                {dayLabel(date)} 배포
              </Tag>
              <Text>{r.repo}</Text>
              {r.row && <Text type="secondary">{r.row}행</Text>}
              <Text type="secondary">
                릴리스 PR{" "}
                {pr ? (
                  <a href={pr} target="_blank" rel="noreferrer">
                    {r.pr}
                  </a>
                ) : (
                  (r.pr ?? "없음")
                )}{" "}
                {r.merge}
              </Text>
              {r.page && (
                <a href={r.page} target="_blank" rel="noreferrer">
                  <LinkOutlined /> 릴리즈 노트
                </a>
              )}
            </Space>
          );
        }),
      )}
    </Space>
  );
}
