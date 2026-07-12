"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Breadcrumb,
  Space,
  Typography,
  Button,
  Descriptions,
  Table,
  Badge,
  Empty,
  Card,
} from "antd";
import { LinkOutlined, DownloadOutlined } from "@ant-design/icons";
import type { IssueStart } from "@/lib/parseStart";
import { startStateBadge } from "@/lib/parseStart";
import { jiraUrl } from "@/lib/jira";
import "./markdown.css";

const { Title, Text, Paragraph } = Typography;

/** 파일명에 못 쓰는 문자를 정리한다. */
function safeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "") // 금지 문자 제거
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export default function StartDetail({
  issueKey,
  start,
}: {
  issueKey: string;
  start: IssueStart | null;
}) {
  const badge = start ? startStateBadge(start.state) : null;

  function downloadStatusMd() {
    if (!start) return;
    const base = start.title
      ? `${issueKey} ${start.title}`
      : issueKey;
    const blob = new Blob([start.raw], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFileName(base)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { title: <Link href="/">홈</Link> },
          { title: <Link href="/issue-start">이슈 착수</Link> },
          { title: issueKey },
        ]}
        style={{ marginBottom: 12 }}
      />
      <Space align="center" style={{ marginBottom: 12 }} size={12} wrap>
        <Title level={2} style={{ margin: 0 }}>
          {issueKey}
        </Title>
        {badge && <Badge status={badge.status} text={badge.text} />}
        <Button
          type="link"
          icon={<LinkOutlined />}
          href={jiraUrl(issueKey)}
          target="_blank"
        >
          Jira에서 열기
        </Button>
        {start && (
          <Button icon={<DownloadOutlined />} onClick={downloadStatusMd}>
            status.md 다운로드
          </Button>
        )}
      </Space>

      {start ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Descriptions title="이슈" bordered size="small" column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="타입">
              {start.type ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="제목">
              {start.title ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="베이스">
              {start.base ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Jira 상태 전환">
              {start.jiraTransition ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="작성 출처">
              {start.source ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="시작">
              {start.startedAt ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="갱신">
              {start.updatedAt ?? "-"}
            </Descriptions.Item>
            {start.resolvedEvidence && (
              <Descriptions.Item label="해결 근거" span={2}>
                {start.resolvedEvidence}
              </Descriptions.Item>
            )}
          </Descriptions>

          <div>
            <Title level={4}>워크트리 / 브랜치</Title>
            <Table
              rowKey={(r) => `${r.repo}-${r.branch}`}
              pagination={false}
              size="small"
              dataSource={start.worktrees}
              columns={[
                { title: "repo", dataIndex: "repo", key: "repo" },
                {
                  title: "브랜치",
                  dataIndex: "branch",
                  key: "branch",
                  render: (v: string) => <Text code>{v}</Text>,
                },
                {
                  title: "경로",
                  dataIndex: "path",
                  key: "path",
                  render: (v: string) => <Text code>{v}</Text>,
                },
              ]}
              locale={{ emptyText: "워크트리 정보 없음" }}
            />
          </div>

          {(start.causeLocation || start.fixDesign) && (
            <Card title="분석 요약">
              <Paragraph style={{ marginBottom: 8 }}>
                <Text type="secondary">원인 위치</Text>
                <br />
                {start.causeLocation ? (
                  <Text code>{start.causeLocation}</Text>
                ) : (
                  <Text type="secondary">-</Text>
                )}
              </Paragraph>
              <Paragraph style={{ marginBottom: 0 }}>
                <Text type="secondary">수정 설계</Text>
                <br />
                {start.fixDesign ?? "-"}
              </Paragraph>
            </Card>
          )}

          {start.detailMarkdown ? (
            <Card title="분석 상세 (status.md)">
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {start.detailMarkdown}
                </ReactMarkdown>
              </div>
            </Card>
          ) : (
            !start.causeLocation &&
            !start.fixDesign && (
              <Empty description="분석 상세 내용이 없습니다 (분석완료 시 기록)" />
            )
          )}
        </Space>
      ) : (
        <Empty description="이 이슈의 issue-start 기록(status.md)이 없습니다" />
      )}
    </div>
  );
}
