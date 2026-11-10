"use client";

import { Collapse, Tag, Typography } from "antd";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PlanField, PlanScenario, TestPlan } from "@/lib/testPlan";
import "./markdown.css";
import "./testPlan.css";

const { Text } = Typography;

const PASS_LABELS = new Set(["통과 기준", "기대", "기대 결과", "판정 기준"]);
const FAIL_LABELS = new Set(["실패로 보는 것"]);
const DEV_LABELS = new Set(["진입 근거", "관련 파일"]);

function Md({ children }: { children: string }) {
  return (
    <div className="markdown-body tp-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function Rows({ fields }: { fields: PlanField[] }) {
  if (fields.length === 0) return null;
  return (
    <dl className="tp-rows">
      {fields.map((f, i) => (
        <div key={i} className="tp-row">
          <dt>{f.label}</dt>
          <dd>{f.body ? <Md>{f.body}</Md> : <Text type="secondary">—</Text>}</dd>
        </div>
      ))}
    </dl>
  );
}

function ScenarioBody({ s }: { s: PlanScenario }) {
  const pass = s.fields.filter((f) => PASS_LABELS.has(f.label));
  const fail = s.fields.filter((f) => FAIL_LABELS.has(f.label));
  const dev = s.fields.filter((f) => DEV_LABELS.has(f.label));
  const main = s.fields.filter(
    (f) => !PASS_LABELS.has(f.label) && !FAIL_LABELS.has(f.label) && !DEV_LABELS.has(f.label)
  );
  return (
    <div className="tp-scenario">
      <Rows fields={main} />
      {pass.map((f, i) => (
        <div key={`p${i}`} className="tp-box tp-pass">
          <div className="tp-box-title">✅ {f.label}</div>
          <Md>{f.body}</Md>
        </div>
      ))}
      {fail.map((f, i) => (
        <div key={`f${i}`} className="tp-box tp-fail">
          <div className="tp-box-title">❌ {f.label}</div>
          <Md>{f.body}</Md>
        </div>
      ))}
      {s.extra && <Md>{s.extra}</Md>}
      {dev.length > 0 && (
        <details className="tp-dev">
          <summary>개발자 참고 ({dev.map((f) => f.label).join(", ")})</summary>
          <Rows fields={dev} />
        </details>
      )}
    </div>
  );
}

/** 검증 탭: 설계 때 만든 테스트 계획(test-plan.md). 바깥 칸과 시나리오마다 접고 펼 수 있다. */
export default function TestPlanView({ plan, defaultOpen }: { plan: TestPlan; defaultOpen: boolean }) {
  const prep = plan.sections.length > 0 && (
    <Collapse
      size="small"
      items={
        plan.scenarios.length > 0
          ? [
              {
                key: "prep",
                label: <Text strong>{plan.sections.map((s) => s.title).join(" · ")}</Text>,
                children: plan.sections.map((sec, i) => (
                  <div key={i} className="tp-section">
                    <div className="tp-section-title">{sec.title}</div>
                    <Md>{sec.body}</Md>
                  </div>
                )),
              },
            ]
          : // 시나리오 표기가 없는 옛 계획은 제목마다 칸을 나눈다.
            plan.sections.map((sec, i) => ({
              key: String(i),
              label: <Text strong>{sec.title}</Text>,
              children: <Md>{sec.body}</Md>,
            }))
      }
    />
  );

  const scenarios = plan.scenarios.length > 0 && (
    <Collapse
      size="small"
      items={plan.scenarios.map((s, i) => ({
        key: String(i),
        label: (
          <span>
            <Tag color="blue" className="tp-id">
              {s.id}
            </Tag>
            {s.title}
          </span>
        ),
        extra: (
          <span onClick={(e) => e.stopPropagation()}>
            {s.conds.map((c) => (
              <Tag key={c} color="purple">
                {c}
              </Tag>
            ))}
            {s.bundles.map((b) => (
              <Tag key={b}>{b}</Tag>
            ))}
          </span>
        ),
        children: <ScenarioBody s={s} />,
      }))}
    />
  );

  return (
    <Collapse
      style={{ marginBottom: 16 }}
      defaultActiveKey={defaultOpen ? ["plan"] : []}
      items={[
        {
          key: "plan",
          label: <Text strong>설계된 테스트 케이스</Text>,
          extra: (
            <Text type="secondary">
              {plan.scenarios.length > 0
                ? `시나리오 ${plan.scenarios.length}개`
                : `항목 ${plan.sections.length}개`}
            </Text>
          ),
          children: (
            <div className="tp-wrap">
              {prep}
              {scenarios}
            </div>
          ),
        },
      ]}
    />
  );
}
