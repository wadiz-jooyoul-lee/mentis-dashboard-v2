"use client";

import { Card, Space, Typography } from "antd";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./markdown.css";

const { Title, Text } = Typography;

/** 마크다운을 `## ` 블록 단위로 쪼갠다(첫 `#` 제목 프리앰블 제외). 각 블록 = 카드 1개. */
function parseCardBlocks(md: string): { title: string; body: string }[] {
  return md
    .split(/^##\s+/m)
    .slice(1)
    .map((p) => {
      const nl = p.indexOf("\n");
      return {
        title: (nl === -1 ? p : p.slice(0, nl)).trim(),
        body: nl === -1 ? "" : p.slice(nl + 1).trim(),
      };
    })
    .filter((b) => b.title);
}

/** `## ` 블록 마크다운을 카드 목록으로 렌더하는 공용 섹션(자율판단·사이드이펙트·확인가이드 공용). */
export default function MarkdownCards({
  title,
  subtitle,
  md,
}: {
  title: string;
  subtitle: string;
  md: string | null;
}) {
  if (!md || !md.trim()) return null;
  const blocks = parseCardBlocks(md);
  return (
    <div style={{ marginTop: 20 }}>
      <Title level={4}>{title}</Title>
      <Text type="secondary">{subtitle}</Text>
      {blocks.length > 0 ? (
        <Space direction="vertical" size={12} style={{ width: "100%", marginTop: 8 }}>
          {blocks.map((b, i) => (
            <Card key={i} size="small" title={b.title}>
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{b.body}</ReactMarkdown>
              </div>
            </Card>
          ))}
        </Space>
      ) : (
        <Card size="small" style={{ marginTop: 8 }}>
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
          </div>
        </Card>
      )}
    </div>
  );
}
