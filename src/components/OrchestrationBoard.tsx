"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Typography,
  Space,
  Badge,
  Tag,
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Timeline,
  Collapse,
  Empty,
  Alert,
} from "antd";
import { WarningOutlined, FileTextOutlined } from "@ant-design/icons";
import GroupAvatar from "@/components/GroupAvatar";
import QuipsControl from "@/components/QuipsControl";
import OrderHeader from "@/components/OrderHeader";
import IssueReport from "@/components/IssueReport";
import type { QuipsFile, Quip } from "@/lib/quips";
import { assignOrderAvatars, type AssignedAvatar } from "@/lib/avatarAssign";
import type { EpicDetail, ReviewFile } from "@/lib/orchestration";
import type { AgentRow, EventRow } from "@/lib/parseOrchestration";
import { agentStateBadge, STATE_ORDER } from "@/lib/parseOrchestration";
import { isJiraIssueKey } from "@/lib/keys";
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
function MarkdownCards({ title, subtitle, md }: { title: string; subtitle: string; md: string | null }) {
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

/** 시각 문자열에 시:분이 있나(날짜만이면 false). 날짜만이면 경과를 못 재므로 정체 판정에서 제외. */
function hasTimeOfDay(v: string | null | undefined): boolean {
  return !!v && /\d{1,2}:\d{2}/.test(v);
}

/** 주어진 시각 이후 경과(분). 파싱 실패·시각없음이면 null. */
function minutesSince(v: string | null | undefined): number | null {
  if (!hasTimeOfDay(v)) return null;
  const d = new Date((v as string).replace(" ", "T"));
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 60000);
}

// 실제로 "일하는 중"인 상태만 정체 감지 대상(대기·완료 제외)
const ACTIVE_STATES = ["분석", "구현", "리뷰"];
const STALE_MIN = 15;
/**
 * 정체 의심 = 활성 상태 + "작업 시작(착수) 시각"으로부터 STALE_MIN분 이상 경과.
 * 착수 시각이 없거나 날짜만이면(시:분 없음) 경과를 못 재므로 판정하지 않는다(오탐 방지).
 */
function isStale(a: AgentRow): boolean {
  if (!ACTIVE_STATES.includes(a.state)) return false;
  const m = minutesSince(a.startedAt);
  return m != null && m >= STALE_MIN;
}

// 역할명 → 고정 색(이름 해시로 팔레트에서 선택)
const ROLE_PALETTE = [
  "geekblue",
  "magenta",
  "cyan",
  "purple",
  "volcano",
  "green",
  "blue",
  "gold",
];
function roleColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ROLE_PALETTE[h % ROLE_PALETTE.length];
}

/** 에이전트 상태 → 도비 표정. */
/** 이벤트를 시(hour) 단위로 묶는다. 입력은 최신 먼저 정렬 가정(순서 유지). */
function groupByHour(events: EventRow[]): { hour: string; events: EventRow[] }[] {
  const groups: { hour: string; events: EventRow[] }[] = [];
  const index = new Map<string, number>();
  for (const e of events) {
    const m = e.time.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2})/);
    const hour = m ? `${m[1]} ${m[2]}시` : "기타";
    let gi = index.get(hour);
    if (gi === undefined) {
      gi = groups.length;
      index.set(hour, gi);
      groups.push({ hour, events: [] });
    }
    groups[gi].events.push(e);
  }
  return groups;
}

/** 리뷰를 에이전트(slug) 단위로 묶는다. 각 에이전트 안은 라운드 내림차순. */
function groupReviewsByAgent(
  reviews: ReviewFile[]
): { agent: string; reviews: ReviewFile[] }[] {
  const groups: { agent: string; reviews: ReviewFile[] }[] = [];
  const index = new Map<string, number>();
  for (const rv of reviews) {
    let gi = index.get(rv.slug);
    if (gi === undefined) {
      gi = groups.length;
      index.set(rv.slug, gi);
      groups.push({ agent: rv.slug, reviews: [] });
    }
    groups[gi].reviews.push(rv);
  }
  groups.sort((a, b) => a.agent.localeCompare(b.agent));
  return groups;
}

/** 이벤트 하나를 타임라인 항목으로. */
function eventItem(e: EventRow) {
  return {
    children: (
      <Space direction="vertical" size={0}>
        <Text>{e.text}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {e.time}
        </Text>
      </Space>
    ),
  };
}

function AgentCard({
  a,
  epicKey,
  changeSlug,
  avatar,
  quip,
}: {
  a: AgentRow;
  epicKey: string;
  /** 이 에이전트의 변경 기록 slug(있으면 카드 클릭 시 해당 섹션으로 이동) */
  changeSlug?: string;
  /** 배정된 그룹 아바타 */
  avatar?: AssignedAvatar;
  /** 이 에이전트의 board 소감(있으면 호버 말풍선) */
  quip?: Quip | null;
}) {
  const router = useRouter();
  const stale = isStale(a);
  // 로그 유무와 무관하게 모든 에이전트 카드를 클릭 가능 → 변경 페이지의 해당 에이전트 섹션으로.
  const clickable = !!a.agent && a.agent !== "-";
  const anchor = a.agent.trim().replace(/\s+/g, "-");
  const goToChanges = clickable
    ? () => router.push(`/orchestration/${epicKey}/changes#agent-${anchor}`)
    : undefined;
  void changeSlug;
  return (
    <Card
      size="small"
      hoverable={clickable}
      onClick={goToChanges}
      style={{
        marginBottom: 8,
        borderColor: stale ? "#ffccc7" : undefined,
        cursor: clickable ? "pointer" : undefined,
      }}
    >
      <Space direction="vertical" size={4} style={{ width: "100%" }}>
        <Space size={6} wrap align="center">
          <GroupAvatar slug={a.agent} avatar={avatar} state={a.state} size={34} quip={quip} />
          {a.agent && (
            <Tag
              color={roleColor(a.agent)}
              style={{ margin: 0, fontWeight: 600, fontSize: 13 }}
            >
              {a.agent}
            </Tag>
          )}
        </Space>
        {a.issue && a.issue !== "-" && (
          <Link
            href={`/orchestration/${a.issue}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Text strong>{a.issue}</Text>
          </Link>
        )}
        <Space size={8} wrap align="center">
          {a.round && (
            <Badge
              count={Number(a.round) || a.round}
              color={agentStateBadge(a.state).color}
              overflowCount={999}
            />
          )}
          {a.updatedAt && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {a.updatedAt}
            </Text>
          )}
        </Space>
        {stale && (
          <Tag color="error" icon={<WarningOutlined />}>
            정체 의심 (착수 후 {minutesSince(a.startedAt)}분 경과)
          </Tag>
        )}
        {clickable && (
          <Tag
            icon={<FileTextOutlined />}
            color="geekblue"
            style={{ margin: 0, width: "fit-content" }}
          >
            코드 변경 보기 →
          </Tag>
        )}
      </Space>
    </Card>
  );
}

export default function OrchestrationBoard({
  epicKey,
  epic,
  quips,
}: {
  epicKey: string;
  epic: EpicDetail | null;
  quips?: QuipsFile | null;
}) {
  const o = epic?.orchestration ?? null;

  // 이 오더의 에이전트들에 그룹 아바타 배정(같은 그룹 응집, 모자라면 다음 그룹, 40:40:20).
  const avatarMap = assignOrderAvatars(epicKey, (o?.agents ?? []).map((a) => a.agent));

  // 리뷰/계약 slug → 한국어 역할명(계약 헤딩에서, "계약" 접미 제거)
  const roleBySlug = new Map(
    (epic?.contracts ?? []).map((c) => [
      c.slug,
      c.role.replace(/\s*계약\s*$/, "").trim(),
    ])
  );

  // 작업 로그가 있는 slug + (역할명 앞 토큰 → slug) 매핑으로, 칸반 카드가
  // 자기 에이전트의 코드 변경 섹션으로 이동할 slug를 찾는다.
  const changeSlugs = new Set((epic?.agentWorks ?? []).map((w) => w.slug));
  const slugByToken = new Map<string, string>();
  for (const [slug, role] of roleBySlug) {
    const token = role.split(/\s+/)[0];
    if (token) slugByToken.set(token, slug);
  }
  const changeSlugFor = (agentName: string): string | undefined => {
    const slug = slugByToken.get((agentName || "").trim().split(/\s+/)[0]);
    return slug && changeSlugs.has(slug) ? slug : undefined;
  };

  const header = (
    <OrderHeader
      epicKey={epicKey}
      mode={o?.mode ?? null}
      worktreeRemoved={epic?.worktreeRemoved}
      hasJira={!!epic?.jiraIssueMd || isJiraIssueKey(epicKey)}
      extra={<QuipsControl epicKey={epicKey} />}
    />
  );

  if (!o) {
    const phase = epic?.phaseLabel;
    return (
      <div>
        {header}
        <Empty
          description={
            phase && phase !== "-"
              ? `${phase} — 에이전트 편성 전입니다. 분석이 끝나면 에이전트가 보드에 나타납니다.`
              : "아직 준비 중입니다 (셋업·분석 초기일 수 있음)."
          }
        />
      </div>
    );
  }

  const counts: Record<string, number> = {};
  for (const a of o.agents) counts[a.state] = (counts[a.state] ?? 0) + 1;
  // 고정 열(정식 순서) + 정의 밖 상태는 뒤에 추가(사라지지 않게)
  const extras = Object.keys(counts).filter((s) => !STATE_ORDER.includes(s));
  const cols = [...STATE_ORDER, ...extras];
  const total = o.agents.length;
  const done = counts["완료"] ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const staleAgents = o.agents.filter(isStale);

  return (
    <div>
      {header}

      {/* 관제 요약 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={12} md={4}>
            <Statistic title="에이전트" value={total} suffix="명" />
          </Col>
          <Col xs={24} md={12}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              상태 분포
            </Text>
            <div style={{ marginTop: 6 }}>
              <Space size={[6, 6]} wrap>
                {cols
                  .filter((s) => (counts[s] ?? 0) > 0)
                  .map((s) => {
                  const b = agentStateBadge(s);
                  const n = counts[s] ?? 0;
                  return (
                    <Tag key={s} color={b.color}>
                      {s} {n}
                    </Tag>
                  );
                })}
              </Space>
            </div>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: "center" }}>
            <Progress
              type="dashboard"
              percent={pct}
              size={90}
              status={done === total && total > 0 ? "success" : "active"}
            />
            <div>
              <Text type="secondary">완료율</Text>
            </div>
          </Col>
        </Row>
      </Card>

      {staleAgents.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`정체 의심 ${staleAgents.length}건`}
          description={staleAgents
            .map((a) => `${a.agent}(${a.issue}) 착수 후 ${minutesSince(a.startedAt)}분`)
            .join(" · ")}
        />
      )}

      {/* 칸반 보드 */}
      <Title level={4}>에이전트 상태</Title>
      <Row gutter={[12, 12]}>
        {cols.map((col) => {
          const b = agentStateBadge(col);
          const items = o.agents.filter((a) => a.state === col);
          // 5개 고정 열 → 폭을 균등하게 나눠 전체 너비를 채운다(좁은 화면에선 줄바꿈).
          return (
            <Col
              key={col}
              flex="1 1 0"
              style={{ minWidth: 150 }}
            >
              <div
                style={{
                  background: "#fafafa",
                  borderRadius: 8,
                  padding: 10,
                  minHeight: 80,
                  height: "100%",
                }}
              >
                <div style={{ marginBottom: 8, whiteSpace: "nowrap" }}>
                  <Badge color={b.color} text={`${col} (${items.length})`} />
                </div>
                {items.map((a, i) => (
                  <AgentCard
                    key={`${a.agent}-${i}`}
                    a={a}
                    epicKey={epicKey}
                    changeSlug={changeSlugFor(a.agent)}
                    avatar={avatarMap.get(a.agent)}
                    quip={quips?.board?.[a.agent]}
                  />
                ))}
              </div>
            </Col>
          );
        })}
      </Row>

      {/* 상세 (상단 요약·범위 배분·공유 계약·충돌 등) — 폴딩(기본 접힘) */}
      {o.restMarkdown && (
        <Collapse
          style={{ marginTop: 20 }}
          items={[
            {
              key: "board-detail",
              label: "보드 상세",
              children: (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {o.restMarkdown}
                  </ReactMarkdown>
                </div>
              ),
            },
          ]}
        />
      )}

      {/* 이벤트 로그: 접이식(기본 펼침). 최근 5개는 펼쳐서, 나머지는 시(hour) 단위로 폴딩 */}
      {o.events.length > 0 && (
        <Collapse
          style={{ marginTop: 20 }}
          defaultActiveKey={["event-log"]}
          items={[
            {
              key: "event-log",
              label: "이벤트 로그",
              children: (
                <>
                  <Timeline items={o.events.slice(0, 5).map(eventItem)} />
                  {o.events.length > 5 && (
                    <Collapse
                      ghost
                      size="small"
                      items={groupByHour(o.events.slice(5)).map((g) => ({
                        key: g.hour,
                        label: `${g.hour} · ${g.events.length}건`,
                        children: <Timeline items={g.events.map(eventItem)} />,
                      }))}
                    />
                  )}
                </>
              ),
            },
          ]}
        />
      )}

      {/* 계약 */}
      {epic!.contracts.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <Title level={4}>에이전트 계약</Title>
          <Collapse
            items={epic!.contracts.map((c) => ({
              key: c.slug,
              label: c.role,
              children: (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {c.raw}
                  </ReactMarkdown>
                </div>
              ),
            }))}
          />
        </div>
      )}

      {/* 리뷰: 에이전트 단위 트리(에이전트 → 라운드) */}
      {epic!.reviews.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <Title level={4}>리뷰</Title>
          <Collapse
            items={groupReviewsByAgent(epic!.reviews).map((g) => ({
              key: g.agent,
              label: (
                <Space size={8} align="center">
                  <GroupAvatar
                    slug={g.agent}
                    avatar={avatarMap.get(g.agent)}
                    state={o?.agents.find((x) => x.agent === g.agent)?.state}
                    size={24}
                    quip={quips?.reviews?.[g.agent]}
                  />
                  <Text strong>{roleBySlug.get(g.agent) ?? g.agent}</Text>
                  <Tag>{g.reviews.length}개 라운드</Tag>
                </Space>
              ),
              children: (
                <Collapse
                  ghost
                  size="small"
                  items={g.reviews.map((rv) => ({
                    key: `${rv.slug}-${rv.round}`,
                    label: `round-${rv.round}`,
                    children: (
                      <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {rv.content}
                        </ReactMarkdown>
                      </div>
                    ),
                  }))}
                />
              ),
            }))}
          />
        </div>
      )}

      {/* 분석 (analysis.md) — v1 착수 상세처럼 */}
      {epic!.analysisMd && (
        <div style={{ marginTop: 20 }}>
          <Title level={4}>분석</Title>
          <Card size="small">
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{epic!.analysisMd}</ReactMarkdown>
            </div>
          </Card>
        </div>
      )}

      {/* 사이드 이펙트 분석 (side-effects.md) — 설계 시점 파급 점검 */}
      <MarkdownCards
        title="사이드 이펙트 분석"
        subtitle="이 구현 설계가 기존·인접 기능에 미칠 수 있는 파급을 다각도로 점검한 결과입니다."
        md={epic!.sideEffectsMd}
      />

      {/* 자율 판단 기록 (decisions.md) */}
      <MarkdownCards
        title="자율 판단 기록"
        subtitle="사용자에게 묻지 않고 스스로 정한 결정과 그 이유·다른 선택지입니다."
        md={epic!.decisionsMd}
      />

      {/* 구현 / 산출 */}
      {(epic!.workType === "nonsource" ? epic!.produceMd : epic!.implementationMd) && (
        <div style={{ marginTop: 20 }}>
          <Title level={4}>{epic!.workType === "nonsource" ? "산출" : "구현"}</Title>
          <Card size="small">
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {(epic!.workType === "nonsource" ? epic!.produceMd : epic!.implementationMd) ?? ""}
              </ReactMarkdown>
            </div>
          </Card>
        </div>
      )}

      {/* 확인 가이드 (test-guide.md) — 사용자 수동 사이드이펙트 확인 TC */}
      <MarkdownCards
        title="확인 가이드 (수동 TC)"
        subtitle="사용자가 직접 사이드이펙트를 확인하는 방법입니다. 화면·절차·기대 결과 순으로 따라 하세요."
        md={epic!.testGuideMd}
      />

      {/* 산출물 (deliverables/) */}
      {epic!.deliverables.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <Title level={4}>산출물</Title>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {epic!.deliverables.map((d) => (
              <Card
                key={d.name}
                size="small"
                title={<Text code>deliverables/{d.name}</Text>}
                extra={
                  d.content ? (
                    <a
                      href={`data:text/plain;charset=utf-8,${encodeURIComponent(d.content)}`}
                      download={d.name}
                    >
                      다운로드
                    </a>
                  ) : undefined
                }
              >
                {d.kind === "md" ? (
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{d.content}</ReactMarkdown>
                  </div>
                ) : d.kind === "html" ? (
                  <iframe
                    title={d.name}
                    srcDoc={d.content}
                    sandbox=""
                    style={{ width: "100%", height: 520, border: "1px solid #f0f0f0", borderRadius: 6 }}
                  />
                ) : (
                  <Text type="secondary">미리보기를 지원하지 않는 파일입니다.</Text>
                )}
              </Card>
            ))}
          </Space>
        </div>
      )}

      {/* 검증 (test-runs) — 회차 없어도 영역은 표시 */}
      <div style={{ marginTop: 20 }}>
        <Title level={4}>검증</Title>
        {epic!.runs.length > 0 ? (
          <IssueReport issueKey={epicKey} runs={epic!.runs} embedded />
        ) : (
          <Card size="small">
            <Text type="secondary">
              아직 테스트 회차가 없습니다 — code 오더에서 <Text code>dobby-test</Text> 실행 시
              <Text code> test-runs/</Text>에 회차가 쌓이고 여기 리포트가 표시됩니다.
            </Text>
          </Card>
        )}
      </div>

      {/* 종료 서머리 (summary.md) */}
      {epic!.summaryMd && (
        <div style={{ marginTop: 20 }}>
          <Title level={4}>종료 서머리</Title>
          <Card size="small">
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{epic!.summaryMd}</ReactMarkdown>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
