"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumb, Tag, Typography, Space, Progress, Badge, Popover, Tabs, Tooltip } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { EpicSummary } from "@/lib/orchestration";
import type { JobWithKey } from "@/lib/jobs";
import { jiraUrl } from "@/lib/jira";
import DobbyIcon from "@/components/DobbyIcon";
import OrderLauncher from "@/components/OrderLauncher";
import DateFoldedTable from "@/components/DateFoldedTable";
import ResolveButton from "@/components/ResolveButton";
import { dobbyColor } from "@/lib/dobby";

const { Title, Text } = Typography;

// 칸반 상태별 색(에이전트 카운트 배지용). STATE_ORDER와 동일 순서.
const STATE_BADGES: Array<{ key: string; color: string }> = [
  { key: "대기", color: "#bfbfbf" },
  { key: "분석", color: "cyan" },
  { key: "구현", color: "blue" },
  { key: "리뷰", color: "gold" },
  { key: "완료", color: "green" },
];

/** 에이전트 상태 분포를 상태별 색상 카운트 배지(최대 5개)로. 0인 상태는 생략. */
function agentBadges(r: EpicSummary) {
  const shown = STATE_BADGES.filter(({ key }) => (r.counts[key] ?? 0) > 0);
  if (shown.length === 0) return <Text type="secondary">-</Text>;
  return (
    <Space size={8}>
      {shown.map(({ key, color }) => (
        <Popover key={key} content={`${key} ${r.counts[key]}명`}>
          <Badge count={r.counts[key]} color={color} overflowCount={999} />
        </Popover>
      ))}
    </Space>
  );
}

/** 실행 모드가 자율(B)인지. 미지정/A는 false. "B", "B (자율)", "자율" 등 표기 흔들림 방어. */
function isAutonomous(mode: string | null): boolean {
  if (!mode) return false;
  const m = mode.trim();
  return /^B\b/i.test(m) || m.includes("자율");
}

/** 작업 상태: dobby-end로 워크트리 삭제=종료, dobby-resolve로 해결=해결됨, 그 외=작업중. */
function workStatus(r: EpicSummary): { text: string; color: string } {
  if (r.worktreeRemoved || r.phase === "종료") return { text: "종료", color: "default" };
  if (r.phase === "해결") return { text: "해결됨", color: "success" };
  return { text: "작업중", color: "processing" };
}

export default function OrchestrationList({
  epics,
  sourceDir,
  initialJobs = [],
  initialArchived = [],
}: {
  epics: EpicSummary[];
  sourceDir: string;
  initialJobs?: JobWithKey[];
  initialArchived?: JobWithKey[];
}) {
  const router = useRouter();

  // 작업중(미해결)만 모아 상단에 노출한다. epics는 이미 lastActivity 내림차순(최근 활동순)이라 그 순서를 그대로 쓴다.
  const active = epics.filter((r) => workStatus(r).text === "작업중");

  const columns = [
    {
      title: "에픽",
      dataIndex: "epicKey",
      key: "epicKey",
      render: (key: string) => (
        <Space size={8}>
          <Text strong>{key}</Text>
          <a
            href={jiraUrl(key)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Jira에서 열기"
          >
            <LinkOutlined />
          </a>
        </Space>
      ),
    },
    {
      title: "제목",
      dataIndex: "title",
      key: "title",
      width: 300,
      // 고정 너비에서 최대 2줄까지만, 넘치면 말줄임. hover 시 전체 제목 툴팁.
      // 자율(B) 모드 오더는 제목을 붉게 + 호버 시 Popover로 모드를 알린다.
      render: (t: string | null, r: EpicSummary) => {
        const b = isAutonomous(r.mode);
        const body = t ? (
          <span
            title={b ? undefined : t}
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              wordBreak: "break-word",
              ...(b ? { color: "#cf1322" } : {}),
            }}
          >
            {t}
          </span>
        ) : (
          <Text type="secondary" style={b ? { color: "#cf1322" } : undefined}>
            -
          </Text>
        );
        return b ? (
          <Popover content="자율(B) 모드 · Workflow로 자동·병렬 실행">{body}</Popover>
        ) : (
          body
        );
      },
    },
    {
      title: "에이전트",
      key: "agents",
      render: (_: unknown, r: EpicSummary) => agentBadges(r),
    },
    {
      title: "작업 상태",
      key: "workStatus",
      render: (_: unknown, r: EpicSummary) => {
        const s = workStatus(r);
        if (s.text === "종료") {
          // 종료(워크트리 정리 완료) = 도비 해방. 얼굴 + 호버 툴팁.
          return (
            <Tag color={s.color}>
              <Tooltip title="도비는 자유에요">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <DobbyIcon size={14} expression="happy" color={dobbyColor("종료")} />
                  종료
                </span>
              </Tooltip>
            </Tag>
          );
        }
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: "진행률",
      key: "progress",
      render: (_: unknown, r: EpicSummary) => {
        const total = r.counts.total ?? 0;
        const done = r.counts.완료 ?? 0;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <Space direction="vertical" size={2} style={{ minWidth: 160 }}>
            <Progress
              percent={pct}
              size="small"
              status={done === total && total > 0 ? "success" : "active"}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              완료 {done} / 전체 {total}
            </Text>
          </Space>
        );
      },
    },
    {
      title: "해결",
      key: "resolve",
      render: (_: unknown, r: EpicSummary) => (
        <span onClick={(e) => e.stopPropagation()}>
          <ResolveButton epicKey={r.epicKey} resolved={workStatus(r).text !== "작업중"} />
        </span>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Breadcrumb
          items={[{ title: <Link href="/">홈</Link> }, { title: "오케스트레이션" }]}
        />
        <Link
          href="/agents"
          style={{
            fontSize: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            whiteSpace: "nowrap",
          }}
        >
          <DobbyIcon size={18} expression="happy" color={dobbyColor("소개")} />
          에이전트 소개
        </Link>
      </div>
      <Title level={2} style={{ marginTop: 0 }}>
        오케스트레이션 보드
      </Title>

      <Tabs
        defaultActiveKey="list"
        tabBarStyle={{ paddingLeft: 12 }}
        items={[
          {
            key: "list",
            label: "오더 목록",
            children: (
              <>
                {/* 상단: 작업중(미해결)만 모아서 — 아래 날짜별과 동일한 폴드(단일 그룹, 기본 펼침) */}
                <DateFoldedTable<EpicSummary>
                  items={active}
                  dateOf={() => null}
                  groupLabel="작업중"
                  columns={columns}
                  rowKey="epicKey"
                  onRowClick={(r) => router.push(`/orchestration/${r.epicKey}`)}
                  emptyText="작업중인 오더가 없습니다"
                />

                {/* 하단: 현재의 날짜별 목록(전체 — 작업중 포함) */}
                <div style={{ marginTop: 24 }}>
                  <Text type="secondary">읽는 경로: {sourceDir}</Text>
                  <div style={{ marginTop: 16 }}>
                    <DateFoldedTable<EpicSummary>
                      items={epics}
                      dateOf={(r) => r.lastActivity}
                      columns={columns}
                      rowKey="epicKey"
                      onRowClick={(r) => router.push(`/orchestration/${r.epicKey}`)}
                      rowClassName={(r) => (workStatus(r).text !== "작업중" ? "row-resolved" : "")}
                      emptyText="진행 중인 오더가 없습니다"
                    />
                  </div>
                </div>
              </>
            ),
          },
          {
            key: "launcher",
            label: "오더 실행",
            children: (
              <OrderLauncher initialJobs={initialJobs} initialArchived={initialArchived} />
            ),
          },
        ]}
      />
    </div>
  );
}
