"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Popconfirm, Space, Tag, Tooltip, Typography, message } from "antd";
import { CopyOutlined, QuestionCircleFilled } from "@ant-design/icons";
import { useCanAct } from "@/components/CanAct";
import MarkdownDoc from "@/components/MarkdownDoc";
import { formatSince, useNextActions, useNextPost, type NextItem } from "@/components/NextAction";
import { copyText } from "@/lib/clipboard";
import type { AskInfo, AskKind } from "@/lib/nextAction";

const { Text } = Typography;

/** 머리의 "답을 기다리는 중" 버튼과 알림 카드가 이 카드로 내려올 때 쓰는 자리 이름 */
export const ORDER_QUESTION_ID = "order-question";

const KIND_LABEL: Record<AskKind, string> = {
  yesno: "예 / 아니오",
  choice: "하나 고르기",
  input: "글로 적기",
  action: "직접 해 주기",
};
const KIND_HEAD: Record<AskKind, string> = {
  yesno: "결정이 필요합니다",
  choice: "결정이 필요합니다",
  input: "알려 주실 것이 있습니다",
  action: "직접 해 주실 일이 있습니다",
};

const CARD_STYLE: React.CSSProperties = {
  margin: "16px 0",
  borderColor: "#ffbb96",
  background: "#fffaf5",
  // 위에 붙어 있는 오더 머리(제목·탭)에 가리지 않게 내려와 멈춘다.
  scrollMarginTop: 240,
};
const PRE: React.CSSProperties = { whiteSpace: "pre-wrap", wordBreak: "break-word" };

/** 칸 하나 — 작은 이름과 그 아래 내용 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text type="secondary" strong style={{ fontSize: 12 }}>
        {label}
      </Text>
      <div style={{ marginTop: 2, paddingInlineStart: 12 }}>{children}</div>
    </div>
  );
}

/** 답하는 방식 넷의 입력창. send 는 답으로 저장될 값을 보낸다. */
function AskAnswer({ ask, busy, send }: { ask: AskInfo; busy: boolean; send: (value: string) => void }) {
  const [text, setText] = useState("");
  const isNew = ask.v >= 2;
  const sendText = () => {
    const v = text.trim();
    if (v) send(v);
  };

  if (ask.kind === "yesno") {
    return (
      <Space wrap size={6}>
        {["예", "아니오"].map((c, i) => (
          <Popconfirm key={c} title={`"${c}"로 답할까요?`} okText={c} cancelText="취소" onConfirm={() => send(c)}>
            <Button size="small" type={i === 0 ? "primary" : "default"} loading={busy}>
              {c}
            </Button>
          </Popconfirm>
        ))}
      </Space>
    );
  }

  if (ask.kind === "choice" && isNew && ask.options.length > 0) {
    return (
      <Space orientation="vertical" size={6} style={{ width: "100%" }}>
        <Space wrap size={6}>
          {ask.options.map((o) => (
            <Popconfirm
              key={o.label}
              title={`"${o.label}"(으)로 답할까요?`}
              description={<div style={{ maxWidth: 360 }}>{o.effect || o.does}</div>}
              okText="이 방법으로"
              cancelText="취소"
              onConfirm={() => send(o.label)}
            >
              <Button size="small" type={o.recommended ? "primary" : "default"} loading={busy}>
                {o.label}
                {o.recommended ? " (권장)" : ""}
              </Button>
            </Popconfirm>
          ))}
        </Space>
        <Space.Compact style={{ width: "100%", maxWidth: 560 }}>
          <Input
            size="small"
            placeholder="다른 의견 — 다른 방법을 원하시면 여기에 적어 주세요"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPressEnter={sendText}
            disabled={busy}
          />
          <Button size="small" loading={busy} disabled={!text.trim()} onClick={sendText}>
            다른 의견 보내기
          </Button>
        </Space.Compact>
      </Space>
    );
  }

  if (ask.kind === "choice") {
    // 옛 형식의 하나 고르기는 선택지 안의 값만 받는다.
    return (
      <Space wrap size={6}>
        {ask.choices
          .filter((c) => c !== "멈추기")
          .map((c, i) => (
            <Button key={c} size="small" type={i === 0 ? "primary" : "default"} loading={busy} onClick={() => send(c)}>
              {c}
            </Button>
          ))}
      </Space>
    );
  }

  if (ask.kind === "action") {
    return (
      <Tooltip
        title={
          ask.hasCheck
            ? ask.waiting
              ? "됐는지 1분마다 저절로 확인합니다. 누르면 지금 다시 확인합니다."
              : "누르면 자동 실행을 다시 시작해 됐는지 확인하고 이어 갑니다."
            : undefined
        }
      >
        <Button size="small" type="primary" loading={busy} onClick={() => send("했어요")}>
          {isNew ? "했습니다" : "했어요"}
        </Button>
      </Tooltip>
    );
  }

  // 글로 적기
  if (!isNew) {
    return (
      <Input.Search
        size="small"
        placeholder="값을 적어 주세요"
        enterButton="보내기"
        loading={busy}
        style={{ width: 260 }}
        onSearch={(v) => v.trim() && send(v.trim())}
      />
    );
  }
  return (
    <Space orientation="vertical" size={6} style={{ width: "100%", maxWidth: 560 }}>
      <Input.TextArea
        placeholder="여기에 적어 주세요"
        autoSize={{ minRows: 2, maxRows: 8 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
      />
      <Button size="small" type="primary" loading={busy} disabled={!text.trim()} onClick={sendText}>
        보내기
      </Button>
    </Space>
  );
}

/** 할 일 글. 직접 해 주기면 명령을 복사할 수 있게 그린다("터미널에서 실행: 명령" 꼴이면 명령만 복사한다). */
function Todo({ ask }: { ask: AskInfo }) {
  if (!ask.todo) return null;
  if (ask.kind === "action")
    return (
      <Text style={{ fontSize: 13 }} code copyable={{ text: ask.todo.replace(/^[^:]*:\s*/, "") }}>
        {ask.todo}
      </Text>
    );
  return <Text style={{ fontSize: 13, ...PRE }}>{ask.todo}</Text>;
}

/** 질문 카드 — 새 형식은 일곱 칸(질문·무슨 일·왜·해 본 것·방법·답하는 방식·답한 뒤)을 차례로, 옛 형식은 있는 칸만 보여 준다. */
function AskCard({ item, ask }: { item: NextItem; ask: AskInfo }) {
  const canAct = useCanAct();
  const { busy, post } = useNextPost(item);
  const send = (value: string) => post("ask", { value });
  const isNew = ask.v >= 2;
  const how =
    KIND_LABEL[ask.kind] + (ask.kind === "choice" && ask.choices.length ? ` (${ask.choices.filter((c) => c !== "멈추기").join(" / ")})` : "");

  return (
    <Card
      id={ORDER_QUESTION_ID}
      size="small"
      style={CARD_STYLE}
      title={
        <Space size={8}>
          <QuestionCircleFilled style={{ color: "#fa541c" }} />
          <span>
            {item.key} · {KIND_HEAD[ask.kind]}
          </span>
        </Space>
      }
      extra={
        <Text type="secondary" style={{ fontSize: 12 }}>
          {[`${ask.from}의 질문`, formatSince(item.since || ask.created)].filter(Boolean).join(" · ")}
        </Text>
      }
    >
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Field label="질문">
          <Text strong style={{ fontSize: 16, ...PRE }}>
            {ask.title}
          </Text>
        </Field>

        {isNew && (
          <Field label="무슨 일이 있었나">
            <Text style={PRE}>{ask.what || "적힌 내용이 없습니다."}</Text>
          </Field>
        )}

        {(isNew || ask.why) && (
          <Field label={isNew ? "왜 스스로 정하지 못했나" : "이유"}>
            <Text style={PRE}>{ask.why || "적힌 내용이 없습니다."}</Text>
          </Field>
        )}

        {isNew && (
          <Field label="지금까지 해 본 것">
            {ask.tried.length ? (
              <ol style={{ margin: 0, paddingInlineStart: 20 }}>
                {ask.tried.map((t, i) => (
                  <li key={i} style={PRE}>
                    {t}
                  </li>
                ))}
              </ol>
            ) : (
              <Text>적힌 내용이 없습니다.</Text>
            )}
          </Field>
        )}

        {isNew && (
          <Field label="방법">
            {ask.options.length ? (
              <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                {ask.options.map((o) => (
                  <div key={o.label}>
                    <Space size={6} align="start" wrap>
                      <Text strong>{o.label}.</Text>
                      <Text style={PRE}>{o.does}</Text>
                      {o.recommended && <Tag color="volcano">권장</Tag>}
                    </Space>
                    {o.effect && (
                      <div style={{ paddingInlineStart: 20 }}>
                        <Text type="secondary" style={PRE}>
                          고르면: {o.effect}
                        </Text>
                      </div>
                    )}
                    {o.recommended && o.reason && (
                      <div style={{ paddingInlineStart: 20 }}>
                        <Text type="secondary" style={PRE}>
                          권하는 이유: {o.reason}
                        </Text>
                      </div>
                    )}
                  </div>
                ))}
              </Space>
            ) : (
              <Text>
                {ask.kind === "yesno"
                  ? "고를 방법이 따로 없습니다. 위 질문에 예 또는 아니오로 답해 주세요."
                  : ask.kind === "action"
                    ? "고를 방법이 따로 없습니다. 아래 할 일을 직접 해 주세요."
                    : "고를 방법이 따로 없습니다. 아래 칸에 적어 주세요."}
              </Text>
            )}
          </Field>
        )}

        <Field label={isNew ? `답하는 방식: ${how}` : "답하기"}>
          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            <Todo ask={ask} />
            {ask.note && (
              <Text type="warning" style={{ fontSize: 12 }}>
                {ask.note}
              </Text>
            )}
            {canAct ? (
              <AskAnswer ask={ask} busy={busy} send={send} />
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                읽기 전용 화면입니다. 답은 대시보드가 실행 중인 맥에서 할 수 있습니다.
              </Text>
            )}
          </Space>
        </Field>

        {(isNew || !ask.waiting) && (
          <Field label="답한 뒤">
            <Space orientation="vertical" size={2}>
              {ask.after && <Text style={PRE}>{ask.after}</Text>}
              <Text type="secondary" style={{ fontSize: 12 }}>
                {ask.waiting
                  ? "자동 실행이 답을 기다리고 있습니다. 답하면 1분 안에 읽고 이어 갑니다."
                  : "자동 실행이 멈춰 있습니다. 답하면 자동 실행을 다시 시작해 이어 갑니다."}
              </Text>
            </Space>
          </Field>
        )}

        {canAct && ask.waiting && (
          <div>
            <Popconfirm
              title="자동 실행을 멈출까요?"
              description="질문에 답하지 않고 자동 실행을 끝냅니다."
              okText="멈추기"
              cancelText="취소"
              onConfirm={() => send("멈추기")}
            >
              <Button size="small" danger loading={busy}>
                답하지 않고 멈추기
              </Button>
            </Popconfirm>
          </div>
        )}
      </Space>
    </Card>
  );
}

/** 옛 오더의 판단 요청(단계가 보류) — 설계 문서에 적힌 "확인이 필요했던 것"을 보여 주고 터미널 명령을 건넨다. */
function DecisionCard({ item }: { item: NextItem }) {
  const copy = async () => {
    if (await copyText(item.command || item.cmd)) message.success("명령을 복사했습니다. 터미널에 붙여넣으세요.");
    else message.error("복사하지 못했습니다");
  };
  return (
    <Card
      id={ORDER_QUESTION_ID}
      size="small"
      style={CARD_STYLE}
      title={
        <Space size={8}>
          <QuestionCircleFilled style={{ color: "#fa541c" }} />
          <span>{item.key} · 판단이 필요합니다</span>
        </Space>
      }
      extra={
        item.since ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatSince(item.since)}
          </Text>
        ) : null
      }
    >
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Text>스스로 정할 수 없는 일이 있어 멈춰 있습니다. 아래 내용을 보고 터미널에서 답해 주세요.</Text>
        <Field label="확인이 필요했던 것">
          <MarkdownDoc md={item.detail} bare />
        </Field>
        {item.cmd && (
          <Field label="답하는 방식: 터미널에서 답하기">
            <Space size={8} wrap>
              <Text code>{item.cmd}</Text>
              <Tooltip title={item.command || item.cmd}>
                <Button size="small" type="primary" icon={<CopyOutlined />} onClick={copy}>
                  명령 복사
                </Button>
              </Tooltip>
            </Space>
          </Field>
        )}
      </Space>
    </Card>
  );
}

/**
 * 오더 화면 본문 맨 위의 질문 카드. 이 오더에 답을 기다리는 질문이 있으면 질문을, 옛 판단 요청이 있으면 그 내용을 그린다.
 * 없으면 아무것도 그리지 않는다. 다음 할 일 판정(알림 카드·머리 버튼과 같은 조회)을 함께 쓴다.
 */
export default function OrderQuestion({ epicKey }: { epicKey: string }) {
  const { items } = useNextActions();
  const item = items.find((i) => i.key === epicKey);
  const shown = item?.kind === "ask" && item.ask ? "ask" : item?.kind === "decision" && item.detail ? "decision" : null;

  // 알림 카드의 "질문 보고 답하기"로 들어왔으면(#order-question) 카드가 그려진 뒤 그 자리로 내려간다.
  useEffect(() => {
    if (shown && window.location.hash === `#${ORDER_QUESTION_ID}`) {
      document.getElementById(ORDER_QUESTION_ID)?.scrollIntoView({ block: "start" });
    }
  }, [shown]);

  if (!item || !shown) return null;
  return shown === "ask" && item.ask ? <AskCard item={item} ask={item.ask} /> : <DecisionCard item={item} />;
}
