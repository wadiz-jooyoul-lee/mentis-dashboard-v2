"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Space, Tag, Tooltip, Typography } from "antd";
import { isBlocking, parseReview, type ReviewFinding, type Severity } from "@/lib/reviewCards";
import "./markdown.css";

const { Text } = Typography;

const SEVERITY: Record<Severity, { label: string; color: string; border: string; help: string }> = {
  blocker: { label: "막는 지적 · blocker", color: "red", border: "#ff4d4f", help: "고치기 전에는 다음 단계로 가지 못합니다." },
  major: { label: "막는 지적 · major", color: "volcano", border: "#fa541c", help: "고치기 전에는 다음 단계로 가지 못합니다." },
  minor: { label: "가벼운 지적 · minor", color: "gold", border: "#faad14", help: "고치면 좋지만 다음 단계를 막지는 않습니다." },
  nit: { label: "사소한 지적 · nit", color: "default", border: "#d9d9d9", help: "취향에 가까운 의견입니다." },
};

function Md({ md }: { md: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </div>
  );
}

/** "설계와 구현" 줄 — 누가 이어받는지를 가르는 사실이라 카드 머리에 눈에 띄게 둔다. */
function FitTag({ f }: { f: ReviewFinding }) {
  if (!f.fitText) return null;
  const next = !isBlocking(f.severity)
    ? ""
    : f.fit === "same"
      ? "기획자가 설계를 다시 봅니다"
      : f.fit === "diff"
        ? "만든 담당자가 고칩니다"
        : "";
  return (
    <Tooltip
      title={
        f.fit === "same"
          ? "설계대로 만들었는데 결함이 있습니다. 설계를 고쳐야 풀립니다."
          : f.fit === "diff"
            ? "설계가 정한 것과 다르게 만들었습니다."
            : undefined
      }
    >
      <Tag color={f.fit === "same" ? "purple" : f.fit === "diff" ? "blue" : "default"} style={{ margin: 0 }}>
        설계와 구현: {f.fitText}
        {next && ` → ${next}`}
      </Tag>
    </Tooltip>
  );
}

function Finding({ f }: { f: ReviewFinding }) {
  const s = SEVERITY[f.severity];
  return (
    <div
      data-review-card={f.severity}
      style={{
        border: "1px solid #f0f0f0",
        borderLeft: `4px solid ${s.border}`,
        borderRadius: 6,
        padding: "10px 12px",
        background: "#fff",
      }}
    >
      <Space size={[6, 6]} wrap align="center" style={{ marginBottom: f.body ? 6 : 0 }}>
        <Tooltip title={s.help}>
          <Tag color={s.color} style={{ margin: 0 }}>
            {s.label}
          </Tag>
        </Tooltip>
        <Text strong>{f.title || "(제목 없음)"}</Text>
        <FitTag f={f} />
      </Space>
      {f.body && <Md md={f.body} />}
    </div>
  );
}

/**
 * 리뷰 결과 한 파일. 지적을 카드로 나눠 무게와 "설계와 구현" 줄을 머리에 보인다.
 * 카드 형식이 아닌 리뷰(지적 머리글이 없는 파일)는 원래 마크다운 그대로 그린다.
 */
export default function ReviewCards({ md }: { md: string }) {
  const doc = parseReview(md);
  if (!doc) return <Md md={md} />;
  const n = (sev: Severity) => doc.findings.filter((f) => f.severity === sev).length;
  const blocking = doc.findings.filter((f) => isBlocking(f.severity)).length;
  const toPlanner = doc.findings.filter((f) => isBlocking(f.severity) && f.fit === "same").length;
  return (
    <Space orientation="vertical" size={10} style={{ width: "100%" }}>
      <Space size={[6, 6]} wrap>
        <Tag color={blocking ? "red" : "green"} style={{ margin: 0 }}>
          {blocking ? `막는 지적 ${blocking}건` : "막는 지적 없음"}
        </Tag>
        {(["blocker", "major", "minor", "nit"] as const).map((sev) =>
          n(sev) ? (
            <Tag key={sev} style={{ margin: 0 }}>
              {sev} {n(sev)}
            </Tag>
          ) : null
        )}
        {toPlanner > 0 && (
          <Tag color="purple" style={{ margin: 0 }}>
            설계를 다시 봐야 하는 지적 {toPlanner}건
          </Tag>
        )}
      </Space>
      {doc.blocks.map((b, i) => (b.type === "finding" ? <Finding key={i} f={b} /> : <Md key={i} md={b.md} />))}
    </Space>
  );
}
