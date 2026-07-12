"use client";

import Link from "next/link";
import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Breadcrumb, Typography, Space, Card, Empty, Tag, List, Collapse, Descriptions } from "antd";
import { FileOutlined, BranchesOutlined, CodeOutlined } from "@ant-design/icons";
import type { EpicDetail, EditHunk, AgentWork } from "@/lib/orchestration";
import type { AgentRow } from "@/lib/parseOrchestration";
import { agentStateBadge } from "@/lib/parseOrchestration";
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
        <div key={i} style={{ border: "1px solid #f0f0f0", borderRadius: 6, overflowX: "auto" }}>
          {h.old
            ? h.old.split("\n").map((l, j) => (
                <div key={`o${j}`} style={{ ...lineStyle, background: "#fff1f0", color: "#a8071a" }}>
                  - {l}
                </div>
              ))
            : null}
          {h.new.split("\n").map((l, j) => (
            <div key={`n${j}`} style={{ ...lineStyle, background: "#f6ffed", color: "#135200" }}>
              + {l}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 로그가 있는 에이전트의 작업 내역(수정 파일·커밋·diff·요약). */
function WorkBody({ w }: { w: AgentWork }) {
  if (!w.found) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`로그 파일을 찾을 수 없음: ${w.logPath}`} />;
  }
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
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
      {w.summary && (
        <div>
          <Text strong>요약</Text>
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{w.summary}</ReactMarkdown>
          </div>
        </div>
      )}
      <Text type="secondary" style={{ fontSize: 11 }}>
        로그: {w.logPath}
      </Text>
    </Space>
  );
}

export default function OrchestrationChanges({
  epicKey,
  epic,
}: {
  epicKey: string;
  epic: EpicDetail | null;
}) {
  const agents: AgentRow[] = epic?.orchestration?.agents ?? [];
  const works = epic?.agentWorks ?? [];
  const contracts = epic?.contracts ?? [];

  const firstTok = (s: string) => (s || "").trim().split(/\s+/)[0];
  const roleOf = (slug: string) =>
    (contracts.find((c) => c.slug === slug)?.role ?? slug).replace(/\s*계약\s*$/, "").trim();
  const workFor = (name: string) =>
    works.find((w) => w.slug === name || firstTok(roleOf(w.slug)) === firstTok(name));
  const contractFor = (name: string) =>
    contracts.find((c) => c.slug === name || firstTok(roleOf(c.slug)) === firstTok(name));
  const anchorOf = (name: string) => "agent-" + name.trim().replace(/\s+/g, "-");

  // 열 때 해시(#agent-…)의 에이전트로 스크롤. getElementById라 한글·공백 id도 안전.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const el = document.getElementById(decodeURIComponent(id));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div>
      <Breadcrumb
        items={[
          { title: <Link href="/">홈</Link> },
          { title: <Link href="/orchestration">오케스트레이션</Link> },
          { title: <Link href={`/orchestration/${epicKey}`}>{epicKey}</Link> },
          { title: "에이전트 상세" },
        ]}
        style={{ marginBottom: 12 }}
      />
      <Title level={2} style={{ marginTop: 0 }}>
        에이전트 상세 — {epicKey}
      </Title>
      <Paragraph type="secondary">
        각 에이전트의 상태와 작업 내역입니다. 대화 로그(agent-logs.json)가 있으면 수정 파일·커밋·diff·요약을, 없으면 상태·계약을 보여줍니다.
      </Paragraph>

      {agents.length === 0 ? (
        <Empty description="에이전트 정보가 없습니다" />
      ) : (
        <>
          <Space size={[8, 8]} wrap style={{ marginBottom: 20 }}>
            {agents.map((a, i) => (
              <a key={`${a.agent}-${i}`} href={`#${anchorOf(a.agent)}`}>
                <Tag
                  style={{
                    cursor: "pointer",
                    color: dobbyColor(a.agent),
                    borderColor: dobbyColor(a.agent),
                    background: "transparent",
                    fontWeight: 600,
                    padding: "2px 10px",
                  }}
                >
                  {a.agent}
                </Tag>
              </a>
            ))}
          </Space>

          {agents.map((a, i) => {
            const w = workFor(a.agent);
            const c = contractFor(a.agent);
            const badge = agentStateBadge(a.state);
            return (
              <div key={`${a.agent}-${i}`} id={anchorOf(a.agent)} style={{ scrollMarginTop: 80, marginBottom: 20 }}>
                <Card
                  title={
                    <Space size={8} align="center" wrap>
                      <DobbyIcon size={26} expression="curious" color={dobbyColor(a.agent)} />
                      <Text strong style={{ fontSize: 16 }}>
                        {a.agent}
                      </Text>
                      <Tag color={badge.color}>{a.state}</Tag>
                      {a.round && <Tag>라운드 {a.round}</Tag>}
                    </Space>
                  }
                >
                  {w ? (
                    <WorkBody w={w} />
                  ) : (
                    <Space direction="vertical" size={12} style={{ width: "100%" }}>
                      <Descriptions size="small" column={1} bordered>
                        {a.issue && a.issue !== "-" && (
                          <Descriptions.Item label="이슈/작업">{a.issue}</Descriptions.Item>
                        )}
                        <Descriptions.Item label="상태">{a.state}</Descriptions.Item>
                        {a.branch && a.branch !== "-" && (
                          <Descriptions.Item label="브랜치">
                            <Text code>{a.branch}</Text>
                          </Descriptions.Item>
                        )}
                        {a.updatedAt && <Descriptions.Item label="갱신">{a.updatedAt}</Descriptions.Item>}
                      </Descriptions>
                      {c ? (
                        <div>
                          <Text strong>계약</Text>
                          <div className="markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.raw}</ReactMarkdown>
                          </div>
                        </div>
                      ) : (
                        <Text type="secondary">
                          대화 로그·계약이 없습니다(단일 에이전트 K=1이거나 로그 미수집). 상태만 표시합니다.
                        </Text>
                      )}
                    </Space>
                  )}
                </Card>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
