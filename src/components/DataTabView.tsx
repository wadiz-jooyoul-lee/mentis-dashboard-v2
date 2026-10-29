"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Typography, Button, Collapse, Badge, Table, Empty, Alert, Space, message } from "antd";
import { CopyOutlined, ExportOutlined } from "@ant-design/icons";
import { useCanAct } from "@/components/CanAct";
import FeedView from "@/components/FeedView";
import DataReport from "@/components/DataReport";
import OrderHeader from "@/components/OrderHeader";
import { BadgeTag, ChangeRate, DataLines, deviceName, headlineValue, pct, pText } from "@/components/DataCard";
import type { FeedItem, JobState } from "@/lib/jobs";
import type { DataOrder } from "@/lib/data";
import type { ArtifactShare } from "@/lib/orchestration";
import { copyText } from "@/lib/clipboard";

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

/** 해석을 claude.ai 공개 아티팩트로 — 게시는 대화형 Claude Code 에서만 되므로 명령을 복사하게 한다. */
function ShareBar({ epicKey, share }: { epicKey: string; share: ArtifactShare | null }) {
  const cmd = `/dobby-share ${epicKey} data`;
  const copy = async () => {
    if (await copyText(cmd)) message.success("명령을 복사했습니다. 대화형 Claude Code 에 붙여넣으세요.");
    else message.error("복사하지 못했습니다");
  };
  return (
    <Alert
      style={{ marginTop: 12 }}
      type={share ? "success" : "info"}
      showIcon
      title={share ? `공개 아티팩트로 게시했습니다${share.updatedAt ? ` (갱신 ${share.updatedAt})` : ""}.` : "이 해석을 공개 아티팩트로 게시할 수 있습니다."}
      description={
        <Space orientation="vertical" size={8}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            대화형 Claude Code 에서 <Text code>{cmd}</Text> 를 실행하면 claude.ai 에 게시되고 아티팩트 탭에 링크가 붙습니다.
            {share ? " 해석이 바뀐 뒤 다시 실행하면 같은 링크가 갱신됩니다." : ""}
          </Text>
          <Space wrap>
            {share && (
              <Button size="small" type="primary" icon={<ExportOutlined />} onClick={() => window.open(share.url, "_blank", "noopener,noreferrer")}>
                아티팩트 열기
              </Button>
            )}
            <Button size="small" icon={<CopyOutlined />} onClick={copy}>
              {share ? "갱신 명령 복사" : "게시 명령 복사"}
            </Button>
            <Link href={`/orchestration/${encodeURIComponent(epicKey)}/artifact`}>아티팩트 탭으로 →</Link>
          </Space>
        </Space>
      }
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
  share,
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
  /** 이 해석을 게시한 공개 아티팩트(artifact-share.md 의 data 행) */
  share: ArtifactShare | null;
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
        {reportMd ? (
          <div style={{ marginTop: 16 }}>
            <DataReport md={reportMd} />
            <ShareBar epicKey={epicKey} share={share} />
          </div>
        ) : (
          summary.oneLine && <Paragraph style={{ marginTop: 16 }}>{summary.oneLine}</Paragraph>
        )}

        <Title level={4} style={{ marginTop: 32, marginBottom: 0 }}>
          자세한 데이터
        </Title>
        <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <BadgeTag badge={summary.verdict} />
          <span style={{ fontSize: 26, fontWeight: 700 }}>{headlineValue(summary.kind, h)}</span>
          {h?.compare && (
            <>
              <ChangeRate rate={h.changeRate} direction={direction} />
              <Text type="secondary">
                {h.metric} · {h.target.label} {h.target.x ?? "-"}/{h.target.n.toLocaleString()}대 · {h.compare.label}{" "}
                {pct(h.compare.value)} ({h.compare.x ?? "-"}/{h.compare.n.toLocaleString()}대) · 우연일 가능성 {pText(h.p)}
                {h.requiredN ? ` · 판단에 필요한 기기 수 ${h.requiredN.toLocaleString()}대` : ""}
              </Text>
            </>
          )}
          {!h?.compare && h && <Text type="secondary">{h.metric}</Text>}
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          집계 {summary.startAt} ~ {summary.coveredUntil} · 분석 {summary.runs}회
          {summary.health.srmP != null ? ` · 두 그룹이 고르게 나뉘었는지 확인: 우연일 가능성 ${pText(summary.health.srmP)}` : ""}
        </Text>
        {summary.health.zeroDays.length > 0 && (
          <Collapse
            size="small"
            ghost
            items={[
              {
                key: "zero",
                label: `기록이 0건인 날 ${new Set(summary.health.zeroDays.map((z) => z.date)).size}일 (자세히)`,
                children: (
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="name"
                    dataSource={[...new Set(summary.health.zeroDays.map((z) => z.name))].map((name) => ({
                      name,
                      dates: summary.health.zeroDays.filter((z) => z.name === name).map((z) => z.date.slice(5)).join(", "),
                    }))}
                    columns={[
                      { title: "기록", dataIndex: "name" },
                      { title: "0건인 날", dataIndex: "dates" },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}

        <Section title="날짜별 기록 건수">
          <DataLines rows={summary.daily.rows} series={summary.daily.series} height={160} legend />
        </Section>

        <Section title="분석할 때마다 핵심 숫자가 어떻게 바뀌었나">
          <Table
            size="small"
            pagination={false}
            rowKey="runId"
            dataSource={summary.history}
            columns={[
              { title: "분석 회차", dataIndex: "runId" },
              { title: "집계 끝 시각", dataIndex: "coveredUntil" },
              { title: "차이", dataIndex: "changeRate", render: (v) => <ChangeRate rate={v} direction={direction} /> },
              { title: "우연일 가능성", dataIndex: "p", render: (v) => pText(v) },
              { title: "판정", dataIndex: "verdict", render: (v) => <BadgeTag badge={v} /> },
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
                { title: "기기 종류", dataIndex: "name", render: (v) => deviceName(v) },
                { title: summary.segments[0].target.label, render: (_, s) => `${pct(s.target.value)} (${s.target.x ?? "-"}/${s.target.n.toLocaleString()}대)` },
                { title: summary.segments[0].compare.label, render: (_, s) => `${pct(s.compare.value)} (${s.compare.x ?? "-"}/${s.compare.n.toLocaleString()}대)` },
                { title: "차이", dataIndex: "changeRate", render: (v) => <ChangeRate rate={v} direction={direction} /> },
                { title: "우연일 가능성", dataIndex: "p", render: (v) => pText(v) },
                { title: "판단에 필요한 기기 수", dataIndex: "requiredN", render: (v) => (v == null ? "-" : `${v.toLocaleString()}대`) },
                { title: "판정", dataIndex: "badge", render: (v) => <BadgeTag badge={v} /> },
              ]}
            />
          </Section>
        )}

        {t.groups.length > 0 && (
          <Section title="A안·B안 그룹">
            <Table
              size="small"
              pagination={false}
              rowKey="grp"
              dataSource={t.groups}
              columns={[
                { title: "그룹", dataIndex: "grp" },
                { title: "기기", dataIndex: "devices", render: (v) => v.toLocaleString() },
                { title: "목표 행동까지 간 기기", dataIndex: "converted", render: (v) => v.toLocaleString() },
                { title: "비율", dataIndex: "rate", render: (v) => pct(v) },
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
                { title: "그룹", dataIndex: "grp" },
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
                { title: "그룹", dataIndex: "grp" },
                { title: "이름", dataIndex: "name" },
                { title: "시작한 기기", dataIndex: "fromDevices", render: (v) => v.toLocaleString() },
                { title: "이어간 기기", dataIndex: "toDevices", render: (v) => v.toLocaleString() },
                { title: "비율", dataIndex: "rate", render: (v) => pct(v) },
              ]}
            />
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
