"use client";

import { Card, Space, Typography, Table, Tag } from "antd";
import type { TestSummary, ItemLine } from "@/lib/testSummary";
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
export default function TestSummaryView({ summary }: { summary: TestSummary }) {
  const { runs, items, pass, fail, skip, closing } = summary;
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

      {closing && (
        <div>
          <Title level={4} style={{ marginTop: 0, marginBottom: 8 }}>
            닫히는 조건
          </Title>
          <Text>{closing}</Text>
          <div style={{ marginTop: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              이 조건이 충족됐는지는 아래 확인한 항목과 대조해 사람이 판단합니다.
            </Text>
          </div>
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
