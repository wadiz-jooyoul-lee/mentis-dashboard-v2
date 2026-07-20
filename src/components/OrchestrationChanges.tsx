"use client";

import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Typography, Space, Card, Empty, Tag, List, Collapse, Descriptions, Timeline } from "antd";
import { FileOutlined, BranchesOutlined, CodeOutlined } from "@ant-design/icons";
import type { EpicDetail, EditHunk, AgentWork } from "@/lib/orchestration";
import type { AgentRow } from "@/lib/parseOrchestration";
import { agentStateBadge } from "@/lib/parseOrchestration";
import JobConsole from "@/components/JobConsole";
import OrderHeader from "@/components/OrderHeader";
import { isJiraIssueKey } from "@/lib/keys";
import GroupAvatar from "@/components/GroupAvatar";
import QuipsControl from "@/components/QuipsControl";
import { dobbyColor } from "@/lib/dobby";
import { assignOrderAvatars } from "@/lib/avatarAssign";
import type { QuipsFile, QuipEntry } from "@/lib/quips";
import "./markdown.css";

const { Title, Text, Paragraph } = Typography;

const QUIP_MOOD_EMOJI: Record<string, string> = {
  happy: "😊",
  cheer: "🙌",
  complain: "😤",
  ponder: "🤔",
  chill: "😎",
  tired: "😮‍💨",
  bored: "🥱",
};

/** 에이전트 상세: 시간별 소감 기록(시간·상태·소감). 오래된 것 → 최신 순. */
function QuipHistory({ entries }: { entries?: QuipEntry[] }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <Text strong>소감 기록</Text>
      <Timeline
        style={{ marginTop: 8 }}
        items={entries.map((e) => ({
          children: (
            <Space direction="vertical" size={2}>
              <Space size={6} wrap align="center">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {(e.at ?? "").replace("T", " ").slice(0, 16)}
                </Text>
                <Tag style={{ margin: 0 }}>{e.state}</Tag>
              </Space>
              <Text>
                {QUIP_MOOD_EMOJI[e.mood] ?? "💬"} {e.text}
              </Text>
            </Space>
          ),
        }))}
      />
    </div>
  );
}

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
  quips,
}: {
  epicKey: string;
  epic: EpicDetail | null;
  quips?: QuipsFile | null;
}) {
  const agents: AgentRow[] = epic?.orchestration?.agents ?? [];
  const avatarMap = assignOrderAvatars(epicKey, agents.map((a) => a.agent));
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
      <OrderHeader
        epicKey={epicKey}
        mode={epic?.orchestration?.mode ?? null}
        worktreeRemoved={epic?.worktreeRemoved}
        hasJira={!!epic?.jiraIssueMd || isJiraIssueKey(epicKey)}
        extra={<QuipsControl epicKey={epicKey} />}
      />
      <Paragraph type="secondary" style={{ marginTop: 12 }}>
        각 에이전트의 상태와 작업 내역입니다. 대화 로그(agent-logs.json)가 있으면 수정 파일·커밋·diff·요약을, 없으면 상태·계약을 보여줍니다.
      </Paragraph>

      {agents.length === 0 ? (
        <Empty description="에이전트 정보가 없습니다" />
      ) : (
        <>
          {/* 에이전트 이동 버튼 — 스크롤해도 헤더(sticky, top64+height133=197) 바로 아래 고정 */}
          <div
            style={{
              position: "sticky",
              top: 197,
              zIndex: 80,
              background: "#fff",
              padding: "8px 0 10px",
              marginBottom: 12,
              borderBottom: "1px solid #f5f5f5",
            }}
          >
            <Space size={[8, 8]} wrap>
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
          </div>

          {agents.map((a, i) => {
            const w = workFor(a.agent);
            const c = contractFor(a.agent);
            const badge = agentStateBadge(a.state);
            return (
              <div key={`${a.agent}-${i}`} id={anchorOf(a.agent)} style={{ scrollMarginTop: 250, marginBottom: 20 }}>
                <Card
                  title={
                    <Space size={8} align="center" wrap>
                      <GroupAvatar slug={a.agent} avatar={avatarMap.get(a.agent)} state={a.state} size={26} quip={quips?.changes?.[a.agent]} />
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
                  <QuipHistory entries={quips?.history?.[a.agent]} />
                  <Collapse
                    ghost
                    destroyOnHidden
                    style={{ marginTop: 12 }}
                    items={[
                      {
                        key: "rec",
                        label: "기록 콘솔",
                        children: <JobConsole orderKey={epicKey} agent={a.agent} height={300} />,
                      },
                    ]}
                  />
                </Card>
              </div>
            );
          })}
          {(() => {
            const matched = new Set<string>();
            for (const a of agents) {
              const w = workFor(a.agent);
              if (w) matched.add(w.slug);
            }
            const extra = works.filter(
              (w) => !matched.has(w.slug) && (w.diffs.length > 0 || w.commits.length > 0)
            );
            if (extra.length === 0) return null;
            return (
              <>
                <Title level={4} style={{ marginTop: 24 }}>
                  그 외 코드 변경 로그
                </Title>
                {extra.map((w, i) => (
                  <div key={`extra-${w.slug}-${i}`} style={{ marginBottom: 20 }}>
                    <Card title={<Text strong>{w.slug}</Text>}>
                      <WorkBody w={w} />
                    </Card>
                  </div>
                ))}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
