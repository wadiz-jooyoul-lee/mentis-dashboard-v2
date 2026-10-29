"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Typography, Button, Collapse, Badge, Table, Empty, Alert } from "antd";
import { useCanAct } from "@/components/CanAct";
import FeedView from "@/components/FeedView";
import MarkdownDoc from "@/components/MarkdownDoc";
import OrderHeader from "@/components/OrderHeader";
import { BadgeTag, ChangeRate, DataLines, headlineValue, pct, pText } from "@/components/DataCard";
import type { FeedItem, JobState } from "@/lib/jobs";
import type { DataOrder } from "@/lib/data";

const { Paragraph, Text, Title } = Typography;

type Job = { state: Exclude<JobState, "none">; feed: FeedItem[] };
type Cmd = "spec" | "run";

const jobIdOf = (cmd: Cmd, key: string) => (cmd === "spec" ? `data-spec-${key}` : `data-${key}`);
const RUNNING_TEXT: Record<Cmd, string> = {
  spec: "명세를 만드는 중입니다 (go-dobby dobby-data spec 실행)",
  run: "데이터를 모으는 중입니다 (go-dobby dobby-data run 실행)",
};

/**
 * 명세 만들기·데이터 수집 작업을 띄우고 지켜본다. RetroView 의 RetroRunner 와 같은 방식:
 * POST → 2초마다 진행 확인 → done 이면 1.2초 뒤 새로고침.
 */
function useDataJob(epicKey: string, initial: { cmd: Cmd; job: Job | null }[]) {
  // 처음 열 때는 돌고 있는 작업만 이어서 지켜본다. 끝난 작업까지 이으면 done→새로고침이 매번 반복된다.
  const running = initial.find((j) => j.job?.state === "running");
  const [cmd, setCmd] = useState<Cmd | null>(running?.cmd ?? null);
  const [state, setState] = useState<"idle" | "running" | "done" | "failed">(running ? "running" : "idle");
  const [feed, setFeed] = useState<FeedItem[]>(running?.job?.feed ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!cmd) return;
    try {
      const r = await fetch(`/api/orders?key=${encodeURIComponent(jobIdOf(cmd, epicKey))}`, { cache: "no-store" });
      const s = await r.json();
      if (s.state && s.state !== "none") {
        setFeed(s.feed ?? []);
        setState(s.state === "running" ? "running" : s.state === "done" ? "done" : "failed");
      }
    } catch {
      /* 무시 */
    }
  }, [cmd, epicKey]);

  useEffect(() => {
    if (state === "running") {
      timer.current = setInterval(poll, 2000);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
    if (state === "done") {
      const t = setTimeout(() => window.location.reload(), 1200);
      return () => clearTimeout(t);
    }
  }, [state, poll]);

  const start = async (next: Cmd) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: next, key: epicKey }),
      });
      if (r.ok) {
        setCmd(next);
        setFeed([]);
        setState("running");
      } else {
        const s = await r.json().catch(() => ({}));
        setError(s.error === "already_running" ? "이 오더에서 다른 데이터 작업이 돌고 있습니다." : `시작하지 못했습니다(${s.error ?? r.status}).`);
      }
    } finally {
      setBusy(false);
    }
  };

  return { cmd, state, feed, busy, error, start };
}

function JobRecord({ title, job }: { title: string; job: Job }) {
  const badge =
    job.state === "running"
      ? { status: "processing" as const, text: "실행 중" }
      : job.state === "done"
      ? { status: "success" as const, text: "완료" }
      : { status: "error" as const, text: job.state === "failed" ? "실패" : "중단" };
  return (
    <Collapse
      style={{ marginTop: 12 }}
      items={[
        {
          key: "log",
          label: (
            <span>
              {title} <Badge status={badge.status} text={badge.text} style={{ marginLeft: 8 }} />
            </span>
          ),
          children: <FeedView feed={job.feed} height={360} alwaysBottom />,
        },
      ]}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 24 }}>
      <Title level={5} style={{ marginBottom: 8 }}>
        {title}
      </Title>
      {children}
    </div>
  );
}

export default function DataTabView({
  epicKey,
  header,
  target,
  data,
  specJob,
  runJob,
}: {
  epicKey: string;
  header: {
    title: string | null;
    mode: string | null;
    worktreeRemoved: boolean;
    resolved: boolean;
    hasJira: boolean;
    hasDesign: boolean;
    hasQa: boolean;
    orderKind: "development" | "deliverable" | "summary" | null;
  };
  target: boolean;
  data: DataOrder;
  specJob: Job | null;
  runJob: Job | null;
}) {
  const canAct = useCanAct();
  const job = useDataJob(epicKey, [
    { cmd: "spec", job: specJob },
    { cmd: "run", job: runJob },
  ]);
  const { spec, summary, reportMd, runs, nextWindow } = data;
  const direction = spec?.metric?.direction ?? "up";

  const button = (cmd: Cmd, label: string, primary = false) =>
    canAct ? (
      <Button type={primary ? "primary" : "default"} loading={job.busy} onClick={() => job.start(cmd)}>
        {label}
      </Button>
    ) : null;
  const collect = (
    <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {button("run", "데이터 수집", true)}
      {nextWindow && (
        <Text type="secondary">
          다음 수집 기간: {nextWindow.from} ~ {nextWindow.to}
        </Text>
      )}
    </div>
  );
  const eventTable = (
    <Table
      size="small"
      pagination={false}
      rowKey="name"
      dataSource={spec?.events ?? []}
      columns={[
        { title: "이름", dataIndex: "name" },
        { title: "category", dataIndex: "category" },
        { title: "action", dataIndex: "action", render: (v) => v ?? "-" },
        { title: "label", dataIndex: "label", render: (v) => (v == null ? "-" : v === "" ? "(빈 값)" : v) },
        { title: "뜻", dataIndex: "meaning" },
      ]}
    />
  );
  const specInfo = spec && (
    <Paragraph type="secondary" style={{ marginBottom: 8 }}>
      측정 종류 {spec.kind} · 배포일 {spec.liveDate ?? "-"}({spec.liveDateSource ?? "-"}) · 집계 시작 {spec.startAt ?? "-"}
      {spec.metric ? ` · 핵심 지표 ${spec.metric.name}(${spec.metric.direction === "down" ? "낮을수록 좋음" : "높을수록 좋음"})` : ""}
      {spec.notes ? ` · ${spec.notes}` : ""}
    </Paragraph>
  );

  let body: React.ReactNode;
  if (job.state === "running" || job.state === "done") {
    // 1·2: 작업이 도는 동안에는 반쯤 쓰인 파일을 보여 주지 않는다
    body = (
      <div style={{ marginTop: 16 }}>
        <Paragraph type="secondary">
          {job.state === "done" ? "끝났습니다 — 새로고침합니다…" : RUNNING_TEXT[job.cmd ?? "run"]}
        </Paragraph>
        <FeedView feed={job.feed} height={360} />
      </div>
    );
  } else if (!target) {
    body = <Paragraph style={{ marginTop: 24 }}>해결된 Jira 오더만 분석합니다.</Paragraph>;
  } else if (!spec) {
    // 3: 명세 없음
    body = (
      <Empty
        style={{ marginTop: 24 }}
        description={
          <>
            <div>이 오더의 코드 변경과 수집 코드를 읽어, 성과를 무엇으로 볼지 정한 측정 명세를 만듭니다.</div>
            <div>데이터는 스노우플레이크 와디태그(화면이 남기는 사용자 행동 기록)만 봅니다.</div>
          </>
        }
      >
        {button("spec", "스펙 만들기", true)}
      </Empty>
    );
  } else if (spec.kind === "not_measurable") {
    // 4: 측정 불가
    body = (
      <div style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="와디태그로 측정할 수 없는 작업입니다" description={spec.reason ?? "사유가 적혀 있지 않습니다."} />
        <div style={{ marginTop: 12 }}>{button("spec", "스펙 다시 만들기")}</div>
      </div>
    );
  } else if (!summary) {
    // 5: 명세는 있고 수집 전
    body = (
      <Section title="측정 명세">
        {specInfo}
        {eventTable}
        {collect}
      </Section>
    );
  } else {
    // 6: 결과
    const h = summary.headline;
    const t = summary.tables;
    body = (
      <>
        <div style={{ marginTop: 16, display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <BadgeTag badge={summary.verdict} />
          <span style={{ fontSize: 30, fontWeight: 700 }}>{headlineValue(summary.kind, h)}</span>
          {h?.compare && (
            <>
              <ChangeRate rate={h.changeRate} direction={direction} />
              <Text type="secondary">
                {h.metric} · {h.target.label} {h.target.x ?? "-"}/{h.target.n.toLocaleString()} · 비교 {h.compare.label}{" "}
                {pct(h.compare.value)} ({h.compare.x ?? "-"}/{h.compare.n.toLocaleString()}) · p {pText(h.p)}
                {h.requiredN ? ` · 필요 표본 ${h.requiredN.toLocaleString()}` : ""}
              </Text>
            </>
          )}
          {!h?.compare && h && <Text type="secondary">{h.metric}</Text>}
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          집계 {summary.startAt} ~ {summary.coveredUntil} · 분석 {summary.runs}회
          {summary.health.srmP != null ? ` · 실험군 균형 p ${pText(summary.health.srmP)}` : ""}
          {summary.health.zeroDays.length > 0
            ? ` · 0건인 날 ${summary.health.zeroDays.map((z) => `${z.date} ${z.name}`).join(", ")}`
            : ""}
        </Text>
        {summary.oneLine && <Paragraph style={{ marginTop: 8 }}>{summary.oneLine}</Paragraph>}

        <Section title="일별 추이">
          <DataLines rows={summary.daily.rows} series={summary.daily.series} height={160} legend />
        </Section>

        <Section title="회차별 핵심 지표 변화">
          <Table
            size="small"
            pagination={false}
            rowKey="runId"
            dataSource={summary.history}
            columns={[
              { title: "회차", dataIndex: "runId" },
              { title: "집계 끝 시각", dataIndex: "coveredUntil" },
              { title: "변화율", dataIndex: "changeRate", render: (v) => <ChangeRate rate={v} direction={direction} /> },
              { title: "p", dataIndex: "p", render: (v) => pText(v) },
              { title: "배지", dataIndex: "verdict", render: (v) => <BadgeTag badge={v} /> },
            ]}
          />
        </Section>

        {summary.segments.length > 0 && (
          <Section title="기기 종류별">
            <Table
              size="small"
              pagination={false}
              rowKey="name"
              dataSource={summary.segments}
              columns={[
                { title: "기기 종류", dataIndex: "name" },
                { title: "대상", render: (_, s) => `${pct(s.target.value)} (${s.target.x ?? "-"}/${s.target.n.toLocaleString()})` },
                { title: "비교", render: (_, s) => `${pct(s.compare.value)} (${s.compare.x ?? "-"}/${s.compare.n.toLocaleString()})` },
                { title: "변화율", dataIndex: "changeRate", render: (v) => <ChangeRate rate={v} direction={direction} /> },
                { title: "p", dataIndex: "p", render: (v) => pText(v) },
                { title: "필요 표본", dataIndex: "requiredN", render: (v) => (v == null ? "-" : v.toLocaleString()) },
                { title: "배지", dataIndex: "badge", render: (v) => <BadgeTag badge={v} /> },
              ]}
            />
          </Section>
        )}

        {t.groups.length > 0 && (
          <Section title="실험군">
            <Table
              size="small"
              pagination={false}
              rowKey="grp"
              dataSource={t.groups}
              columns={[
                { title: "실험군", dataIndex: "grp" },
                { title: "기기", dataIndex: "devices", render: (v) => v.toLocaleString() },
                { title: "전환", dataIndex: "converted", render: (v) => v.toLocaleString() },
                { title: "전환율", dataIndex: "rate", render: (v) => pct(v) },
              ]}
            />
          </Section>
        )}
        {t.funnel.length > 0 && (
          <Section title="단계별 기기 수">
            <Table
              size="small"
              pagination={false}
              rowKey={(r) => `${r.grp}-${r.step}`}
              dataSource={t.funnel}
              columns={[
                { title: "실험군", dataIndex: "grp" },
                { title: "단계", dataIndex: "step" },
                { title: "이벤트", dataIndex: "name" },
                { title: "기기", dataIndex: "devices", render: (v) => v.toLocaleString() },
              ]}
            />
          </Section>
        )}
        {t.continuations.length > 0 && (
          <Section title="이어진 행동">
            <Table
              size="small"
              pagination={false}
              rowKey={(r) => `${r.grp}-${r.name}`}
              dataSource={t.continuations}
              columns={[
                { title: "실험군", dataIndex: "grp" },
                { title: "이름", dataIndex: "name" },
                { title: "시작한 기기", dataIndex: "fromDevices", render: (v) => v.toLocaleString() },
                { title: "이어간 기기", dataIndex: "toDevices", render: (v) => v.toLocaleString() },
                { title: "비율", dataIndex: "rate", render: (v) => pct(v) },
              ]}
            />
          </Section>
        )}

        {reportMd && (
          <Section title="해석">
            <MarkdownDoc md={reportMd} />
          </Section>
        )}

        <Collapse
          style={{ marginTop: 24 }}
          items={[
            {
              key: "spec",
              label: "측정 명세",
              children: (
                <>
                  {specInfo}
                  {eventTable}
                  <div style={{ marginTop: 12 }}>{button("spec", "스펙 다시 만들기")}</div>
                </>
              ),
            },
            {
              key: "runs",
              label: `회차 목록 (${runs.length})`,
              children: (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="runId"
                  dataSource={runs}
                  columns={[
                    { title: "회차", dataIndex: "runId" },
                    { title: "기간", render: (_, r) => `${r.from} ~ ${r.to}` },
                    { title: "일별 다시 셈", dataIndex: "reset", render: (v) => (v ? "예" : "아니오") },
                    { title: "상태", dataIndex: "done", render: (v) => (v ? "완료" : "끝나지 않음") },
                  ]}
                />
              ),
            },
          ]}
        />
        {collect}
      </>
    );
  }

  return (
    <div>
      <OrderHeader epicKey={epicKey} {...header} />
      {job.error && <Alert style={{ marginTop: 12 }} type="warning" showIcon message={job.error} />}
      {job.state === "failed" && (
        <Alert style={{ marginTop: 12 }} type="error" showIcon message="작업이 중단되었습니다. 아래 기록을 확인하세요." />
      )}
      {job.state === "failed" && <FeedView feed={job.feed} height={260} />}
      {body}
      {job.state === "idle" && specJob && specJob.state !== "running" && <JobRecord title="마지막 명세 만들기 기록" job={specJob} />}
      {job.state === "idle" && runJob && runJob.state !== "running" && <JobRecord title="마지막 데이터 수집 기록" job={runJob} />}
    </div>
  );
}
