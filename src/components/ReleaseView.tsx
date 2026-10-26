"use client";

import Link from "next/link";
import { Breadcrumb, Button, Card, Space, Table, Tag, Tooltip, Typography } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import ReleaseProgress, { RELEASE_TONE } from "@/components/ReleaseProgress";
import { isHold, type Release, type ReleaseIssue, type ReleaseTc } from "@/lib/releases";
import type { Verdict } from "@/lib/parseReport";

const { Title, Text } = Typography;

const VERDICT: Record<Verdict, { label: string; color?: string }> = {
  pass: { label: "통과", color: RELEASE_TONE.pass },
  fail: { label: "실패", color: RELEASE_TONE.fail },
  warn: { label: "보류", color: RELEASE_TONE.hold },
  skip: { label: "스킵", color: RELEASE_TONE.skip },
  unknown: { label: "남음" },
};
const verdictOf = (t: ReleaseTc) => (isHold(t) ? VERDICT.warn : VERDICT[t.verdict]);

function IssueCard({ issue }: { issue: ReleaseIssue }) {
  const untested = issue.reflected === "미반영";
  return (
    <Card
      size="small"
      title={
        <Space size={8} wrap>
          {issue.row && <Text type="secondary">{issue.row}행</Text>}
          {issue.hasOrder ? <Link href={`/orchestration/${issue.key}`}>{issue.key}</Link> : <Text>{issue.key}</Text>}
          {issue.title && <Text style={{ fontWeight: 400 }}>{issue.title}</Text>}
        </Space>
      }
      extra={
        <Space size={6} wrap>
          {issue.repos.map((r) => (
            <Tag key={r} style={{ margin: 0 }}>
              {r}
            </Tag>
          ))}
          {issue.reflected && (
            <Tag color={untested ? "warning" : "success"} style={{ margin: 0 }}>
              stage {issue.reflected}
            </Tag>
          )}
          {issue.stageCheck && <Tag style={{ margin: 0 }}>stage 칸 {issue.stageCheck}</Tag>}
        </Space>
      }
    >
      {untested ? (
        <Text type="secondary">stage 에 반영되지 않아 시험하지 않았습니다.{issue.note ? ` (${issue.note})` : ""}</Text>
      ) : (
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <ReleaseProgress counts={issue.counts} />
            </div>
            {issue.runs.length > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {issue.runs.map((r) => (r.no ? `${r.no}회차` : r.id)).join(" · ")}
              </Text>
            )}
            {issue.hasOrder && (
              <Link href={`/orchestration/${issue.key}/verify`} style={{ fontSize: 12 }}>
                오더 검증 탭 →
              </Link>
            )}
          </div>
          {issue.note && <Text type="secondary">비고: {issue.note}</Text>}
          <Table
            rowKey={(t: ReleaseTc) => t.num || t.check}
            size="small"
            pagination={false}
            dataSource={issue.tcs}
            scroll={{ x: 900 }}
            columns={[
              { title: "#", dataIndex: "num", width: 56 },
              { title: "확인 항목", dataIndex: "check", width: 220 },
              { title: "페이지", dataIndex: "page", width: 180, render: (v: string) => <Text style={{ fontSize: 12, wordBreak: "break-all" }}>{v}</Text> },
              { title: "기대", dataIndex: "expected", width: 180 },
              { title: "실제", dataIndex: "actual", width: 220 },
              {
                title: "판정",
                key: "verdict",
                width: 64,
                render: (_: unknown, t: ReleaseTc) => (
                  <Tooltip title={t.verdictRaw || undefined}>
                    <Text strong style={{ color: verdictOf(t).color }} type={t.verdict === "unknown" ? "secondary" : undefined}>
                      {verdictOf(t).label}
                    </Text>
                  </Tooltip>
                ),
              },
              { title: "근거", dataIndex: "evidence", width: 220, render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
            ]}
          />
          {issue.notDone.length > 0 && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                stage 에서 하지 않은 시험 (진행도에 넣지 않음)
              </Text>
              <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                {issue.notDone.map((n) => (
                  <li key={n}>
                    <Text style={{ fontSize: 13 }}>{n}</Text>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Space>
      )}
    </Card>
  );
}

/** 한 정기배포일의 stage 검증 — 전체 진행도와 이슈마다 핵심 TC 결과. */
export default function ReleaseView({ release }: { release: Release }) {
  const { counts } = release;
  const stat = (n: number, label: string, color?: string) => (
    <div style={{ flex: 1, minWidth: 80, padding: "10px 12px", background: "#fafafa", borderRadius: 8, textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: n > 0 ? color : undefined }}>{n}</div>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Text>
    </div>
  );
  return (
    <div>
      <Breadcrumb
        items={[{ title: <Link href="/">홈</Link> }, { title: <Link href="/releases">릴리즈</Link> }, { title: release.date }]}
        style={{ marginBottom: 12 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Title level={3} style={{ margin: 0 }}>
          {release.date}({release.weekday}) 정기배포 stage 검증
        </Title>
        <Tag color={release.status === "진행 중" ? "processing" : release.status === "완료" ? "success" : "default"}>
          {release.status}
        </Tag>
        {!release.regular && <Tag>정기배포일 아님</Tag>}
        {release.page && (
          <Button size="small" icon={<ExportOutlined />} href={release.page} target="_blank">
            릴리즈 노트 열기
          </Button>
        )}
      </div>
      {(release.startedAt || release.endedAt) && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          시작 {release.startedAt ?? "-"} · 끝 {release.endedAt ?? "-"}
        </Text>
      )}

      <Card style={{ marginTop: 16 }} styles={{ body: { padding: "16px 20px" } }}>
        <Text strong>전체 진행도</Text>
        <div style={{ marginTop: 8 }}>
          <ReleaseProgress counts={counts} height={10} />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          {stat(release.issues.length, "이슈")}
          {stat(counts.total, "핵심 TC")}
          {stat(counts.pass, "통과", RELEASE_TONE.pass)}
          {stat(counts.fail, "실패", RELEASE_TONE.fail)}
          {stat(counts.hold, "보류", RELEASE_TONE.hold)}
          {stat(counts.skip, "스킵")}
          {stat(counts.total - counts.done, "남음")}
        </div>
      </Card>

      <Space orientation="vertical" size={16} style={{ width: "100%", marginTop: 16 }}>
        {release.issues.map((i) => (
          <IssueCard key={i.key} issue={i} />
        ))}
      </Space>
    </div>
  );
}
