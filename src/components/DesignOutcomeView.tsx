"use client";

import { useState } from "react";
import { Empty, Segmented } from "antd";
import OrderHeader from "@/components/OrderHeader";
import StyledDoc from "@/components/doc/StyledDoc";

type Doc = "design" | "outcome";

/**
 * "설계/결과" 탭 — 설계(design.md)와 결과(outcome.md)를 전환 단추로 골라 본다. 결과가 있으면 결과부터.
 * 두 문서는 오더(dobby-order·/do)가 직접 쓰므로 이 화면은 읽기만 한다.
 */
export default function DesignOutcomeView({
  epicKey,
  title,
  resolved,
  mode,
  worktreeRemoved,
  hasJira,
  orderKind,
  designMd,
  outcomeMd,
}: {
  epicKey: string;
  title: string | null;
  resolved: boolean;
  mode: string | null;
  worktreeRemoved: boolean;
  hasJira: boolean;
  orderKind?: "development" | "deliverable" | "summary" | null;
  designMd: string | null;
  outcomeMd: string | null;
}) {
  const [doc, setDoc] = useState<Doc>(outcomeMd ? "outcome" : "design");
  const md = doc === "design" ? designMd : outcomeMd;
  return (
    <div>
      <OrderHeader
        epicKey={epicKey}
        title={title}
        mode={mode}
        worktreeRemoved={worktreeRemoved}
        resolved={resolved}
        hasJira={hasJira}
        hasDesign
        orderKind={orderKind}
      />
      <Segmented<Doc>
        style={{ marginTop: 16 }}
        value={doc}
        onChange={setDoc}
        options={[
          { value: "design", label: "설계 · 구현 전" },
          { value: "outcome", label: "결과 · 구현 후", disabled: !outcomeMd },
        ]}
      />
      {md ? (
        // 문서를 바꾸면 목차·현재 위치 계산을 새로 시작한다.
        <StyledDoc key={doc} md={md} idPrefix={doc} />
      ) : (
        <Empty
          style={{ marginTop: 40 }}
          description={
            doc === "design"
              ? "설계 문서가 아직 없습니다"
              : "구현 결과 문서가 아직 없습니다 (오더가 통합을 마치면 만들어집니다)"
          }
        />
      )}
    </div>
  );
}
