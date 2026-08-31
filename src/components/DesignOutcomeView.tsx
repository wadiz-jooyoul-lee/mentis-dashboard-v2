"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Collapse, Empty, Input, Space, Spin, Tag, Tooltip, message } from "antd";
import { EditOutlined, ReloadOutlined, SaveOutlined, CloseOutlined } from "@ant-design/icons";
import OrderHeader from "@/components/OrderHeader";
import MarkdownDoc from "@/components/MarkdownDoc";
import { useCanAct } from "@/components/CanAct";

const { TextArea } = Input;

type JobState = "none" | "running" | "done" | "failed" | "stopped";

/**
 * "설계/결과" 탭 — 한 페이지에 상단 설계(design.md)·하단 결과(outcome.md)를 접이식으로.
 *
 * 설계는 사용자가 직접 수정할 수 있는 유일한 메타 문서다. 편집 잠금 상태 기계:
 *   design-{키} 잡 실행 중 → 전체 잠금(생성 중…) — 잡이 같은 파일을 쓴다
 *   {키} 오더 잡 실행 중  → 편집 잠금 — 오케스트레이터가 설계를 갱신할 수 있다
 *   편집 중(dirty)         → 재생성 버튼 잠금 — 잡이 편집 내용을 덮어쓰는 사고 방지
 * 버튼 잠금은 UX이고, 서버(/api/orders/design)가 job_running·mtime 충돌을 다시 검사한다.
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
  designMtime,
  designJobState,
  orderRunning,
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
  designMtime: number | null;
  designJobState: JobState;
  orderRunning: boolean;
}) {
  const canAct = useCanAct();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobState, setJobState] = useState<JobState>(designJobState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generating = jobState === "running";
  const locked = generating || orderRunning;

  // 생성 잡이 도는 동안 3초마다 상태를 물어보고, 끝나면 새 내용을 자동으로 다시 불러온다.
  const poll = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/orders?jobResult=design-${encodeURIComponent(epicKey)}`, { cache: "no-store" });
        const d = await r.json();
        setJobState(d.state);
        if (d.state !== "running") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (d.state === "done") message.success("문서 생성 완료");
          if (d.state === "failed") message.error("생성이 중단되었습니다. 콘솔 로그를 확인하세요.");
          router.refresh();
        }
      } catch {
        /* 다음 턴에 재시도 */
      }
    }, 3000);
  }, [epicKey, router]);

  useEffect(() => {
    if (designJobState === "running") poll();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [designJobState, poll]);

  const generate = async (kind: "design" | "outcome", regen: boolean) => {
    setBusy(true);
    try {
      const r = await fetch("/api/orders/design", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: epicKey, generate: kind, regen }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setJobState("running");
        poll();
      } else {
        message.error(
          d?.error === "order_running"
            ? "오더가 실행 중이라 지금은 생성할 수 없습니다 (오케스트레이터가 문서를 관리 중)"
            : d?.error ?? "실행 실패",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async (force = false) => {
    setBusy(true);
    try {
      const r = await fetch("/api/orders/design", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: epicKey, save: true, content: draft, baseMtime: designMtime, force }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        message.success("설계 저장됨 — 구현이 이 수정본을 따릅니다");
        setEditing(false);
        router.refresh();
      } else if (d?.error === "conflict") {
        message.error("다른 곳에서 문서가 바뀌었습니다 — 새로고침해 확인하거나 '그래도 덮어쓰기'를 쓰세요");
      } else if (d?.error === "job_running") {
        message.error("생성 작업이 진행 중입니다 — 끝난 뒤 수정하세요");
      } else {
        message.error(d?.error ?? "저장 실패");
      }
    } finally {
      setBusy(false);
    }
  };

  // ── 설계 영역 ──
  const designExtra = canAct && !editing && (
    <Space onClick={(e) => e.stopPropagation()}>
      <Tooltip title={locked ? "실행 중에는 수정할 수 없습니다" : "설계 문서를 직접 수정 (수정본이 정본 — 구현이 이 내용을 따름)"}>
        <Button
          size="small"
          icon={<EditOutlined />}
          disabled={locked || !designMd}
          onClick={() => {
            setDraft(designMd ?? "");
            setEditing(true);
          }}
        >
          수정
        </Button>
      </Tooltip>
      <Tooltip title={locked ? "실행 중에는 재생성할 수 없습니다" : "산출물을 다시 읽어 재생성 (기존 문서는 design.md.bak으로 백업)"}>
        <Button size="small" icon={<ReloadOutlined />} loading={busy} disabled={locked} onClick={() => generate("design", !!designMd)}>
          {designMd ? "재생성" : "생성"}
        </Button>
      </Tooltip>
    </Space>
  );

  const designBody = generating ? (
    <div style={{ textAlign: "center", padding: 32 }}>
      <Spin /> <span style={{ marginLeft: 8 }}>문서 생성 중… (go-dobby dobby-design 실행)</span>
    </div>
  ) : editing ? (
    <Space orientation="vertical" size={8} style={{ width: "100%" }}>
      <TextArea value={draft} onChange={(e) => setDraft(e.target.value)} autoSize={{ minRows: 16, maxRows: 40 }} style={{ fontFamily: "monospace", fontSize: 13 }} />
      <Space>
        <Button type="primary" icon={<SaveOutlined />} loading={busy} onClick={() => save(false)}>
          저장
        </Button>
        <Button icon={<CloseOutlined />} onClick={() => setEditing(false)}>
          취소
        </Button>
        <Button danger size="small" loading={busy} onClick={() => save(true)}>
          그래도 덮어쓰기
        </Button>
      </Space>
    </Space>
  ) : designMd ? (
    <MarkdownDoc md={designMd} />
  ) : (
    <Empty description="설계 문서가 아직 없습니다">
      {canAct && (
        <Button type="primary" loading={busy} disabled={locked} onClick={() => generate("design", false)}>
          설계 문서 생성
        </Button>
      )}
    </Empty>
  );

  // ── 결과 영역 ──
  const outcomeExtra = canAct && (
    <span onClick={(e) => e.stopPropagation()}>
      <Tooltip title={locked ? "실행 중에는 생성할 수 없습니다" : "설계 대비 구현 결과를 생성 (아티팩트 문서의 근거)"}>
        <Button size="small" icon={<ReloadOutlined />} loading={busy} disabled={locked} onClick={() => generate("outcome", !!outcomeMd)}>
          {outcomeMd ? "재생성" : "생성"}
        </Button>
      </Tooltip>
    </span>
  );

  const outcomeBody = generating ? (
    <div style={{ textAlign: "center", padding: 32 }}>
      <Spin />
    </div>
  ) : outcomeMd ? (
    <MarkdownDoc md={outcomeMd} />
  ) : (
    <Empty description="구현 결과 문서가 아직 없습니다 (통합이 끝난 뒤 만들 수 있습니다)" />
  );

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
      {orderRunning && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 12 }}
          message="오더가 실행 중입니다 — 오케스트레이터가 설계를 갱신할 수 있어 편집이 잠깁니다."
        />
      )}
      <Collapse
        style={{ marginTop: 12 }}
        defaultActiveKey={["design", ...(outcomeMd ? ["outcome"] : [])]}
        items={[
          {
            key: "design",
            label: (
              <Space>
                설계 <Tag color="blue">구현 전 — 수정 가능</Tag>
              </Space>
            ),
            extra: designExtra,
            children: designBody,
          },
          {
            key: "outcome",
            label: (
              <Space>
                결과 <Tag color="green">구현 후 — 설계 대비</Tag>
              </Space>
            ),
            extra: outcomeExtra,
            children: outcomeBody,
          },
        ]}
      />
    </div>
  );
}
