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
    if (r.blocked) return { color: "error", variant: "solid" };
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
  const who = r.repo ? `${r.repo} · ` : "";
  if (!r.inferred) return who + (r.updatedAt ? `## 배포 기록 · 갱신 ${r.updatedAt}` : "## 배포 기록");
  const when = r.updatedAt ? ` (${r.updatedAt})` : "";
  return `검증 회차에서 읽음${when} — 저장소·PR·리뷰·머지·빌드는 dobby-ship 을 돌려야 알 수 있습니다`;
}

/** 행의 저장소에 맞는 GitHub 주소. 행에 저장소가 없으면(옛 기록·추론 행) 오더 전체 값으로 떨어진다. */
function rowRepoUrl(r: ShipRow, fallback?: string | null): string | null {
  if (!r.repo) return fallback ?? null;
  const owner = REPO_OWNER[r.repo];
  // 모르는 저장소면 주소를 지어내지 않는다 — 틀린 링크보다 링크가 없는 편이 낫다.
  return owner ? `https://github.com/${owner}` : (fallback ?? null);
}

/** 저장소 이름 → owner/repo. dobby-lib.sh 의 `_ship_owner` 와 같은 표다. */
export const REPO_OWNER: Record<string, string> = {
  "wadiz-frontend": "wadiz-fe/wadiz-frontend",
  "com.wadiz.web": "wadiz-web/com.wadiz.web",
};

/** 저장소 이름을 좁은 칸에 들어가게 줄인다. 어느 쪽인지만 구분되면 된다. */
const REPO_SHORT: Record<string, string> = {
  "wadiz-frontend": "FE",
  "com.wadiz.web": "WEB",
};

/**
 * dobby-ship 배포 단계를 (저장소, 환경)마다 한 줄씩 보여 준다(오더 상세 관제 카드).
 *
 * 아홉 단계를 다섯 칸으로 접는다 — 아홉 칸은 화면에서 너무 잘게 나뉜다.
 * 정확한 낱말은 오른쪽에 그대로 적는다. 막힌 환경(⚠)은 그 칸이 빨갛게 된다.
 * PR 번호와 번들 이름은 **그 행의 저장소**로 이어진다(모르면 글자만).
 */
export function ShipProgress({ rows, repoUrl }: { rows: ShipRow[]; repoUrl?: string | null }) {
  if (!rows.length) return null;
  // 저장소가 둘인 오더에서만 저장소 배지를 보여 준다 — 하나뿐이면 모든 줄에 같은 글자가
  // 붙어 자리만 먹는다.
  const multiRepo = new Set(rows.map((r) => r.repo).filter(Boolean)).size > 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => {
        const href = rowRepoUrl(r, repoUrl);
        return (
        <div
          key={`${r.repo ?? "-"}:${r.env}`}
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
          {multiRepo && (
            <Tooltip title={r.repo ?? "저장소를 알 수 없습니다"}>
              <Text type="secondary" style={{ fontSize: 11, minWidth: 28 }}>
                {r.repo ? (REPO_SHORT[r.repo] ?? r.repo) : "?"}
              </Text>
            </Tooltip>
          )}
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
            (href ? (
              <a
                href={`${href}/pull/${r.pr.replace(/[^0-9]/g, "")}`}
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
              {href && b.runId ? (
                <a
                  href={`${href}/actions/runs/${b.runId}`}
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
        );
      })}
    </div>
  );
}

/**
 * 목록용으로 **환경마다 한 개**가 되게 접는다.
 *
 * 저장소가 둘인 오더는 한 환경에 행이 둘이라, 그대로 찍으면 `rc4 ✓ rc4 ✓` 처럼 같은 태그가
 * 두 번 보인다. 좁은 칸에서 그건 정보가 아니라 소음이다. **가장 덜 간 쪽**을 남긴다 —
 * 목록이 답해야 하는 질문은 "이 오더가 어디까지 갔나"이고, 한쪽이라도 안 끝났으면 안 끝난 것이다.
 * 막힌 행이 있으면 그게 1순위다(사람이 손댈 자리를 묻지 않는다).
 */
function collapseByEnv(rows: ShipRow[]): ShipRow[] {
  const worst = new Map<string, ShipRow>();
  for (const r of rows) {
    const prev = worst.get(r.env);
    if (!prev) { worst.set(r.env, r); continue; }
    if (r.blocked && !prev.blocked) { worst.set(r.env, r); continue; }
    if (r.blocked === prev.blocked && r.milestone < prev.milestone) worst.set(r.env, r);
  }
  return [...worst.values()];
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
      {collapseByEnv(rows).map((r) => (
        <Tooltip
          key={`${r.repo ?? "-"}:${r.env}`}
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
