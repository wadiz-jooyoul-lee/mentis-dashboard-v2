"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Breadcrumb,
  Card,
  Empty,
  Space,
  Typography,
  Button,
  Descriptions,
  Table,
  Tag,
  Row,
  Col,
  Statistic,
  Progress,
  Alert,
  Badge,
  Select,
  Skeleton,
  Segmented,
} from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import {
  LinkOutlined,
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  MinusCircleTwoTone,
  WarningTwoTone,
} from "@ant-design/icons";
import type { ReportRun } from "@/lib/issues";
import { jiraUrl } from "@/lib/jira";
import TestSummaryView from "@/components/TestSummaryView";
import type { TestSummary } from "@/lib/testSummary";
import { stateBadge, type IssueStatus } from "@/lib/parseStatus";
import {
  parseReport,
  overallStatus,
  type Scenario,
  type Verdict,
} from "@/lib/parseReport";
import "./markdown.css";

const { Title, Text, Paragraph } = Typography;

const VERDICT_META: Record<
  Verdict,
  { color: string; label: string; icon: React.ReactNode }
> = {
  pass: {
    color: "success",
    label: "PASS",
    icon: <CheckCircleTwoTone twoToneColor="#52c41a" />,
  },
  fail: {
    color: "error",
    label: "FAIL",
    icon: <CloseCircleTwoTone twoToneColor="#ff4d4f" />,
  },
  skip: {
    color: "default",
    label: "SKIP",
    icon: <MinusCircleTwoTone twoToneColor="#8c8c8c" />,
  },
  warn: {
    color: "warning",
    label: "주의",
    icon: <WarningTwoTone twoToneColor="#faad14" />,
  },
  unknown: { color: "default", label: "-", icon: null },
};

function VerdictTag({ verdict }: { verdict: Verdict }) {
  const m = VERDICT_META[verdict];
  return (
    <Tag color={m.color} icon={m.icon}>
      {m.label}
    </Tag>
  );
}

function ReportBody({ content }: { content: string }) {
  const { title, meta, scenarios, counts, restMarkdown } = parseReport(content);
  const overall = overallStatus(counts);
  const passRate =
    counts.total > 0 ? Math.round((counts.pass / counts.total) * 100) : 0;
  // 값이 하나도 없는 칸은 아예 그리지 않는다. 회차마다 적은 항목이 달라서(어떤 회차는
  // 페이지·기대를 안 적는다) 빈 칸을 그대로 그리면 표가 깨져 보인다.
  const used = (k: "num" | "page" | "check" | "expected" | "actual" | "evidence") =>
    scenarios.some((s) => (s[k] ?? "").trim() && s[k].trim() !== "-" && s[k].trim() !== "—");

  const columns = [
    ...(used("num") ? [{ title: "#", dataIndex: "num", key: "num", width: 56 }] : []),
    ...(used("page")
      ? [
          {
            title: "페이지 / URL",
            dataIndex: "page",
            key: "page",
            render: (v: string) =>
              v ? <Text code style={{ whiteSpace: "normal" }}>{v}</Text> : "-",
          },
        ]
      : []),
    ...(used("check") ? [{ title: "확인 항목", dataIndex: "check", key: "check" }] : []),
    ...(used("expected") ? [{ title: "기대", dataIndex: "expected", key: "expected" }] : []),
    ...(used("actual") ? [{ title: "실제", dataIndex: "actual", key: "actual" }] : []),
    {
      title: "판정",
      dataIndex: "verdict",
      key: "verdict",
      width: 96,
      render: (v: Verdict) => <VerdictTag verdict={v} />,
    },
    ...(used("evidence")
      ? [{ title: "근거", dataIndex: "evidence", key: "evidence" }]
      : []),
  ];

  const failed = scenarios.filter((s) => s.verdict === "fail");

  const skipped = scenarios.filter((s) => s.verdict === "skip" || s.verdict === "warn");
  // 접지 않고 걸러 본다. 데이터가 이미 와 있어 접어도 아낄 것이 없다.
  const [filter, setFilter] = useState<"all" | "pass" | "fail" | "skip">("all");
  const shown =
    filter === "all"
      ? scenarios
      : filter === "skip"
        ? skipped
        : scenarios.filter((s) => s.verdict === filter);
  // 판정 색 — 카드 테두리와 막대에 같은 색을 쓴다.
  const TONE = { pass: "#52c41a", fail: "#ff4d4f", skip: "#bfbfbf" } as const;
  const bar = [
    { n: counts.pass, c: TONE.pass },
    { n: counts.fail, c: TONE.fail },
    { n: counts.skip + counts.warn + counts.unknown, c: TONE.skip },
  ].filter((x) => x.n > 0);

  return (
    <Space orientation="vertical" size={24} style={{ width: "100%" }}>
      {/* ── 1층: 판정 한 장 ── */}
      <Card
        styles={{ body: { padding: "20px 24px" } }}
        style={{
          borderColor: counts.fail > 0 ? "#ffccc7" : "#f0f0f0",
          background: counts.fail > 0 ? "#fff8f7" : "#fafffa",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span
              style={{
                fontSize: 32,
                fontWeight: 700,
                lineHeight: 1.1,
                color: counts.fail > 0 ? TONE.fail : TONE.pass,
              }}
            >
              {overall.label}
            </span>
            <Text type="secondary">
              {counts.pass}건 통과
              {counts.fail > 0 && ` · ${counts.fail}건 실패`}
              {skipped.length > 0 && ` · ${skipped.length}건 보류`}
            </Text>
          </div>
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>
            {counts.pass}
            <Text type="secondary" style={{ fontSize: 18, fontWeight: 400 }}>
              {" / "}
              {counts.total}
            </Text>
          </span>
        </div>
        {/* 통과·실패·보류 비율을 한 줄로 */}
        <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginTop: 14 }}>
          {bar.map((x, i) => (
            <div key={i} style={{ flex: x.n, background: x.c }} />
          ))}
        </div>
      </Card>

      {/* ── 2층: 손볼 것 (실패·보류만) ── */}
      {failed.length > 0 && (
        <div>
          <Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>
            실패 {failed.length}건
          </Title>
          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            {failed.map((f, i) => (
              <Card key={i} size="small" style={{ borderLeft: `3px solid ${TONE.fail}` }}>
                <Text strong>
                  {f.num && `${f.num} `}
                  {f.check || f.page}
                </Text>
                {(f.expected || f.actual) && (
                  <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7 }}>
                    {f.expected && (
                      <div>
                        <Text type="secondary">기대 </Text>
                        {f.expected}
                      </div>
                    )}
                    {f.actual && (
                      <div>
                        <Text type="secondary">실제 </Text>
                        {f.actual}
                      </div>
                    )}
                  </div>
                )}
                {f.evidence && (
                  <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0, marginTop: 6 }}>
                    {f.evidence}
                  </Paragraph>
                )}
              </Card>
            ))}
          </Space>
        </div>
      )}

      {skipped.length > 0 && (
        <div>
          <Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>
            보류 {skipped.length}건 — 왜 못 했나
          </Title>
          <Space orientation="vertical" size={6} style={{ width: "100%" }}>
            {skipped.map((sc, i) => (
              <div key={i} style={{ display: "flex", gap: 12, fontSize: 13, lineHeight: 1.7 }}>
                <Text strong style={{ flexShrink: 0, minWidth: 0 }}>
                  {sc.num && `${sc.num} `}
                  {sc.check || sc.page}
                </Text>
                <Text type="secondary">{sc.actual || sc.evidence || sc.expected || "사유 없음"}</Text>
              </div>
            ))}
          </Space>
        </div>
      )}

      {/* ── 메타: 한 줄로 눌러 둔다 ── */}
      {meta.length > 0 && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {/* 값이 긴 항목(대상 설명 등)은 줄여 한 줄에 담는다. 전문은 아래 상세에 그대로 있다. */}
          {meta
            .map((m) => `${m.label} ${m.value.length > 46 ? m.value.slice(0, 46) + "…" : m.value}`)
            .join("  ·  ")}
        </Text>
      )}

      {/* ── 3층: 전체 표 (접지 않고 걸러 본다) ── */}
      {scenarios.length > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <Title level={4} style={{ margin: 0 }}>
              전체 {scenarios.length}건
            </Title>
            <Segmented
              size="small"
              value={filter}
              onChange={(v) => setFilter(v as typeof filter)}
              options={[
                { label: "전체", value: "all" },
                ...(counts.fail > 0 ? [{ label: `실패 ${counts.fail}`, value: "fail" as const }] : []),
                ...(skipped.length > 0
                  ? [{ label: `보류 ${skipped.length}`, value: "skip" as const }]
                  : []),
                { label: `통과 ${counts.pass}`, value: "pass" as const },
              ]}
            />
          </div>
          <Table<Scenario>
            rowKey={(r) => r.num || `${r.page}-${r.check}`}
            columns={columns}
            dataSource={shown}
            pagination={false}
            size="middle"
            scroll={{ x: "max-content" }}
            rowClassName={(r) =>
              r.verdict === "fail" ? "row-fail" : ""
            }
          />
        </div>
      )}

      {/* 나머지 상세 (변경요약·발견된 문제·근거 등) */}
      {restMarkdown && (
        <Card title="상세 내용">
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {restMarkdown}
            </ReactMarkdown>
          </div>
        </Card>
      )}

      {title && (
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          원본 제목: {title}
        </Paragraph>
      )}
    </Space>
  );
}

export default function IssueReport({
  issueKey,
  runs,
  summary = null,
  status,
  embedded,
}: {
  issueKey: string;
  runs: ReportRun[];
  /** 모든 회차를 모은 요약(서버 계산). 있으면 "전체"가 기본 화면이 된다. */
  summary?: TestSummary | null;
  status?: IssueStatus | null;
  /** 오케스트레이션 보드 안에 임베드될 때 상단 브레드크럼/제목을 생략 */
  embedded?: boolean;
}) {
  const badge = status ? stateBadge(status.state) : null;
  const inProgress =
    status?.state === "테스트중" || status?.state === "분석중";

  // 회차가 둘 이상이면 "전체"가 기본 — 재실행에서 무엇이 달라졌는지 먼저 보이게.
  const ALL = "__all__";
  const [selectedId, setSelectedId] = useState(
    summary && runs.length > 1 ? ALL : (runs[0]?.id ?? "")
  );
  const showAll = selectedId === ALL && !!summary;
  const selected = showAll ? null : (runs.find((r) => r.id === selectedId) ?? runs[0] ?? null);

  // 본문은 최신 회차만 실려 온다. 지난 회차를 고르면 그때 받아 와 여기 담아 둔다
  // (한 번 받은 것은 다시 받지 않는다).
  const [fetched, setFetched] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const body = selected ? selected.content || fetched[selected.id] || "" : "";

  useEffect(() => {
    if (!selected || selected.content || fetched[selected.id]) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/orders?run=${encodeURIComponent(issueKey)}&id=${encodeURIComponent(selected.id)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.ok) setFetched((m) => ({ ...m, [selected.id]: String(j.content ?? "") }));
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [selected, issueKey, fetched]);

  return (
    <div>
      {!embedded && (
        <>
          <Breadcrumb
            items={[
              { title: <Link href="/">홈</Link> },
              { title: <Link href="/orchestration">오케스트레이션</Link> },
              { title: issueKey },
            ]}
            style={{ marginBottom: 12 }}
          />
          <Space align="center" style={{ marginBottom: 8 }} size={12} wrap>
            <Title level={2} style={{ margin: 0 }}>
              {issueKey}
            </Title>
            {badge && (
              <Badge
                status={badge.status}
                text={
                  inProgress && status?.total != null
                    ? `${badge.text} (${status.done ?? 0}/${status.total})`
                    : badge.text
                }
              />
            )}
            <Button type="link" icon={<LinkOutlined />} href={jiraUrl(issueKey)} target="_blank">
              Jira에서 열기
            </Button>
          </Space>
        </>
      )}

      {showAll || selected ? (
        <>
          <Space
            align="center"
            size={12}
            wrap
            style={{ marginBottom: 12 }}
          >
            <Space size={6}>
              <HistoryOutlined />
              <Text type="secondary">실행 회차</Text>
            </Space>
            <Select
              value={selectedId}
              onChange={setSelectedId}
              style={{ minWidth: 260 }}
              options={[
                ...(summary ? [{ value: ALL, label: `전체 ${runs.length}회차 모아 보기` }] : []),
                ...runs.map((r, i) => ({
                  value: r.id,
                  label: `${r.label}${i === 0 ? " · 최신" : ""}`,
                })),
              ]}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              총 {runs.length}회{selected ? ` · 파일: ${selected.file}` : ""}
            </Text>
          </Space>
          {showAll && summary ? (
            <TestSummaryView summary={summary} />
          ) : body ? (
            <ReportBody key={selected!.id} content={body} />
          ) : loading ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : (
            <Empty description="이 회차의 결과를 불러오지 못했습니다" />
          )}
        </>
      ) : (
        <Empty description="이 이슈에 대한 테스트 결과 md가 없습니다" />
      )}
    </div>
  );
}
