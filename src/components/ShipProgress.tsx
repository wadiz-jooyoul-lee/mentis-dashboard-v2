"use client";

import { Tag, Tooltip, Typography } from "antd";
import { SHIP_MILESTONES, type ShipRow } from "@/lib/parseOrderStatus";

const { Text } = Typography;

/** 환경별 색. 뒤로 갈수록(dev→stage) 진해진다. */
const ENV_COLOR: Record<string, string> = {
  dev: "default",
  rc1: "blue",
  rc4: "geekblue",
  stage: "purple",
};

/**
 * 빌드 칸("static#36364314238 · global#36364316550")을 번들별로 가른다.
 * 칸에는 run id 를 담고 화면에는 번들 이름만 보인다 — id 는 사람이 읽을 값이 아니다.
 */
function parseBuild(build: string | null): Array<{ name: string; runId: string | null }> {
  if (!build) return [];
  return build
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [name, runId] = s.split("#");
      return { name: name.trim(), runId: runId?.trim() || null };
    });
}

type TagStyle = { color: string; variant: "filled" | "solid" | "outlined" };

/**
 * 다섯 칸의 모양. 지금 어디인지가 한눈에 들어오도록 세 가지로 가른다.
 *   · 끝난 칸   초록 테두리(outlined)
 *   · 지금 칸   꽉 찬 색(solid) — 막혀 있으면(⚠) 빨강
 *   · 아직     회색
 */
function milestoneStyle(i: number, r: ShipRow): TagStyle {
  if (r.done || i < r.milestone) return { color: "success", variant: "outlined" };
  if (i === r.milestone) return { color: r.blocked ? "error" : "processing", variant: "solid" };
  return { color: "default", variant: "filled" };
}

/**
 * dobby-ship 배포 단계를 환경마다 한 줄씩 보여 준다(오더 상세 관제 카드).
 *
 * 아홉 단계를 다섯 칸으로 접는다 — 아홉 칸은 화면에서 너무 잘게 나뉜다.
 * 정확한 낱말은 오른쪽에 그대로 적는다. 막힌 환경(⚠)은 그 칸이 빨갛게 된다.
 * repoUrl 이 있으면 PR 번호와 번들 이름이 GitHub 으로 이어진다(없으면 글자만).
 */
export function ShipProgress({ rows, repoUrl }: { rows: ShipRow[]; repoUrl?: string | null }) {
  if (!rows.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => (
        <div
          key={r.env}
          style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
        >
          <Tooltip title={r.updatedAt ? `갱신 ${r.updatedAt}` : undefined}>
            <Tag
              color={ENV_COLOR[r.env] ?? "default"}
              style={{ margin: 0, minWidth: 48, textAlign: "center" }}
            >
              {r.env}
            </Tag>
          </Tooltip>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {SHIP_MILESTONES.map((m, i) => {
              const t = milestoneStyle(i, r);
              return (
                <Tag
                  key={m}
                  color={t.color}
                  variant={t.variant}
                  style={{ margin: 0, fontSize: 12, whiteSpace: "nowrap" }}
                >
                  {m}
                </Tag>
              );
            })}
          </div>
          <Text
            style={{ fontSize: 12, whiteSpace: "nowrap" }}
            type={r.blocked ? "danger" : undefined}
          >
            {r.stage}
          </Text>
          {r.pr &&
            (repoUrl ? (
              <a
                href={`${repoUrl}/pull/${r.pr.replace(/[^0-9]/g, "")}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12 }}
              >
                {r.pr}
              </a>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {r.pr}
              </Text>
            ))}
          {parseBuild(r.build).map((b) => (
            <Tooltip key={b.name} title={b.runId ? `실행 ${b.runId}` : undefined}>
              {repoUrl && b.runId ? (
                <a
                  href={`${repoUrl}/actions/runs/${b.runId}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12 }}
                >
                  {b.name}
                </a>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {b.name}
                </Text>
              )}
            </Tooltip>
          ))}
          {r.note && (
            <Text type="danger" style={{ fontSize: 12 }}>
              {r.note}
            </Text>
          )}
        </div>
      ))}
    </div>
  );
}

/** 목록용 한 줄 요약. 표 칸이 좁아 환경과 상태만 태그로 찍는다. */
export function ShipTags({ rows }: { rows: ShipRow[] }) {
  if (!rows.length) return <Text type="secondary">-</Text>;
  return (
    <>
      {rows.map((r) => (
        <Tooltip
          key={r.env}
          title={`${r.stage}${r.pr ? ` · ${r.pr}` : ""}${r.note ? ` · ${r.note}` : ""}`}
        >
          <Tag
            color={r.blocked ? "error" : r.done ? "success" : "processing"}
            style={{ marginInlineEnd: 4 }}
          >
            {r.env} {r.blocked ? "⚠" : r.done ? "✓" : r.stage}
          </Tag>
        </Tooltip>
      ))}
    </>
  );
}
