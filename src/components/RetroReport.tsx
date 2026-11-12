"use client";

import { Alert, Card, Col, Row, Space, Table, Tag, Typography } from "antd";
import type { RetroData, RetroSegment, RetroTotal } from "@/lib/retro";

const { Text, Paragraph, Title } = Typography;

const man = (n: number | null | undefined) => (n == null ? "-" : `${Math.round(n / 10000).toLocaleString()}만`);
const mins = (s: number | null | undefined) => (s == null ? "-" : s < 90 ? `${s}초` : `${Math.round(s / 60)}분`);
const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 1000) / 10 : 0);

const JUDGE_COLOR: Record<string, string> = {
  틀림: "red",
  "속도 손해": "orange",
  맞음: "green",
  "리뷰는 새로(독립)": "blue",
  "앞 세션 진행 중": "default",
  "측정 불가": "default",
  "첫 세션": "default",
};

function TotalTile({ label, help, t, actual }: { label: string; help: string; t: RetroTotal; actual: RetroTotal }) {
  const d = pct(t.cost, actual.cost);
  return (
    <Card size="small" style={{ height: "100%" }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Text>
      <div style={{ fontSize: 22, fontWeight: 600, margin: "4px 0" }}>{man(t.cost)}</div>
      <Space size={6} wrap>
        <Text style={{ fontSize: 12 }}>작업 {mins(t.time)}</Text>
        {t !== actual && (
          <Tag color={d < 0 ? "green" : d > 0 ? "red" : "default"} style={{ marginInlineEnd: 0 }}>
            실제 대비 {d > 0 ? "+" : ""}
            {d}%
          </Tag>
        )}
      </Space>
      <Paragraph type="secondary" style={{ fontSize: 12, margin: "6px 0 0" }}>
        {help}
      </Paragraph>
    </Card>
  );
}

function Evidence({ list }: { list?: string[] }) {
  if (!list?.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        근거:{" "}
      </Text>
      {list.map((e) => (
        <Text key={e} code style={{ fontSize: 12 }}>
          {e}
        </Text>
      ))}
    </div>
  );
}

export default function RetroReport({ data }: { data: RetroData }) {
  const { basis, measure: m } = data;
  const maxStage = Math.max(1, ...m.byStage.map((s) => s.cost));
  const judges = Object.entries(
    m.segments.reduce<Record<string, number>>((a, s) => ((a[s.judge] = (a[s.judge] ?? 0) + 1), a), {})
  );

  return (
    <div style={{ marginTop: 12 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        기준점: 단계 {basis.phase} · 변경 {basis.changes}개 · 검증 {basis.testRounds}회차 · 마지막 세션 {basis.lastSession} ·
        회고 시각 {basis.madeAt}
      </Text>

      {data.summary && <Alert type="info" showIcon style={{ margin: "12px 0" }} title={data.summary} />}

      <Title level={5} style={{ marginTop: 16 }}>
        세션 전환 손익
      </Title>
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        숫자는 요금 비율로 맞춘 환산 토큰입니다. 캐시에서 읽은 입력은 0.1배, 캐시에 새로 쓴 입력은 1.25배(1시간 캐시는
        2배), 출력은 5배로 셉니다. 세션 {m.sessions}개를 쟀고, 기록을 못 찾은 세션은 {m.missing}개입니다.
      </Paragraph>
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <TotalTile label="실제로 한 대로" help="이번 오더가 실제로 쓴 양" t={m.totals.actual} actual={m.totals.actual} />
        </Col>
        <Col xs={12} md={6}>
          <TotalTile label="모두 새 세션이었다면" help="전환마다 세션을 새로 열었다고 가정" t={m.totals.allNew} actual={m.totals.actual} />
        </Col>
        <Col xs={12} md={6}>
          <TotalTile
            label="지금 이어 쓰기 규칙대로였다면"
            help={`수정 단계만, 직전 문맥 ${man(m.reuseRule.maxCtx)} 이하·간격 ${m.reuseRule.maxGap}초 이하일 때 이어 씀`}
            t={m.totals.rule}
            actual={m.totals.actual}
          />
        </Col>
        <Col xs={12} md={6}>
          <TotalTile
            label="전환마다 더 나은 쪽이었다면"
            help={`비용 차가 ${m.fastPct}% 미만이면 더 빠른 쪽을 나은 쪽으로 봄`}
            t={m.totals.best}
            actual={m.totals.actual}
          />
        </Col>
      </Row>
      <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
        새 세션 중앙값: 시작 문맥 {man(m.medians.start)} · 첫 호출 {man(m.medians.first)} · 첫 응답 {mins(m.medians.startup)}
      </Paragraph>

      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        <Col xs={24} md={10}>
          <Card size="small" title="단계별 비용">
            {m.byStage.map((s) => (
              <div key={s.group} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>
                    {s.group} <Text type="secondary">({s.sessions}세션)</Text>
                  </span>
                  <span>{man(s.cost)}</span>
                </div>
                <div style={{ height: 6, background: "#f0f0f0", borderRadius: 3 }}>
                  <div style={{ width: `${(s.cost / maxStage) * 100}%`, height: 6, background: "#1677ff", borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} md={14}>
          <Card size="small" title="전환 판정">
            <Space size={[6, 6]} wrap style={{ marginBottom: 8 }}>
              {judges.map(([j, n]) => (
                <Tag key={j} color={JUDGE_COLOR[j] ?? "default"}>
                  {j} {n}
                </Tag>
              ))}
            </Space>
            <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
              틀림은 반대 선택이 {m.fastPct}% 이상 쌌던 전환입니다. 속도 손해는 비용 차가 {m.fastPct}% 미만인데 반대 선택이 더
              빨랐던 전환입니다. 앞 세션 진행 중은 앞 세션이 아직 일하던 때라 이어 쓸 수 없었던 전환입니다.
            </Paragraph>
          </Card>
        </Col>
      </Row>

      {!!data.sessionFindings?.length && (
        <>
          <Title level={5} style={{ marginTop: 20 }}>
            발견
          </Title>
          {data.sessionFindings.map((f) => (
            <Card key={f.title} size="small" style={{ marginBottom: 8 }} title={f.title} extra={f.impact ? `영향 ${man(f.impact)}` : null}>
              {f.why && <Paragraph style={{ margin: 0 }}>{f.why}</Paragraph>}
              {!!f.segments?.length && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  해당 전환: {f.segments.join(", ")}
                </Text>
              )}
              <Evidence list={f.evidence} />
            </Card>
          ))}
        </>
      )}

      {!!data.ruleProposals?.length && (
        <>
          <Title level={5} style={{ marginTop: 20 }}>
            세션 규칙 제안
          </Title>
          {data.ruleProposals.map((p) => (
            <Card key={p.title} size="small" style={{ marginBottom: 8 }} title={p.title}>
              <Text code copyable>
                {p.value}
              </Text>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                <Text type="secondary">대상: </Text>
                <Text code>{p.target}</Text>
              </div>
              {p.why && <Paragraph style={{ margin: "6px 0 0" }}>{p.why}</Paragraph>}
              <Evidence list={p.evidence} />
            </Card>
          ))}
        </>
      )}

      <Title level={5} style={{ marginTop: 20 }}>
        전환 목록
      </Title>
      <Table<RetroSegment>
        size="small"
        rowKey={(s) => `${s.when}-${s.stage}`}
        dataSource={m.segments}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 820 }}
        columns={[
          { title: "시각", dataIndex: "when", width: 130 },
          { title: "단계", dataIndex: "stage", width: 120 },
          { title: "선택", dataIndex: "mode", width: 70 },
          { title: "실제", render: (_, s) => `${man(s.cost)} · ${mins(s.active)}`, width: 120 },
          {
            title: "반대로 했다면",
            render: (_, s) => (s.altCost == null ? "-" : `${man(s.altCost)} · ${mins(s.altTime)}`),
            width: 130,
          },
          { title: "간격", render: (_, s) => (s.gap != null && s.gap < 0 ? "겹침" : mins(s.gap)), width: 70 },
          { title: "시작 문맥", render: (_, s) => man(s.ctxStart), width: 80 },
          {
            title: "판정",
            dataIndex: "judge",
            width: 130,
            filters: judges.map(([j]) => ({ text: j, value: j })),
            onFilter: (v, s) => s.judge === v,
            render: (j: string) => <Tag color={JUDGE_COLOR[j] ?? "default"}>{j}</Tag>,
          },
        ]}
      />

      {!!data.defects?.length && (
        <>
          <Title level={5} style={{ marginTop: 20 }}>
            판단 실수
          </Title>
          {data.defects.map((d) => (
            <Card key={d.title} size="small" style={{ marginBottom: 8 }} title={d.title}>
              <Space size={6} wrap>
                <Tag>처음 잡힌 단계: {d.foundAt}</Tag>
                {d.couldAt && <Tag color="gold">잡을 수 있었던 단계: {d.couldAt}</Tag>}
                {d.change != null && <Tag>변경 {d.change}</Tag>}
                {d.causes?.map((c) => (
                  <Tag key={c} color="volcano">
                    {c}
                  </Tag>
                ))}
              </Space>
              {d.judgment && <Paragraph style={{ margin: "6px 0 0" }}>{d.judgment}</Paragraph>}
              <Evidence list={d.evidence} />
            </Card>
          ))}
        </>
      )}

      {!!data.proposals?.length && (
        <>
          <Title level={5} style={{ marginTop: 20 }}>
            개선 제안
          </Title>
          {data.proposals.map((p) => (
            <Card
              key={p.title}
              size="small"
              style={{ marginBottom: 8 }}
              title={p.title}
              extra={p.type ? <Tag>{p.type}</Tag> : null}
            >
              {p.target && (
                <div style={{ fontSize: 12 }}>
                  <Text type="secondary">대상: </Text>
                  <Text code>{p.target}</Text>
                  {p.section && <Text type="secondary"> · {p.section}</Text>}
                </div>
              )}
              {p.text && (
                <Paragraph copyable style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", background: "#fafafa", padding: 8 }}>
                  {p.text}
                </Paragraph>
              )}
              <Evidence list={p.evidence} />
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
