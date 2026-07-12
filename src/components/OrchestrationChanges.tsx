"use client";

import Link from "next/link";
import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Breadcrumb, Typography, Space, Card, Empty, Tag, List, Collapse } from "antd";
import { FileOutlined, BranchesOutlined, CodeOutlined } from "@ant-design/icons";
import type { EpicDetail, EditHunk } from "@/lib/orchestration";
import DobbyIcon from "@/components/DobbyIcon";
import { dobbyColor } from "@/lib/dobby";
import "./markdown.css";

const { Title, Text, Paragraph } = Typography;

/** before→after 코드를 -/+ 로 표시. Write(old="")는 + 만. */
function DiffView({ hunks }: { hunks: EditHunk[] }) {
  const lineStyle: React.CSSProperties = {
    whiteSpace: "pre",
    padding: "0 8px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    lineHeight: 1.5,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {hunks.map((h, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #f0f0f0",
            borderRadius: 6,
            overflowX: "auto",
          }}
        >
          {h.old
            ? h.old.split("\n").map((l, j) => (
                <div
                  key={`o${j}`}
                  style={{ ...lineStyle, background: "#fff1f0", color: "#a8071a" }}
                >
                  - {l}
                </div>
              ))
            : null}
          {h.new.split("\n").map((l, j) => (
            <div
              key={`n${j}`}
              style={{ ...lineStyle, background: "#f6ffed", color: "#135200" }}
            >
              + {l}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function OrchestrationChanges({
  epicKey,
  epic,
}: {
  epicKey: string;
  epic: EpicDetail | null;
}) {
  const roleBySlug = new Map(
    (epic?.contracts ?? []).map((c) => [
      c.slug,
      c.role.replace(/\s*계약\s*$/, "").trim(),
    ])
  );
  const works = epic?.agentWorks ?? [];

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const header = (
    <>
      <Breadcrumb
        items={[
          { title: <Link href="/">홈</Link> },
          { title: <Link href="/orchestration">오케스트레이션</Link> },
          { title: <Link href={`/orchestration/${epicKey}`}>{epicKey}</Link> },
          { title: "코드 변경" },
        ]}
        style={{ marginBottom: 12 }}
      />
      <Title level={2} style={{ marginTop: 0 }}>
        코드 변경 — {epicKey}
      </Title>
      <Paragraph type="secondary">
        각 에이전트의 대화 로그에서 뽑아낸 실제 작업 내역(수정 파일·커밋·요약)입니다. 상태 보드에서 카드를 누르면 해당 에이전트 섹션으로 바로 이동합니다.
      </Paragraph>
    </>
  );

  if (works.length === 0) {
    return (
      <div>
        {header}
        <Empty description="아직 작업 로그 기록이 없습니다 (agent-logs.json 미생성)" />
      </div>
    );
  }

  return (
    <div>
      {header}

      {/* 에이전트 바로가기 */}
      <Space size={[8, 8]} wrap style={{ marginBottom: 20 }}>
        {works.map((w) => {
          const name = roleBySlug.get(w.slug) ?? w.slug;
          return (
            <a key={w.slug} href={`#agent-${w.slug}`}>
              <Tag
                style={{
                  cursor: "pointer",
                  color: dobbyColor(name),
                  borderColor: dobbyColor(name),
                  background: "transparent",
                  fontWeight: 600,
                  padding: "2px 10px",
                }}
              >
                {name}
              </Tag>
            </a>
          );
        })}
      </Space>

      {/* 에이전트별 섹션 */}
      {works.map((w) => {
        const name = roleBySlug.get(w.slug) ?? w.slug;
        const color = dobbyColor(name);
        return (
          <div
            key={w.slug}
            id={`agent-${w.slug}`}
            style={{ scrollMarginTop: 80, marginBottom: 20 }}
          >
            <Card
              title={
                <Space size={8} align="center">
                  <DobbyIcon size={26} expression="tired" color={color} />
                  <Text strong style={{ fontSize: 16 }}>
                    {name}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {w.slug}
                  </Text>
                </Space>
              }
            >
              {!w.found ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={`로그 파일을 찾을 수 없음: ${w.logPath}`}
                />
              ) : (
                <Space direction="vertical" size={16} style={{ width: "100%" }}>
                  {/* 수정 파일 */}
                  <div>
                    <Text strong>
                      <FileOutlined /> 수정·생성 파일 ({w.files.length})
                    </Text>
                    {w.baseDir && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }} code>
                          {w.baseDir}/
                        </Text>
                      </div>
                    )}
                    <List
                      size="small"
                      dataSource={w.files}
                      locale={{ emptyText: "수정 파일 없음" }}
                      renderItem={(f) => (
                        <List.Item style={{ padding: "4px 0", border: "none" }}>
                          <Text code style={{ fontSize: 13 }}>
                            {f}
                          </Text>
                        </List.Item>
                      )}
                    />
                  </div>

                  {/* 커밋 */}
                  {w.commits.length > 0 && (
                    <div>
                      <Text strong>
                        <BranchesOutlined /> 커밋·푸시 ({w.commits.length})
                      </Text>
                      {w.commits.map((c, i) => (
                        <div key={i}>
                          <Text code style={{ fontSize: 12 }}>
                            {c}
                          </Text>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 코드 변경 (diff) — 파일별 접이식 */}
                  {w.diffs.length > 0 && (
                    <div>
                      <Text strong>
                        <CodeOutlined /> 코드 변경 diff ({w.diffs.length}개 파일)
                      </Text>
                      <Collapse
                        ghost
                        size="small"
                        items={w.diffs.map((fd) => ({
                          key: fd.file,
                          label: (
                            <Space size={6}>
                              <Text code style={{ fontSize: 12 }}>
                                {fd.file}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {fd.hunks.length}곳
                              </Text>
                            </Space>
                          ),
                          children: <DiffView hunks={fd.hunks} />,
                        }))}
                      />
                    </div>
                  )}

                  {/* 요약(에이전트 마지막 응답) */}
                  {w.summary && (
                    <div>
                      <Text strong>요약</Text>
                      <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {w.summary}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  <Text type="secondary" style={{ fontSize: 11 }}>
                    로그: {w.logPath}
                  </Text>
                </Space>
              )}
            </Card>
          </div>
        );
      })}
    </div>
  );
}
