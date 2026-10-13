"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Typography, Space, Card, Empty, Tag, List, Collapse, Descriptions, Timeline, Tooltip } from "antd";
import { FileOutlined, BranchesOutlined, CodeOutlined } from "@ant-design/icons";
import type { EpicDetail, EditHunk, AgentWork, FileDiff } from "@/lib/orchestration";
import type { RepoCommitChanges } from "@/lib/commitChanges";
import type { AgentRow } from "@/lib/parseOrchestration";
import { agentStateBadge } from "@/lib/parseOrchestration";
import JobConsole from "@/components/JobConsole";
import OrderHeader from "@/components/OrderHeader";
import { isJiraIssueKey } from "@/lib/keys";
import GroupAvatar from "@/components/GroupAvatar";
import QuipsControl from "@/components/QuipsControl";
import { dobbyColor } from "@/lib/dobby";
import { quipList, type QuipsFile, type QuipEntry } from "@/lib/quipTypes";
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
          content: (
            <Space orientation="vertical" size={2}>
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
          {/* 줄을 지우기만 한 덩어리(git diff)는 new 가 비어 있다. 빈 + 줄을 그리지 않는다. */}
          {(h.new || !h.old ? h.new.split("\n") : []).map((l, j) => (
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
function WorkBody({ w, hideCode }: { w: AgentWork; hideCode?: boolean }) {
  if (!w.found) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`로그 파일을 찾을 수 없음: ${w.logPath}`} />;
  }
  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      {!hideCode && (
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
      )}
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
      {!hideCode && w.diffs.length > 0 && (
        <div>
          <Text strong>
            <CodeOutlined /> 코드 변경 diff ({w.diffs.length}개 파일)
          </Text>
          {w.source === "git" && (
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
              출처: 브랜치 diff(git) — 대화 로그에 편집 기록이 없어 워크트리에서 읽었습니다
            </Text>
          )}
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

/** 파일별 diff 접이식 목록. */
function FileDiffList({ diffs }: { diffs: FileDiff[] }) {
  return (
    <Collapse
      ghost
      size="small"
      items={diffs.map((fd) => ({
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
  );
}

/** 바뀐 파일 목록 + diff. diff 가 없는 파일(너무 크거나 바이너리)은 목록에만 보인다. */
function ChangeBody({ files, diffs }: { files: string[]; diffs: FileDiff[] }) {
  const noDiff = files.filter((f) => !diffs.some((d) => d.file === f));
  return (
    <Space orientation="vertical" size={4} style={{ width: "100%" }}>
      <FileDiffList diffs={diffs} />
      {noDiff.length > 0 && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          내용 생략(너무 크거나 글자가 아닌 파일): {noDiff.join(", ")}
        </Text>
      )}
    </Space>
  );
}

/**
 * 작업 브랜치의 커밋별 코드 변경. v2 는 통합할 때마다 커밋하므로 커밋 하나가 통합 한 번이다.
 * 각 커밋에 그 사이 진행한 세션(리뷰 차수·수정)을 붙여 어느 라운드의 변경인지 보이게 한다.
 */
function CommitChangesSection({ repos }: { repos: RepoCommitChanges[] }) {
  if (repos.length === 0) return null;
  return (
    <Card title={<Text strong style={{ fontSize: 16 }}><BranchesOutlined /> 커밋별 코드 변경</Text>} style={{ marginBottom: 20 }}>
      <Space orientation="vertical" size={20} style={{ width: "100%" }}>
        {repos.map((r) => {
          const items = [
            {
              key: "total",
              label: (
                <Space size={8} wrap>
                  <Tag color="blue" style={{ margin: 0 }}>전체</Tag>
                  <Text>{r.baseLabel}과 비교</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>파일 {r.total.files.length}개</Text>
                </Space>
              ),
              children: <ChangeBody files={r.total.files} diffs={r.total.diffs} />,
            },
            ...r.commits.map((c, i) => ({
              key: c.sha,
              label: (
                <Space orientation="vertical" size={2}>
                  <Space size={8} wrap>
                    <Tag style={{ margin: 0 }}>{i + 1}번째 커밋</Tag>
                    <Text code style={{ fontSize: 12 }}>{c.short}</Text>
                    <Text>{c.subject}</Text>
                  </Space>
                  <Space size={6} wrap>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {c.at} · 파일 {c.files.length}개
                    </Text>
                    {c.sessions.length > 0 ? (
                      c.sessions.map((s, j) => (
                        <Tag key={j} style={{ margin: 0, fontSize: 11 }}>{s}</Tag>
                      ))
                    ) : (
                      <Text type="secondary" style={{ fontSize: 11 }}>이 사이에 기록된 세션 없음</Text>
                    )}
                  </Space>
                </Space>
              ),
              children: <ChangeBody files={c.files} diffs={c.diffs} />,
            })),
            ...(r.uncommitted
              ? [
                  {
                    key: "pending",
                    label: (
                      <Space size={8} wrap>
                        <Tag color="orange" style={{ margin: 0 }}>커밋 전</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>파일 {r.uncommitted.files.length}개</Text>
                        {r.uncommitted.sessions.map((s, j) => (
                          <Tag key={j} style={{ margin: 0, fontSize: 11 }}>{s}</Tag>
                        ))}
                      </Space>
                    ),
                    children: <ChangeBody files={r.uncommitted.files} diffs={r.uncommitted.diffs} />,
                  },
                ]
              : []),
          ];
          return (
            <div key={r.path}>
              <Space size={8} wrap>
                <Text strong>{r.repo}</Text>
                <Text type="secondary" style={{ fontSize: 12 }} code>{r.path}</Text>
              </Space>
              <Collapse size="small" style={{ marginTop: 8 }} items={items} />
            </div>
          );
        })}
      </Space>
    </Card>
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
  // 핀 고정 아바타(서버 avatars.json). 에이전트가 추가돼도 기존 담당은 안 바뀐다.
  const avatarMap = new Map(Object.entries(epic?.avatars ?? {}));
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

  // 에이전트 이동 바의 sticky top = 앱 상단바(64) + 오더 헤더의 실제 높이.
  // 헤더 높이는 제목 줄바꿈·태그 수·화면 폭에 따라 달라지므로 매직넘버(197) 대신 실측해 맞춘다.
  const [navTop, setNavTop] = useState(197);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-order-header]");
    if (!header) return;
    const update = () => setNavTop(64 + header.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div>
      <OrderHeader
        epicKey={epicKey}
        title={epic?.title ?? null}
        mode={epic?.orchestration?.mode ?? null}
        worktreeRemoved={epic?.worktreeRemoved}
      logOnlyAgents={epic?.logOnlyAgents ?? []}
        resolved={epic?.resolved ?? false}
        hasJira={epic?.hasJiraDoc || isJiraIssueKey(epicKey)}
        hasDesign={epic?.hasDesignDoc ?? false}
        hasQa={!!epic?.qa}
        orderKind={epic?.orderKind ?? null}
        extra={<QuipsControl epicKey={epicKey} />}
      />
      <Paragraph type="secondary" style={{ marginTop: 12 }}>
        각 에이전트의 상태와 작업 내역입니다. 대화 로그(agent-logs.json)가 있으면 수정 파일·커밋·diff·요약을, 없으면 상태·계약을 보여줍니다.
      </Paragraph>

      {agents.length === 0 ? (
        <Empty description="에이전트 정보가 없습니다" />
      ) : (
        <>
          {/* 에이전트 이동 버튼 — 스크롤해도 헤더(sticky) 바로 아래 고정. top은 헤더 높이 실측값. */}
          <div
            style={{
              position: "sticky",
              top: navTop,
              zIndex: 80,
              background: "#fff",
              padding: "8px 0 10px 12px",
              marginBottom: 12,
              borderBottom: "1px solid #f5f5f5",
            }}
          >
            <Space size={[8, 8]} wrap>
              {agents.map((a, i) => (
                <a key={`${a.agent}-${i}`} href={`#${anchorOf(a.agent)}`}>
                  <Tooltip title={a.desc || undefined}>
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
                      {a.name || a.agent}
                    </Tag>
                  </Tooltip>
                </a>
              ))}
            </Space>
          </div>

          <CommitChangesSection repos={epic?.commitChanges ?? []} />

          {agents.map((a, i) => {
            const w = workFor(a.agent);
            const c = contractFor(a.agent);
            const badge = agentStateBadge(a.state);
            return (
              <div key={`${a.agent}-${i}`} id={anchorOf(a.agent)} style={{ scrollMarginTop: 250, marginBottom: 20 }}>
                <Card
                  title={
                    <Space size={8} align="center" wrap>
                      <GroupAvatar slug={a.agent} name={a.name || a.agent} avatar={avatarMap.get(a.agent)} state={a.state} size={26} quips={quipList(quips?.changes?.[a.agent])} />
                      <Tooltip title={a.desc || undefined}>
                        <Text strong style={{ fontSize: 16 }}>
                          {a.name || a.agent}
                        </Text>
                      </Tooltip>
                      <Tag color={badge.color}>{a.state}</Tag>
                      {a.round && <Tag>라운드 {a.round}</Tag>}
                    </Space>
                  }
                >
                  {w ? (
                    // 리뷰어는 코드를 고치지 않는다. 같은 세션 기록을 개발자와 함께 쓰는 경우가 있어
                    // (검증 실패 수정 뒤 이어서 리뷰) 코드 변경이 리뷰어에게도 붙으므로 숨긴다.
                    <WorkBody w={w} hideCode={/리뷰/.test(a.name ?? "")} />
                  ) : (
                    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
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
