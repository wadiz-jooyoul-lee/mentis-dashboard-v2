"use client";

import { Typography, Space, Card, Empty, Tag, Anchor } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import OrderHeader from "@/components/OrderHeader";
import MarkdownDoc from "@/components/MarkdownDoc";
import type { OrderDoc } from "@/lib/orchestration";
import "./markdown.css";

const { Title, Text } = Typography;

/**
 * 전용 탭이 없는 루트 문서를 모아 보여 준다.
 *
 * 에이전트가 조사 결과를 임의 이름으로 남기면(`sweep-findings.md`·`analysis-{영역}.md` 등)
 * 대시보드가 그 이름을 몰라 **어느 화면에도 안 나왔다.** 이 화면이 그것을 받는다.
 * 보드는 목록만 보여 주고, 본문은 여기서만 읽는다.
 */
export default function OtherDocsView({
  epicKey,
  title = null,
  docs,
  mode = null,
  worktreeRemoved = false,
  resolved = false,
  hasJira = false,
  hasDesign = false,
  orderKind = null,
}: {
  epicKey: string;
  title?: string | null;
  docs: OrderDoc[];
  mode?: string | null;
  worktreeRemoved?: boolean;
  resolved?: boolean;
  hasJira?: boolean;
  hasDesign?: boolean;
  orderKind?: "development" | "deliverable" | "summary" | null;
}) {
  const header = (
    <OrderHeader
      epicKey={epicKey}
      title={title}
      mode={mode}
      worktreeRemoved={worktreeRemoved}
      resolved={resolved}
      hasJira={hasJira}
      hasDesign={hasDesign}
      orderKind={orderKind}
    />
  );

  if (docs.length === 0) {
    return (
      <div>
        {header}
        <Empty
          description={
            <span>
              전용 탭이 없는 문서가 없습니다.
              <br />
              <Text type="secondary" style={{ fontSize: 13 }}>
                에이전트가 임의 이름으로 남긴 루트 마크다운 문서가 있으면 여기 모입니다.
              </Text>
            </span>
          }
        />
      </div>
    );
  }

  return (
    <div>
      {header}
      <Title level={4}>기타 문서 ({docs.length})</Title>
      <Text type="secondary" style={{ fontSize: 13 }}>
        전용 탭이 없는 문서입니다. 에이전트가 조사 결과를 자기 이름으로 남긴 것이 대부분입니다.
      </Text>

      {/* 문서가 여러 개면 목차로 건너뛴다(파일 하나가 수십 KB일 수 있다). */}
      {docs.length > 1 && (
        <Anchor
          style={{ marginTop: 12 }}
          direction="horizontal"
          items={docs.map((d) => ({
            key: d.name,
            href: `#${encodeURIComponent(d.name)}`,
            title: d.name,
          }))}
        />
      )}

      <Space orientation="vertical" size={16} style={{ width: "100%", marginTop: 16 }}>
        {docs.map((d) => (
          <Card
            key={d.name}
            id={encodeURIComponent(d.name)}
            size="small"
            title={
              <Space size={8}>
                <FileTextOutlined />
                <Text code>{d.name}</Text>
                <Tag style={{ margin: 0 }}>{Math.max(1, Math.round(d.bytes / 1024))} KB</Tag>
              </Space>
            }
            extra={
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(d.content)}`}
                download={d.name}
              >
                다운로드
              </a>
            }
          >
            <MarkdownDoc md={d.content} />
          </Card>
        ))}
      </Space>
    </div>
  );
}
