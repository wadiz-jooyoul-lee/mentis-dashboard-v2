"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumb, Empty, Table, Tag, Typography } from "antd";
import ReleaseProgress, { RELEASE_TONE } from "@/components/ReleaseProgress";
import type { ReleaseSummary } from "@/lib/releases";

const { Title, Text } = Typography;

const STATUS_COLOR: Record<string, string> = { "진행 중": "processing", 완료: "success" };

/** 릴리즈 목차 — 정기배포일마다 한 줄, 최신이 위. 줄을 누르면 그 배포일 검증 화면으로 간다. */
export default function ReleaseListView({ items }: { items: ReleaseSummary[] }) {
  const router = useRouter();
  const n = (v: number, color?: string) => <Text style={{ color: v > 0 ? color : undefined }}>{v}</Text>;
  return (
    <div>
      <Breadcrumb items={[{ title: <Link href="/">홈</Link> }, { title: "릴리즈" }]} style={{ marginBottom: 12 }} />
      <Title level={3} style={{ marginTop: 0 }}>
        릴리즈 — 정기배포 stage 검증
      </Title>
      <Text type="secondary">
        dobby-stage 로 stage 에서 확인한 핵심 TC 를 배포일별로 모았습니다. 진행도는 핵심 TC 중 판정이
        끝난 비율입니다.
      </Text>
      {items.length === 0 ? (
        <Empty style={{ marginTop: 40 }} description="아직 stage 검증 기록이 없습니다" />
      ) : (
        <Table
          style={{ marginTop: 16 }}
          rowKey="date"
          size="middle"
          pagination={false}
          dataSource={items}
          onRow={(r) => ({ onClick: () => router.push(`/releases/${r.date}`), style: { cursor: "pointer" } })}
          columns={[
            {
              title: "배포일",
              key: "date",
              width: 190,
              render: (_: unknown, r: ReleaseSummary) => (
                <span>
                  <Link href={`/releases/${r.date}`}>
                    {r.date} {r.weekday}
                  </Link>
                  {!r.regular && (
                    <Tag style={{ marginLeft: 8 }} color="default">
                      정기배포일 아님
                    </Tag>
                  )}
                </span>
              ),
            },
            { title: "이슈", dataIndex: "issueCount", width: 64 },
            {
              title: "진행도",
              key: "p",
              render: (_: unknown, r: ReleaseSummary) => <ReleaseProgress counts={r.counts} />,
            },
            { title: "통과", key: "pass", width: 64, render: (_: unknown, r: ReleaseSummary) => n(r.counts.pass, RELEASE_TONE.pass) },
            { title: "실패", key: "fail", width: 64, render: (_: unknown, r: ReleaseSummary) => n(r.counts.fail, RELEASE_TONE.fail) },
            { title: "보류", key: "hold", width: 64, render: (_: unknown, r: ReleaseSummary) => n(r.counts.hold, RELEASE_TONE.hold) },
            { title: "스킵", key: "skip", width: 64, render: (_: unknown, r: ReleaseSummary) => n(r.counts.skip) },
            {
              title: "상태",
              dataIndex: "status",
              width: 100,
              render: (s: string) => <Tag color={STATUS_COLOR[s] ?? "default"}>{s}</Tag>,
            },
          ]}
        />
      )}
    </div>
  );
}
