"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Breadcrumb,
  Tag,
  Typography,
  Space,
  Badge,
  Input,
  Button,
  Card,
  Alert,
  Collapse,
} from "antd";
import {
  LinkOutlined,
  PlayCircleOutlined,
  StopOutlined,
  RedoOutlined,
  InboxOutlined,
  FullscreenOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import type { IssueStart } from "@/lib/parseStart";
import { startStateBadge } from "@/lib/parseStart";
import type { JobWithKey } from "@/lib/jobs";
import { jiraUrl } from "@/lib/jira";
import DateFoldedTable from "@/components/DateFoldedTable";
import FeedView from "@/components/FeedView";

const { Title, Text } = Typography;

const KEY_RE = /^[A-Z][A-Z0-9]*-\d+$/;

function typeTag(type: string | null) {
  if (!type) return null;
  const color = type.includes("버그") ? "red" : "blue";
  return <Tag color={color}>{type}</Tag>;
}

function stateBadge(job: JobWithKey) {
  if (job.state === "running") return <Badge status="processing" text="실행 중" />;
  if (job.state === "done") return <Badge status="success" text="완료" />;
  return <Badge status="error" text="정지/실패" />;
}

function elapsedOf(job: JobWithKey): string | null {
  return job.startedAt != null
    ? `${Math.max(0, Math.round((Date.now() - job.startedAt) / 1000))}초`
    : null;
}

function IssueStartPanel({ initialJobs }: { initialJobs: JobWithKey[] }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobWithKey[]>(initialJobs);
  const [archived, setArchived] = useState<JobWithKey[]>([]);

  const norm = key.trim().toUpperCase();
  const valid = KEY_RE.test(norm);
  const anyRunning = jobs.some((j) => j.state === "running");
  const isRunning = (k: string) =>
    jobs.some((j) => j.key === k && j.state === "running");

  async function refresh() {
    try {
      const r = await fetch("/api/issue-start", { cache: "no-store" });
      const d = await r.json();
      if (Array.isArray(d.jobs)) setJobs(d.jobs);
      if (Array.isArray(d.archived)) setArchived(d.archived);
    } catch {
      /* 무시 */
    }
  }

  // 실행 중인 잡이 있으면 주기적으로 갱신
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(async () => {
      await refresh();
    }, 2500);
    return () => clearInterval(id);
  }, [anyRunning]);

  async function launch() {
    if (isRunning(norm)) return;
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/issue-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: norm }),
      });
      if (r.status === 202) {
        setKey("");
        await refresh();
        router.refresh();
      } else {
        const e = await r.json().catch(() => ({}));
        setError(
          e.error === "already_running"
            ? "이미 실행 중입니다."
            : e.error === "invalid_key"
            ? "이슈 키 형식이 올바르지 않습니다."
            : "실행에 실패했습니다."
        );
      }
    } catch {
      setError("요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function stop(k: string) {
    try {
      await fetch(`/api/issue-start?key=${encodeURIComponent(k)}`, {
        method: "DELETE",
      });
      setTimeout(refresh, 800);
    } catch {
      setError("정지 요청에 실패했습니다.");
    }
  }

  async function archive(k: string) {
    setError(null);
    try {
      const r = await fetch(
        `/api/issue-start?key=${encodeURIComponent(k)}&action=archive`,
        { method: "DELETE" }
      );
      if (r.ok) {
        await refresh();
      } else {
        const e = await r.json().catch(() => ({}));
        setError(
          e.error === "running"
            ? "실행 중에는 보관할 수 없습니다. 먼저 정지하세요."
            : "보관에 실패했습니다."
        );
      }
    } catch {
      setError("보관 요청에 실패했습니다.");
    }
  }

  async function unarchive(k: string) {
    setError(null);
    try {
      const r = await fetch("/api/issue-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: k, unarchive: true }),
      });
      if (r.ok) await refresh();
      else setError("복원에 실패했습니다.");
    } catch {
      setError("복원 요청에 실패했습니다.");
    }
  }

  async function resume(k: string) {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/issue-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: k, resume: true }),
      });
      if (r.status === 202) {
        await refresh();
      } else {
        const e = await r.json().catch(() => ({}));
        setError(
          e.error === "no_session"
            ? "재개할 세션 정보가 없습니다."
            : "재개에 실패했습니다."
        );
      }
    } catch {
      setError("재개 요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card size="small" style={{ marginBottom: 16 }} title="이슈 착수 실행">
      <Space.Compact style={{ width: "100%", maxWidth: 460 }}>
        <Input
          placeholder="이슈 번호 (예: FE-1234, QA-22370)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onPressEnter={() => valid && !busy && !isRunning(norm) && launch()}
          status={key && !valid ? "error" : undefined}
        />
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          disabled={!valid || busy || isRunning(norm)}
          loading={busy}
          onClick={launch}
        >
          착수 실행
        </Button>
      </Space.Compact>
      {key && !valid && (
        <div>
          <Text type="danger" style={{ fontSize: 12 }}>
            형식: 프로젝트키-숫자 (예: FE-1234)
          </Text>
        </div>
      )}
      {error && (
        <Alert type="error" showIcon message={error} style={{ marginTop: 12 }} />
      )}

      {jobs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            실행 작업 (행을 펼치면 콘솔이 보입니다)
          </Text>
          <Collapse
            style={{ marginTop: 8 }}
            items={jobs.map((j) => ({
              key: j.key,
              label: (
                <Space size={10} wrap>
                  <Text strong>{j.key}</Text>
                  {stateBadge(j)}
                  {elapsedOf(j) && (
                    <Text type="secondary">경과 {elapsedOf(j)}</Text>
                  )}
                </Space>
              ),
              extra: (
                <Space size={6} onClick={(e) => e.stopPropagation()}>
                  <Link href={`/issue-start/console/${j.key}`}>
                    <Button size="small" icon={<FullscreenOutlined />}>
                      전체화면
                    </Button>
                  </Link>
                  {j.state === "running" && (
                    <Button
                      danger
                      size="small"
                      icon={<StopOutlined />}
                      onClick={() => stop(j.key)}
                    >
                      정지
                    </Button>
                  )}
                  {j.state === "failed" && j.sessionId && (
                    <Button
                      size="small"
                      icon={<RedoOutlined />}
                      loading={busy}
                      onClick={() => resume(j.key)}
                    >
                      이어서
                    </Button>
                  )}
                  {j.state !== "running" && (
                    <Button
                      size="small"
                      icon={<InboxOutlined />}
                      onClick={() => archive(j.key)}
                    >
                      보관
                    </Button>
                  )}
                </Space>
              ),
              children: <FeedView feed={j.feed ?? []} height={260} />,
            }))}
          />
        </div>
      )}

      {archived.length > 0 && (
        <Collapse
          style={{ marginTop: 16 }}
          items={[
            {
              key: "archived",
              label: (
                <Text type="secondary">보관된 작업 ({archived.length})</Text>
              ),
              children: (
                <Collapse
                  items={archived.map((j) => ({
                    key: j.key,
                    label: (
                      <Space size={10} wrap>
                        <Text>{j.key}</Text>
                        {stateBadge(j)}
                      </Space>
                    ),
                    extra: (
                      <Space size={6} onClick={(e) => e.stopPropagation()}>
                        <Link href={`/issue-start/console/${j.key}`}>
                          <Button size="small" icon={<FullscreenOutlined />}>
                            전체화면
                          </Button>
                        </Link>
                        <Button
                          size="small"
                          icon={<UndoOutlined />}
                          onClick={() => unarchive(j.key)}
                        >
                          복원
                        </Button>
                      </Space>
                    ),
                    children: <FeedView feed={j.feed ?? []} height={220} />,
                  }))}
                />
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}

export default function StartList({
  starts,
  sourceDir,
  initialJobs,
}: {
  starts: IssueStart[];
  sourceDir: string;
  initialJobs: JobWithKey[];
}) {
  const router = useRouter();

  const columns = [
    {
      title: "이슈",
      dataIndex: "key",
      key: "key",
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
      title: "타입",
      dataIndex: "type",
      key: "type",
      render: (t: string | null) => typeTag(t) ?? "-",
    },
    { title: "제목", dataIndex: "title", key: "title", ellipsis: true },
    {
      title: "상태",
      key: "state",
      render: (_: unknown, r: IssueStart) => {
        const b = startStateBadge(r.state);
        return <Badge status={b.status} text={b.text} />;
      },
    },
    {
      title: "워크트리",
      key: "worktrees",
      render: (_: unknown, r: IssueStart) => (
        <Tag>{r.worktrees.length}개 repo</Tag>
      ),
    },
    {
      title: "갱신",
      key: "updatedAt",
      render: (_: unknown, r: IssueStart) => r.updatedAt ?? r.startedAt ?? "-",
    },
  ];

  return (
    <div>
      <Breadcrumb
        items={[{ title: <Link href="/">홈</Link> }, { title: "이슈 착수" }]}
        style={{ marginBottom: 12 }}
      />
      <Title level={2} style={{ marginTop: 0 }}>
        이슈 착수
      </Title>

      <IssueStartPanel initialJobs={initialJobs} />

      <Text type="secondary">읽는 경로: {sourceDir}</Text>
      <div style={{ marginTop: 16 }}>
        <DateFoldedTable<IssueStart>
          items={starts}
          dateOf={(r) => r.updatedAt ?? r.startedAt}
          columns={columns}
          rowKey="key"
          onRowClick={(r) => router.push(`/issue-start/${r.key}`)}
          emptyText="issue-start 기록이 없습니다"
        />
      </div>
    </div>
  );
}
