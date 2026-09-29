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
 *
 * ⛔ 검증 회차에서 미루어 만든 행(inferred)은 **마지막 칸만** 켠다. PR·리뷰·머지·빌드는
 * dobby-ship 을 돌려야 아는 값인데, 앞 칸까지 켜면 확인하지도 않은 것을 끝났다고 보여 준다.
 */
function milestoneStyle(i: number, r: ShipRow): TagStyle {
  if (r.inferred) {
    if (i !== r.milestone) return { color: "default", variant: "filled" };
    return r.done
      ? { color: "success", variant: "outlined" }
      : { color: "processing", variant: "solid" };
  }
  if (r.done || i < r.milestone) return { color: "success", variant: "outlined" };
  if (i === r.milestone) return { color: r.blocked ? "error" : "processing", variant: "solid" };
  return { color: "default", variant: "filled" };
}

/**
 * 이 행이 어디서 왔는지 — 풍선말에 그대로 적는다.
 * 추론이면 그 사실과 한계("앞 단계는 모른다")를 같이 밝힌다.
 */
function sourceText(r: ShipRow): string {
  if (!r.inferred) return r.updatedAt ? `## 배포 기록 · 갱신 ${r.updatedAt}` : "## 배포 기록";
  const when = r.updatedAt ? ` (${r.updatedAt})` : "";
  return `검증 회차에서 읽음${when} — PR·리뷰·머지·빌드는 dobby-ship 을 돌려야 알 수 있습니다`;
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
          <Tooltip title={sourceText(r)}>
            <Tag
              color={ENV_COLOR[r.env] ?? "default"}
              style={{
                margin: 0,
                minWidth: 48,
                textAlign: "center",
                // 미루어 만든 행은 테두리를 점선으로 — 기록과 섞이면 추측이 사실처럼 읽힌다.
                borderStyle: r.inferred ? "dashed" : undefined,
              }}
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
            type={r.blocked ? "danger" : r.inferred ? "secondary" : undefined}
          >
            {r.stage}
            {r.inferred && " (검증 기록)"}
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

/**
 * 목록용 한 줄 요약. 표 칸이 좁아 환경과 상태만 태그로 찍는다.
 *
 * ⛔ 색은 **상태**가 정한다(빨강 막힘 · 초록 끝남 · 파랑 진행중). 환경별 색도 해 봤는데,
 * 실패하거나 진행중인 칸이 초록과 같은 무게로 보여 어디가 문제인지 안 읽혔다.
 * 어느 환경인지는 태그 안의 글자가 말해 준다.
 */
export function ShipTags({ rows }: { rows: ShipRow[] }) {
  if (!rows.length) return <Text type="secondary">-</Text>;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {rows.map((r) => (
        <Tooltip
          key={r.env}
          title={`${r.stage}${r.pr ? ` · ${r.pr}` : ""}${r.note ? ` · ${r.note}` : ""} — ${sourceText(r)}`}
        >
          <Tag
            color={r.blocked ? "error" : r.done ? "success" : "processing"}
            style={{
              margin: 0,
              // 기록이 아니라 검증 회차에서 미루어 만든 값이라는 표시.
              borderStyle: r.inferred ? "dashed" : undefined,
            }}
          >
            {r.env} {r.blocked ? "⚠" : r.done ? "✓" : r.stage}
          </Tag>
        </Tooltip>
      ))}
    </span>
  );
}
