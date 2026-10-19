"use client";
import { useCanAct } from "@/components/CanAct";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Input, Button, Space, Collapse, Badge, Typography, message, Empty, Segmented } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";
import JobConsole from "@/components/JobConsole";
import type { JobWithKey, JobState } from "@/lib/jobs";

const { TextArea } = Input;

/** 실행 범위. 빈 값은 통합(작업 브랜치 커밋·푸시)에서 멈추고, 환경을 고르면 그 환경 배포와 검증까지 간다. */
const ENV_OPTIONS = [
  { label: "통합까지", value: "" },
  { label: "dev 배포·검증", value: "dev" },
  { label: "rc1 배포·검증", value: "rc1" },
  { label: "rc4 배포·검증", value: "rc4" },
];

const { Text, Paragraph } = Typography;

const BADGE: Record<Exclude<JobState, "none">, { status: "processing" | "success" | "error" | "default"; text: string }> = {
  running: { status: "processing", text: "실행 중" },
  done: { status: "success", text: "완료" },
  failed: { status: "error", text: "실패" },
  stopped: { status: "default", text: "정지됨" },
};

export default function OrderLauncher({
  initialJobs,
  initialArchived,
}: {
  initialJobs: JobWithKey[];
  initialArchived: JobWithKey[];
}) {
  const canAct = useCanAct();
  const [text, setText] = useState("");
  const [env, setEnv] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<JobWithKey[]>(initialJobs);
  const [archived, setArchived] = useState<JobWithKey[]>(initialArchived);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/orders", { cache: "no-store" });
      const data = await r.json();
      setJobs(data.jobs ?? []);
      setArchived(data.archived ?? []);
    } catch {
      /* 무시 */
    }
  }, []);

  const anyRunning = jobs.some((j) => j.state === "running");
  useEffect(() => {
    if (anyRunning) {
      timer.current = setInterval(refresh, 2500);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
  }, [anyRunning, refresh]);

  const launch = async () => {
    const t = text.trim();
    if (!t) {
      message.error("이슈 키나 이슈 주소를 입력하세요");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target: t, env }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok) {
        message.success(`실행 시작 (${body?.key ?? "잡"})`);
        setText("");
        await refresh();
      } else {
        message.error(body?.error === "already_running" ? "이미 실행 중" : body?.error ?? "실패");
      }
    } finally {
      setBusy(false);
    }
  };

  const unarchive = async (k: string) => {
    await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: k, unarchive: true }),
    });
    await refresh();
  };

  const jobPanels = jobs.map((j) => ({
    key: j.key,
    label: (
      <Space>
        <Text strong>{j.key}</Text>
        <Badge {...BADGE[j.state]} />
      </Space>
    ),
    children: <JobConsole orderKey={j.key} initial={j} onChange={refresh} />,
  }));

  const archivedPanels = archived.map((j) => ({
    key: j.key,
    label: (
      <Space>
        <Text type="secondary">{j.key}</Text>
        <Badge {...BADGE[j.state]} />
      </Space>
    ),
    children: (
      <Space orientation="vertical" style={{ width: "100%" }}>
        <Button size="small" onClick={() => unarchive(j.key)}>
          복원
        </Button>
        <JobConsole orderKey={j.key} initial={j} onChange={refresh} />
      </Space>
    ),
  }));

  // 다른 기기 열람: 오더 실행은 이 맥의 Claude를 띄우는 것이라 화면 자체를 읽기 전용 안내로 대체
  if (!canAct) {
    return (
      <Card size="small" title={<Space><PlayCircleOutlined />오더 실행 (/do 자동)</Space>}>
        <Text type="secondary">
          읽기 전용 화면입니다 — 오더 실행·정지는 대시보드가 실행 중인 맥에서만 할 수 있습니다.
        </Text>
      </Card>
    );
  }
  return (
    <Card size="small" title={<Space><PlayCircleOutlined />오더 실행 (/do 자동)</Space>}>
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          <code>/do {"{입력}"} auto</code> 로 설계 세션을 띄워 설계를 스스로 확정하고, 이어서 같은 잡이 단계마다 새 세션으로
          구현·리뷰·통합(커밋·푸시)까지 진행합니다. 환경을 고르면 그 환경에 배포(머지·빌드·argocd sync)하고 검증까지 합니다.
          끝나거나 사람 판단이 필요하면 슬랙과 메일로 알립니다.
          <br />
          받는 것: <b>이슈 키</b>(FE1-1187) · <b>이슈 URL</b>. 인자: <code>base=</code>. 진행 로그는 아래에서 실시간으로 볼 수 있습니다.
          <br />
          <Text type="warning">주의: 헤드리스 claude를 bypassPermissions로 실행합니다(로컬 신뢰 환경 전용).</Text>
        </Paragraph>
        <Segmented options={ENV_OPTIONS} value={env} onChange={(v) => setEnv(String(v))} disabled={busy} />
        <TextArea
          placeholder={"예)\nFE1-1187\nhttps://wadiz.atlassian.net/browse/FE1-1187 base=rc4"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPressEnter={(e) => {
            // Ctrl/⌘+Enter로 실행(줄바꿈은 그냥 Enter)
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              launch();
            }
          }}
          autoSize={{ minRows: 2, maxRows: 8 }}
          disabled={busy}
        />
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={launch} loading={busy}>
          실행 (⌘/Ctrl+Enter)
        </Button>

        {jobs.length > 0 ? (
          <Collapse items={jobPanels} defaultActiveKey={anyRunning ? [jobs.find((j) => j.state === "running")!.key] : []} />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="실행 중이거나 최근 실행한 잡이 없습니다" />
        )}

        {archived.length > 0 && (
          <Collapse
            items={[
              {
                key: "archived",
                label: <Text type="secondary">보관된 잡 ({archived.length})</Text>,
                children: <Collapse items={archivedPanels} />,
              },
            ]}
          />
        )}
      </Space>
    </Card>
  );
}
