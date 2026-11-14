"use client";

import { Alert, Card, Col, Collapse, Row, Space, Table, Tag, Typography } from "antd";
import { retroStages, type RetroData, type RetroFix, type RetroSegment } from "@/lib/retro";

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

const CAUSE_TEXT: Record<string, string> = {
  분석부족: "분석이 부족했음",
  스펙모호: "요구가 분명하지 않았음",
  규칙미준수: "있는 규칙을 안 지킴",
  docs미참조: "참고 문서를 안 봄",
  리뷰지연: "리뷰에서 늦게 잡힘",
  시험계획오류: "시험 계획이 틀렸음",
};

const WHERE_META: Record<RetroFix["where"], { label: string; help: string; color: string }> = {
  스킬: { label: "스킬 고치기", help: "도비가 따르는 작업 설명서를 고칩니다.", color: "purple" },
  서버: { label: "서버 고치기", help: "대시보드·사무실·헬퍼 코드를 고칩니다.", color: "geekblue" },
  사람: { label: "사람이 미리 알려 줄 것", help: "오더를 시작할 때 사람이 알려 주면 막을 수 있습니다.", color: "gold" },
};
// 예전 회고의 제안 종류를 고칠 곳 묶음에 맞춘다
const PROPOSAL_WHERE: Record<string, RetroFix["where"]> = { 스킬: "스킬", "진행 방법": "스킬", 서버: "서버", "사용자 입력": "사람" };

/** 단계 띠: 잡을 수 있었던 곳(노랑)과 실제로 잡힌 곳(빨강)을 점으로, 그 사이를 늦어진 구간으로 칠한다. */
function StageBand({ could, found }: { could?: string; found: string }) {
  const stages = retroStages(found, could);
  const fi = stages.indexOf(found);
  const ci = could ? stages.indexOf(could) : -1;
  if (fi < 0) return null;
  const n = stages.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  return (
    <div style={{ margin: "8px 0 4px" }}>
      <div style={{ position: "relative", height: 22 }}>
        <div style={{ position: "absolute", left: `${x(0)}%`, right: `${100 - x(n - 1)}%`, top: 10, height: 2, background: "#e5e5e5" }} />
        {ci >= 0 && ci < fi && (
          <div
            style={{ position: "absolute", left: `${x(ci)}%`, width: `${x(fi) - x(ci)}%`, top: 8, height: 6, background: "#ffccc7", borderRadius: 3 }}
          />
        )}
        {stages.map((s, i) => {
          const color = i === fi ? "#cf1322" : i === ci ? "#d48806" : "#d9d9d9";
          const size = i === fi || i === ci ? 14 : 8;
          return (
            <div
              key={s}
              style={{
                position: "absolute",
                left: `calc(${x(i)}% - ${size / 2}px)`,
                top: 11 - size / 2,
                width: size,
                height: size,
                borderRadius: "50%",
                background: color,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex" }}>
        {stages.map((s, i) => (
          <div
            key={s}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 12,
              color: i === fi ? "#cf1322" : i === ci ? "#d48806" : "#8c8c8c",
              fontWeight: i === fi || i === ci ? 600 : 400,
            }}
          >
            {s}
          </div>
        ))}
      </div>
      <Space size={12} style={{ fontSize: 12, marginTop: 4 }} wrap>
        {ci >= 0 && (
          <Text style={{ fontSize: 12, color: "#d48806" }}>● 여기서 잡을 수 있었음</Text>
        )}
        <Text style={{ fontSize: 12, color: "#cf1322" }}>● 실제로 잡힌 곳</Text>
        {ci >= 0 && ci < fi && <Text type="secondary" style={{ fontSize: 12 }}>{fi - ci}단계 늦게 잡혔습니다</Text>}
        {!could || could === "미확인" ? <Text type="secondary" style={{ fontSize: 12 }}>더 일찍 잡을 수 있었는지는 확인하지 못했습니다</Text> : null}
      </Space>
    </div>
  );
}

function Line({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <span style={{ fontSize: 16, lineHeight: "22px" }}>{icon}</span>
      <div>
        <Text strong style={{ fontSize: 13 }}>
          {label}
        </Text>
        <Paragraph style={{ margin: 0 }}>{children}</Paragraph>
      </div>
    </div>
  );
}

function Evidence({ list }: { list?: string[] }) {
  if (!list?.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
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

function FixTag({ where }: { where: RetroFix["where"] }) {
  return <Tag color={WHERE_META[where]?.color ?? "default"}>{where}</Tag>;
}

/** 네 가지 경우의 토큰 비용을 가로 막대로 비교한다. */
function TokenBars({ data }: { data: RetroData }) {
  const t = data.measure.totals;
  const rows = [
    { label: "실제로 한 대로", v: t.actual, help: "이번 오더가 실제로 쓴 양" },
    { label: "단계마다 새 세션을 열었다면", v: t.allNew, help: "세션을 한 번도 이어 쓰지 않았을 때" },
    { label: "지금 규칙대로 했다면", v: t.rule, help: "지금의 이어 쓰기 기준을 따랐을 때" },
    { label: "매번 더 나은 쪽을 골랐다면", v: t.best, help: "할 수 있었던 가장 좋은 경우" },
  ];
  const max = Math.max(1, ...rows.map((r) => r.v.cost));
  return (
    <div>
      {rows.map((r, i) => {
        const d = pct(r.v.cost, t.actual.cost);
        return (
          <div key={r.label} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>
                {r.label} <Text type="secondary" style={{ fontSize: 12 }}>· {r.help}</Text>
              </span>
              <span>
                <b>{man(r.v.cost)}</b>
                {i > 0 && (
                  <Tag color={d < 0 ? "green" : d > 0 ? "red" : "default"} style={{ marginLeft: 6, marginInlineEnd: 0 }}>
                    {d > 0 ? "+" : ""}
                    {d}%
                  </Tag>
                )}
              </span>
            </div>
            <div style={{ height: 12, background: "#f5f5f5", borderRadius: 6, marginTop: 3 }}>
              <div
                style={{ width: `${(r.v.cost / max) * 100}%`, height: 12, borderRadius: 6, background: i === 0 ? "#1677ff" : "#91caff" }}
              />
            </div>
          </div>
        );
      })}
      <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
        막대 길이는 비용입니다. 비용은 토큰 수를 요금 비율로 맞춘 값입니다. 오른쪽 숫자는 실제보다 얼마나 쌌는지(초록) 비쌌는지(빨강)입니다.
      </Paragraph>
    </div>
  );
}

export default function RetroReport({ data }: { data: RetroData }) {
  const { basis, measure: m } = data;
  const defects = data.defects ?? [];
  const maxStage = Math.max(1, ...m.byStage.map((s) => s.cost));
  const judges = Object.entries(
    m.segments.reduce<Record<string, number>>((a, s) => ((a[s.judge] = (a[s.judge] ?? 0) + 1), a), {})
  );

  // 고칠 곳: 판단별 fixes 와 제안(proposals)을 스킬·서버·사람으로 묶는다
  const groups: Record<RetroFix["where"], { title: string; target?: string; text?: string; from?: string; section?: string; evidence?: string[] }[]> = {
    스킬: [],
    서버: [],
    사람: [],
  };
  defects.forEach((d) => d.fixes?.forEach((f) => groups[f.where]?.push({ title: f.change, target: f.target, from: d.title })));
  data.proposals?.forEach((p) =>
    groups[PROPOSAL_WHERE[p.type ?? ""] ?? "스킬"].push({ title: p.title, target: p.target, text: p.text, section: p.section, evidence: p.evidence })
  );
  const hasFix = Object.values(groups).some((g) => g.length);

  return (
    <div style={{ marginTop: 12, maxWidth: 960 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        회고한 때: {basis.madeAt} · 그때 단계: {basis.phase} · 설계 변경 {basis.changes}번 · 검증 {basis.testRounds}번
      </Text>

      {data.summary && (
        <Alert
          type="info"
          showIcon
          style={{ margin: "12px 0" }}
          title="한눈에"
          description={<div style={{ whiteSpace: "pre-line" }}>{data.summary.replace(/([.!?])\s+/g, "$1\n")}</div>}
        />
      )}

      <Title level={4} style={{ marginTop: 20 }}>
        1. 잘못한 판단 {defects.length}건
      </Title>
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        이슈를 분석하고 진행하면서 잘못 판단한 곳입니다. 회색 띠는 일이 흘러간 단계입니다. 노란 점과 빨간 점 사이가 멀수록 늦게 잡은 것입니다.
      </Paragraph>
      {!defects.length && <Paragraph>잘못한 판단은 찾지 못했습니다.</Paragraph>}
      {defects.map((d, i) => (
        <Card key={d.title} size="small" style={{ marginBottom: 12 }} title={`${i + 1}. ${d.title}`}>
          <StageBand could={d.couldAt} found={d.foundAt} />
          {!retroStages(d.foundAt, d.couldAt).includes(d.foundAt) && (
            <Space size={6} wrap>
              <Tag>실제로 잡힌 곳: {d.foundAt}</Tag>
              {d.couldAt && <Tag color="gold">잡을 수 있었던 곳: {d.couldAt}</Tag>}
            </Space>
          )}
          {d.what ? (
            <>
              <Line icon="❌" label="무엇을 잘못 판단했나">
                {d.what}
              </Line>
              {d.why && (
                <Line icon="🔍" label="왜 그랬나">
                  {d.why}
                </Line>
              )}
              {d.prevent && (
                <Line icon="🛡️" label="다시 안 그러려면">
                  {d.prevent}
                </Line>
              )}
            </>
          ) : (
            d.judgment && (
              <Line icon="❌" label="잘못한 판단">
                {d.judgment}
              </Line>
            )
          )}
          {!!d.fixes?.length && (
            <Line icon="🔧" label="고칠 곳">
              {d.fixes.map((f, k) => (
                <span key={k} style={{ display: "block" }}>
                  <FixTag where={f.where} />
                  {f.change}
                  {f.target && (
                    <Text code style={{ fontSize: 12, marginLeft: 4 }}>
                      {f.target}
                    </Text>
                  )}
                </span>
              ))}
            </Line>
          )}
          {!!d.causes?.length && (
            <Space size={4} wrap style={{ marginTop: 8 }}>
              {d.causes.map((c) => (
                <Tag key={c} color="volcano">
                  {CAUSE_TEXT[c] ?? c}
                </Tag>
              ))}
            </Space>
          )}
          <Evidence list={d.evidence} />
        </Card>
      ))}

      {hasFix && (
        <>
          <Title level={4} style={{ marginTop: 24 }}>
            2. 고칠 곳
          </Title>
          <Row gutter={[12, 12]}>
            {(Object.keys(groups) as RetroFix["where"][])
              .filter((w) => groups[w].length)
              .map((w) => (
                <Col xs={24} key={w}>
                  <Card size="small" title={<span><FixTag where={w} />{WHERE_META[w].label} {groups[w].length}건</span>}>
                    <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 0 }}>
                      {WHERE_META[w].help}
                    </Paragraph>
                    {groups[w].map((g, k) => (
                      <div key={k} style={{ padding: "8px 0", borderTop: k ? "1px solid #f0f0f0" : undefined }}>
                        <Text strong>{g.title}</Text>
                        {g.target && (
                          <div style={{ fontSize: 12 }}>
                            <Text type="secondary">파일: </Text>
                            <Text code>{g.target}</Text>
                            {g.section && <Text type="secondary"> · {g.section}</Text>}
                          </div>
                        )}
                        {g.from && (
                          <div style={{ fontSize: 12 }}>
                            <Text type="secondary">이 판단 때문: {g.from}</Text>
                          </div>
                        )}
                        {g.text && (
                          <Paragraph copyable style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", background: "#fafafa", padding: 8, fontSize: 13 }}>
                            {g.text}
                          </Paragraph>
                        )}
                        <Evidence list={g.evidence} />
                      </div>
                    ))}
                  </Card>
                </Col>
              ))}
          </Row>
        </>
      )}

      <Title level={4} style={{ marginTop: 24 }}>
        {hasFix ? 3 : 2}. 토큰 사용
      </Title>
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        이 오더는 단계마다 세션을 새로 열거나, 앞 세션을 이어 썼습니다. 새로 열면 쌓인 대화를 다시 읽지 않아 쌉니다. 대신 처음 준비하는 데 시간과 비용이 듭니다. 어느 쪽이 나았는지 실제 기록으로 쟀습니다.
      </Paragraph>
      <Card size="small">
        <TokenBars data={data} />
      </Card>

      {!!data.sessionFindings?.length && (
        <>
          <Title level={5} style={{ marginTop: 16 }}>
            토큰에서 알게 된 것
          </Title>
          {data.sessionFindings.map((f) => (
            <Card key={f.title} size="small" style={{ marginBottom: 8 }} title={f.title} extra={f.impact ? `차이 ${man(f.impact)}` : null}>
              {f.why && <Paragraph style={{ margin: 0, whiteSpace: "pre-line" }}>{f.why}</Paragraph>}
              <Evidence list={f.evidence} />
            </Card>
          ))}
        </>
      )}

      {!!data.ruleProposals?.length && (
        <>
          <Title level={5} style={{ marginTop: 16 }}>
            세션 이어 쓰기 기준 제안
          </Title>
          {data.ruleProposals.map((p) => (
            <Card key={p.title} size="small" style={{ marginBottom: 8 }} title={p.title}>
              <Text code copyable>
                {p.value}
              </Text>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                <Text type="secondary">파일: </Text>
                <Text code>{p.target}</Text>
              </div>
              {p.why && <Paragraph style={{ margin: "6px 0 0" }}>{p.why}</Paragraph>}
              <Evidence list={p.evidence} />
            </Card>
          ))}
        </>
      )}

      <Collapse
        style={{ marginTop: 20 }}
        items={[
          {
            key: "detail",
            label: "자세한 숫자 보기 (단계별 비용, 전환 목록)",
            children: (
              <>
                <Paragraph type="secondary" style={{ fontSize: 12 }}>
                  캐시에서 다시 읽은 입력은 0.1배, 캐시에 새로 쓴 입력은 1.25배(1시간 캐시는 2배), 출력은 5배로 셉니다. 세션 {m.sessions}개를 쟀고, 기록을 못 찾은 세션은 {m.missing}개입니다. 새 세션은 보통 대화 {man(m.medians.start)}을 들고 시작했고, 첫 응답까지 {mins(m.medians.startup)} 걸렸습니다.
                </Paragraph>
                <Row gutter={[16, 16]}>
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
                        틀림은 반대로 골랐으면 {m.fastPct}% 이상 쌌던 전환입니다. 속도 손해는 비용은 비슷한데 반대로 골랐으면 더 빨랐던 전환입니다.
                      </Paragraph>
                    </Card>
                  </Col>
                </Row>
                <Table<RetroSegment>
                  style={{ marginTop: 12 }}
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
                    { title: "앞 세션과 간격", render: (_, s) => (s.gap != null && s.gap < 0 ? "겹침" : mins(s.gap)), width: 90 },
                    { title: "들고 시작한 대화", render: (_, s) => man(s.ctxStart), width: 100 },
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
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
