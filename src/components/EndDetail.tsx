"use client";

import Link from "next/link";
import {
  Breadcrumb,
  Space,
  Typography,
  Button,
  Descriptions,
  Table,
  Tag,
  Empty,
  Card,
} from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { IssueEnd, EndAction } from "@/lib/parseEnd";
import { endActionBadge, finalStatusColor } from "@/lib/parseEnd";
import { jiraUrl } from "@/lib/jira";

const { Title, Text, Paragraph } = Typography;

export default function EndDetail({
  issueKey,
  end,
}: {
  issueKey: string;
  end: IssueEnd | null;
}) {
  return (
    <div>
      <Breadcrumb
        items={[
          { title: <Link href="/">홈</Link> },
          { title: <Link href="/issue-end">이슈 종료</Link> },
          { title: issueKey },
        ]}
        style={{ marginBottom: 12 }}
      />
      <Space align="center" style={{ marginBottom: 12 }} size={12} wrap>
        <Title level={2} style={{ margin: 0 }}>
          {issueKey}
        </Title>
        {end?.finalStatus && (
          <Tag color={finalStatusColor(end.finalStatus)}>{end.finalStatus}</Tag>
        )}
        <Button
          type="link"
          icon={<LinkOutlined />}
          href={jiraUrl(issueKey)}
          target="_blank"
        >
          Jira에서 열기
        </Button>
      </Space>

      {end ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Descriptions title="이슈" bordered size="small" column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="타입">{end.type ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="제목">{end.title ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="최종 상태">
              {end.finalStatus ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="처리 일시">
              {end.processedAt ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="워크트리 처리">
              <Tag color={endActionBadge(end.worktreeAction).color}>
                {endActionBadge(end.worktreeAction).text}
              </Tag>
            </Descriptions.Item>
          </Descriptions>

          <div>
            <Title level={4}>워크트리 / 브랜치</Title>
            <Table
              rowKey={(r) => `${r.repo}-${r.branch}`}
              pagination={false}
              size="small"
              dataSource={end.worktrees}
              columns={[
                { title: "repo", dataIndex: "repo", key: "repo" },
                {
                  title: "브랜치(보존)",
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
                {
                  title: "처리",
                  dataIndex: "action",
                  key: "action",
                  render: (a: EndAction) => (
                    <Tag color={endActionBadge(a).color}>
                      {endActionBadge(a).text}
                    </Tag>
                  ),
                },
              ]}
              locale={{ emptyText: "워크트리 정보 없음" }}
            />
          </div>

          <Card title="작업 요약 (issue-start에서 이어받음)">
            <Paragraph style={{ marginBottom: 8 }}>
              <Text type="secondary">원인 위치</Text>
              <br />
              {end.causeLocation ? (
                <Text code>{end.causeLocation}</Text>
              ) : (
                <Text type="secondary">-</Text>
              )}
            </Paragraph>
            <Paragraph style={{ marginBottom: 0 }}>
              <Text type="secondary">수정 설계</Text>
              <br />
              {end.fixDesign ?? "-"}
            </Paragraph>
          </Card>
        </Space>
      ) : (
        <Empty description="이 이슈의 종료 서머리(summary.md)가 없습니다" />
      )}
    </div>
  );
}
