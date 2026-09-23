"use client";

import { Button, Card, Space, Typography, Table, Tag } from "antd";
import { PictureOutlined } from "@ant-design/icons";
import type { TestSummary, ItemLine, ConditionLine } from "@/lib/testSummary";
import type { Verdict } from "@/lib/parseReport";

const { Title, Text } = Typography;

const TONE = { pass: "#52c41a", fail: "#ff4d4f", skip: "#bfbfbf" } as const;
const LABEL: Record<Verdict, string> = {
  pass: "통과",
  fail: "실패",
  skip: "보류",
  warn: "주의",
  unknown: "-",
};

function toneOf(v: Verdict): string {
  return v === "pass" ? TONE.pass : v === "fail" ? TONE.fail : TONE.skip;
}

/**
 * 검증 탭의 기본 화면 — 회차를 전부 모아 "무엇을 확인했나"로 보여 준다.
 *
 * 회차 하나만 보면 재실행에서 무엇이 달라졌는지 알 수 없다. 항목별로 어느 회차에서
 * 봤는지, 판정이 바뀌었는지까지 함께 보여 사람이 완성 여부를 판단할 재료를 준다.
 */
/**
 * 해결 조건 한 줄 — 이 조건을 어느 시나리오가 확인했고 그 결과가 무엇인지.
 *
 * 확인한 시나리오가 없으면 "확인한 시나리오 없음"이라고 **드러내 놓고** 적는다.
 * 조용히 빼면 "다 됐다"로 읽힌다 — 그게 이 화면이 막으려는 것이다.
 */
function ConditionRow({ cond }: { cond: ConditionLine }) {
  const none = cond.items.length === 0;
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "baseline",
        padding: "7px 0",
        borderTop: "1px solid #f5f5f5",
      }}
    >
      <Tag
        color={none ? undefined : toneOf(cond.verdict)}
        style={{ margin: 0, background: "transparent", minWidth: 40, textAlign: "center" }}
      >
        {cond.id}
      </Tag>
      <Text style={{ flex: 1 }}>{cond.text}</Text>
      <Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        {none ? "확인한 시나리오 없음" : cond.items.join("·")}
      </Text>
      <Text
        style={{ fontSize: 12, width: 52, textAlign: "right", color: none ? undefined : toneOf(cond.verdict) }}
        type={none ? "secondary" : undefined}
      >
        {none ? "미확인" : LABEL[cond.verdict]}
      </Text>
    </div>
  );
}

export default function TestSummaryView({
  summary,
  epicKey,
}: {
  summary: TestSummary;
  epicKey: string;
}) {
  const { runs, items, pass, fail, skip, closing, conditions } = summary;
  const met = conditions.filter((c) => c.verdict === "pass").length;
  const bar = [
    { n: pass, c: TONE.pass },
    { n: fail, c: TONE.fail },
    { n: skip, c: TONE.skip },
  ].filter((x) => x.n > 0);

  const stat = (n: number, label: string, color?: string) => (
    <div
      style={{
        flex: 1,
        minWidth: 92,
        padding: "14px 16px",
        background: "#fafafa",
        borderRadius: 8,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, color }}>{n}</div>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Text>
    </div>
  );

  return (
    <Space orientation="vertical" size={24} style={{ width: "100%" }}>
      {/* 한 줄 판정 + 집계 */}
      <Card
        styles={{ body: { padding: "20px 24px" } }}
        style={{
          borderColor: fail > 0 ? "#ffccc7" : "#f0f0f0",
          background: fail > 0 ? "#fff8f7" : "#fafffa",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
          <span
            style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1, color: fail > 0 ? TONE.fail : TONE.pass }}
          >
            {fail > 0 ? `실패 ${fail}건` : "테스트 완료"}
          </span>
          <Text type="secondary">
            {runs.length}회차에 걸쳐 {items.length}가지를 확인했습니다
          </Text>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {stat(pass, "통과", TONE.pass)}
          {stat(fail, "실패", fail > 0 ? TONE.fail : undefined)}
          {stat(skip, "보류")}
          {stat(runs.length, "회차")}
        </div>
        <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginTop: 16 }}>
          {bar.map((x, i) => (
            <div key={i} style={{ flex: x.n, background: x.c }} />
          ))}
        </div>
      </Card>

      {(closing || conditions.length > 0) && (
        <div>
          <Title level={4} style={{ marginTop: 0, marginBottom: 8 }}>
            닫히는 조건
            {conditions.length > 0 && (
              <Text
                style={{
                  marginLeft: 10,
                  fontSize: 14,
                  fontWeight: 400,
                  color: met === conditions.length ? TONE.pass : undefined,
                }}
              >
                {conditions.length}가지 중 {met}가지 확인
              </Text>
            )}
          </Title>
          {closing && <Text>{closing}</Text>}

          {conditions.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              {conditions.map((c) => (
                <ConditionRow key={c.id} cond={c} />
              ))}
            </div>
          ) : (
            // 조건을 쪼개 적지 않은 오더 — 화면이 셀 수 있는 것이 없다.
            <div style={{ marginTop: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                이 조건이 충족됐는지는 아래 확인한 항목과 대조해 사람이 판단합니다.
              </Text>
            </div>
          )}
        </div>
      )}

      {/* 회차 */}
      <div>
        <Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>
          회차 {runs.length}회
        </Title>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={runs}
          columns={[
            { title: "회차", dataIndex: "no", width: 72, render: (n: number) => `${n}회차` },
            ...(runs.some((r) => r.env)
              ? [{ title: "환경", dataIndex: "env", width: 96 }]
              : []),
            { title: "시각", dataIndex: "label", width: 168 },
            {
              title: "결과",
              key: "r",
              render: (_: unknown, r: (typeof runs)[number]) => (
                <Text style={{ color: r.fail > 0 ? TONE.fail : TONE.pass }}>
                  {r.pass} / {r.fail} / {r.skip}
                </Text>
              ),
            },
            // 마감할 때 브라우저에 띄웠던 요약 화면. 회차 폴더에 남아 있으면 다시 볼 수 있다.
            ...(runs.some((r) => r.hasSummary)
              ? [
                  {
                    title: "요약 화면",
                    key: "s",
                    width: 110,
                    render: (_: unknown, r: (typeof runs)[number]) =>
                      r.hasSummary ? (
                        <Button
                          type="link"
                          size="small"
                          icon={<PictureOutlined />}
                          href={`/api/orders/${epicKey}/run-summary?run=${encodeURIComponent(r.id)}`}
                          target="_blank"
                          style={{ padding: 0 }}
                        >
                          보기
                        </Button>
                      ) : (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          —
                        </Text>
                      ),
                  },
                ]
              : []),
          ]}
        />
      </div>

      {/* 항목 */}
      <div>
        <Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>
          확인한 항목 {items.length}가지
        </Title>
        <Table<ItemLine>
          rowKey={(r) => r.num || r.name}
          size="small"
          pagination={false}
          dataSource={items}
          columns={[
            ...(items.some((i) => i.num)
              ? [{ title: "#", dataIndex: "num", width: 56 }]
              : []),
            { title: "확인 항목", dataIndex: "name" },
            {
              title: "회차",
              dataIndex: "runs",
              width: 110,
              render: (r: number[]) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {r.join("·")}회차
                </Text>
              ),
            },
            {
              title: "판정",
              key: "v",
              width: 132,
              render: (_: unknown, it: ItemLine) =>
                it.changed ? (
                  // 회차마다 달랐으면 흐름을 보여 준다 — 재실행에서 고쳐진 것이 드러난다.
                  <Text style={{ fontSize: 12 }}>
                    {it.changed.map((v) => LABEL[v]).join(" → ")}
                  </Text>
                ) : (
                  <Tag color={toneOf(it.verdict)} style={{ margin: 0, background: "transparent" }}>
                    {LABEL[it.verdict]}
                  </Tag>
                ),
            },
          ]}
          expandable={{
            rowExpandable: (r) => !!r.note,
            expandedRowRender: (r) => (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {r.note}
              </Text>
            ),
          }}
        />
      </div>
    </Space>
  );
}
