"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumb, Space, Typography, Button, Badge, Alert } from "antd";
import {
  StopOutlined,
  RedoOutlined,
  InboxOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import FeedView from "@/components/FeedView";
import type { FeedItem } from "@/lib/jobs";
import { jiraUrl } from "@/lib/jira";

const { Title, Text } = Typography;

type Status = {
  state?: "none" | "running" | "done" | "failed";
  startedAt?: number;
  feed?: FeedItem[];
  sessionId?: string | null;
};

export default function JobConsole({ issueKey }: { issueKey: string }) {
  const router = useRouter();
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/issue-start?key=${encodeURIComponent(issueKey)}`,
        { cache: "no-store" }
      );
      setS(await r.json());
    } catch {
      /* 무시 */
    }
  }, [issueKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (s?.state !== "running") return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [s?.state, refresh]);

  async function stop() {
    await fetch(`/api/issue-start?key=${encodeURIComponent(issueKey)}`, {
      method: "DELETE",
    });
    setTimeout(refresh, 800);
  }
  async function resume() {
    setBusy(true);
    const r = await fetch("/api/issue-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: issueKey, resume: true }),
    });
    if (!r.ok) setError("재개에 실패했습니다.");
    setBusy(false);
    refresh();
  }
  async function archive() {
    const r = await fetch(
      `/api/issue-start?key=${encodeURIComponent(issueKey)}&action=archive`,
      { method: "DELETE" }
    );
    if (r.ok) router.push("/issue-start");
    else setError("보관에 실패했습니다.");
  }

  const state = s?.state ?? "none";
  const elapsed =
    s?.startedAt != null
      ? `${Math.max(0, Math.round((Date.now() - s.startedAt) / 1000))}초`
      : null;

  return (
    <div>
      <Breadcrumb
        items={[
          { title: <Link href="/">홈</Link> },
          { title: <Link href="/issue-start">이슈 착수</Link> },
          { title: `콘솔: ${issueKey}` },
        ]}
        style={{ marginBottom: 12 }}
      />
      <Space align="center" size={12} wrap style={{ marginBottom: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          {issueKey}
        </Title>
        {state === "running" && <Badge status="processing" text="실행 중" />}
        {state === "done" && <Badge status="success" text="완료" />}
        {state === "failed" && <Badge status="error" text="정지/실패" />}
        {state === "none" && <Badge status="default" text="기록 없음" />}
        {elapsed && <Text type="secondary">경과 {elapsed}</Text>}
        <Button
          type="link"
          icon={<LinkOutlined />}
          href={jiraUrl(issueKey)}
          target="_blank"
        >
          Jira
        </Button>
        {state === "running" && (
          <Button danger icon={<StopOutlined />} onClick={stop}>
            정지
          </Button>
        )}
        {state === "failed" && s?.sessionId && (
          <Button icon={<RedoOutlined />} loading={busy} onClick={resume}>
            이어서 진행
          </Button>
        )}
        {state !== "running" && state !== "none" && (
          <Button icon={<InboxOutlined />} onClick={archive}>
            보관
          </Button>
        )}
      </Space>
      {error && (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />
      )}
      <FeedView feed={s?.feed ?? []} height="calc(100vh - 240px)" />
    </div>
  );
}
