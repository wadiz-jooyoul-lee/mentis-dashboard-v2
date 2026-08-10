"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Breadcrumb, Tag, Typography, Space, Progress, Badge, Popover, Tabs, Tooltip, Input, Select } from "antd";
import { LinkOutlined, SearchOutlined } from "@ant-design/icons";
import type { EpicSummary } from "@/lib/orchestration";
import type { JobWithKey } from "@/lib/jobs";
import { jiraUrl } from "@/lib/jira";
import DobbyIcon from "@/components/DobbyIcon";
import OrderLauncher from "@/components/OrderLauncher";
import DateFoldedTable from "@/components/DateFoldedTable";
import GroupAvatar from "@/components/GroupAvatar";
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

/** 작업상태 필터 값. "전체"는 필터 없음. */
type StatusFilter = "전체" | "작업중" | "해결됨" | "종료";

/** 개발/비개발(work-type) 스코프. "전체"는 스코프 없음. code=개발·nonsource=비개발. */
type KindFilter = "전체" | "code" | "nonsource";
const KIND_TAGS: Array<{ value: KindFilter; label: string }> = [
  { value: "전체", label: "전체" },
  { value: "code", label: "개발" },
  { value: "nonsource", label: "비개발" },
];

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

  // 개발/비개발 스코프는 URL ?type= 로 관리한다(공유·북마크 가능; 서버가 page.tsx에서 이 값으로 필터해 epics를 넘긴다).
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const kind: KindFilter =
    typeParam === "code" || typeParam === "nonsource" ? typeParam : "전체";
  // 태그 클릭 → URL type 갱신(전체=all). 서버가 새 값으로 목록을 다시 필터한다.
  const setKind = (value: KindFilter) => {
    router.push(`/orchestration?type=${value === "전체" ? "all" : value}`);
  };

  // 검색(에픽 키·제목) + 작업상태 필터. 서버가 이미 type으로 좁혀 넘긴 epics를 클라이언트에서 더 좁힌다.
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("전체");
  const q = query.trim().toLowerCase();
  const hasFilter = q !== "" || status !== "전체";
  const filtered = epics.filter((r) => {
    const matchQ =
      !q || r.epicKey.toLowerCase().includes(q) || (r.title ?? "").toLowerCase().includes(q);
    const matchS = status === "전체" || workStatus(r).text === status;
    return matchQ && matchS;
  });
  // 검색·상태 결과는 "최상위 테이블에만" 반영한다. 그게 없으면 작업중(미해결)만.
  const active = epics.filter((r) => workStatus(r).text === "작업중");
  const topItems = hasFilter ? filtered : active;

  const columns = [
    {
      title: "에픽",
      dataIndex: "epicKey",
      key: "epicKey",
      render: (key: string, r: EpicSummary) => (
        <Space size={8}>
          <GroupAvatar slug={key} avatar={r.avatar ?? undefined} size={28} showGroup />
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
                {/* 검색·상태 필터(좌) ↔ 개발/비개발 스코프 태그(우) — space-between */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <Space wrap>
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="에픽 키 · 제목 검색"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      style={{ width: 260 }}
                    />
                    <Select<StatusFilter>
                      value={status}
                      onChange={(v) => setStatus(v)}
                      style={{ width: 140 }}
                      options={[
                        { value: "전체", label: "전체 상태" },
                        { value: "작업중", label: "작업중" },
                        { value: "해결됨", label: "해결됨" },
                        { value: "종료", label: "종료" },
                      ]}
                    />
                    {hasFilter && <Text type="secondary">{filtered.length}건</Text>}
                  </Space>
                  <Space size={4}>
                    {KIND_TAGS.map(({ value, label }) => (
                      <Tag.CheckableTag
                        key={value}
                        checked={kind === value}
                        onChange={() => setKind(value)}
                      >
                        {label}
                      </Tag.CheckableTag>
                    ))}
                  </Space>
                </div>

                {/* 상단: 검색·필터 결과만 반영(필터 없으면 작업중). 하단 전체 목록은 건드리지 않는다. */}
                <DateFoldedTable<EpicSummary>
                  items={topItems}
                  dateOf={() => null}
                  groupLabel={hasFilter ? "검색 결과" : "작업중"}
                  columns={columns}
                  rowKey="epicKey"
                  onRowClick={(r) => router.push(`/orchestration/${r.epicKey}`)}
                  emptyText={hasFilter ? "조건에 맞는 오더가 없습니다" : "작업중인 오더가 없습니다"}
                />

                {/* 하단: 날짜별 전체 목록 — 검색·필터의 영향을 받지 않는다. */}
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
