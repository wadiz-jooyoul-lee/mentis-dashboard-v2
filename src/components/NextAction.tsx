"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button, Popconfirm, Select, Space, Tag, Tooltip, Typography, message } from "antd";
import { BellFilled, ClockCircleOutlined, CopyOutlined, ExclamationCircleFilled } from "@ant-design/icons";
import { useCanAct } from "@/components/CanAct";
import { copyText } from "@/lib/clipboard";
import type { NextAction, NextGroup, NextItem } from "@/lib/nextAction";

const { Text } = Typography;

export type { NextItem };

// ── 판정 결과 공유 저장소 — 카드·목록·오더 띠가 한 번의 조회를 함께 쓴다 ──
/** at: 서버가 판정한 시각(ms). 0 이면 아직 모른다. */
type State = { items: NextItem[]; error: string | null; loaded: boolean; at: number };
let state: State = { items: [], error: null, loaded: false, at: 0 };
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
const POLL_MS = 30_000;

/** fresh 면 서버 저장분(20초)을 건너뛰고 지금 다시 판정한다. */
export async function refreshNextActions(fresh = false): Promise<void> {
  try {
    const r = await (await fetch(`/api/orders?next=1${fresh ? "&fresh=1" : ""}`, { cache: "no-store" })).json();
    state = { items: r.items ?? [], error: r.error ?? null, loaded: true, at: r.at ?? Date.now() };
  } catch {
    state = { ...state, loaded: true };
  }
  subs.forEach((f) => f());
}

function subscribe(f: () => void) {
  subs.add(f);
  if (!timer) {
    refreshNextActions();
    timer = setInterval(refreshNextActions, POLL_MS);
  }
  return () => {
    subs.delete(f);
    if (subs.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const EMPTY: State = { items: [], error: null, loaded: false, at: 0 };
export function useNextActions(): State {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

// ── 표시 ──
export const GROUP_LABEL: Record<NextGroup, { label: string; color: string }> = {
  mine: { label: "TODO", color: "volcano" },
  notice: { label: "알림", color: "cyan" },
  auto: { label: "자동 진행", color: "blue" },
  wait: { label: "기다림", color: "default" },
  work: { label: "작업 중", color: "purple" },
};

/** 목록 칸에서 태그 대신 아이콘으로 보이는 묶음 */
const GROUP_ICON: Partial<Record<NextGroup, React.ReactNode>> = {
  mine: <ExclamationCircleFilled style={{ color: "#fa541c" }} />,
  notice: <BellFilled style={{ color: "#13c2c2" }} />,
  wait: <ClockCircleOutlined style={{ color: "#8c8c8c" }} />,
};

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-10-27 08:20" → "10/27(화) 08:20 · 3시간 전" */
export function formatSince(since: string, now = Date.now()): string {
  const m = since.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const min = Math.round((now - d.getTime()) / 60000);
  const ago =
    min < 0 ? "예정" : min < 1 ? "방금" : min < 60 ? `${min}분 전` : min < 1440 ? `${Math.floor(min / 60)}시간 전` : `${Math.floor(min / 1440)}일 전`;
  return `${+m[2]}/${+m[3]}(${DAYS[d.getDay()]}) ${m[4]}:${m[5]} · ${ago}`;
}

/** 목록 칸용 — 묶음 표시와 한 줄 설명 */
export function NextActionTag({ item }: { item?: NextItem }) {
  if (!item) return <Text type="secondary">-</Text>;
  const g = GROUP_LABEL[item.group];
  const icon = GROUP_ICON[item.group];
  if (icon)
    return (
      <Tooltip title={[g.label, item.since && formatSince(item.since)].filter(Boolean).join(" · ")}>
        <Space size={6} align="start">
          {icon}
          <Text style={{ fontSize: 12 }}>{item.text}</Text>
        </Space>
      </Tooltip>
    );
  return (
    <Tooltip title={item.since ? formatSince(item.since) : undefined}>
      <Space orientation="vertical" size={2}>
        <Tag color={g.color} style={{ marginInlineEnd: 0 }}>
          {g.label}
        </Tag>
        <Text style={{ fontSize: 12 }}>{item.text}</Text>
      </Space>
    </Tooltip>
  );
}

const CONFIRM: Partial<Record<NextAction, { title: string; description: string; ok: string }>> = {
  approve: {
    title: "설계를 이대로 승인할까요?",
    description: "승인을 기록하고 구현부터 통합까지 자동 실행을 시작합니다. 통합 단계에서 작업 브랜치에 커밋하고 푸시합니다. TASK- 작업은 통합에서 PR 을 만들고 끝납니다.",
    ok: "이대로 승인",
  },
  autorun: {
    title: "자동 실행을 시작할까요?",
    description: "단계마다 새 세션을 띄워 이어서 진행합니다. 커밋과 푸시도 확인 없이 진행됩니다.",
    ok: "자동 실행",
  },
  drift: {
    title: "단계 밖 수정을 리뷰부터 다시 할까요?",
    description: "단계를 구현으로 돌리고 다음 리뷰 차수를 연 뒤 자동 실행을 시작합니다. 다시 구현하지 않고 들어온 수정만 리뷰합니다.",
    ok: "리뷰부터 다시",
  },
};

/** 버튼 묶음 — 동작 버튼, 명령 복사, 화면 링크, 오더 열기 */
export function NextActionControls({
  item,
  showOpen = false,
  onDone,
}: {
  item: NextItem;
  showOpen?: boolean;
  onDone?: () => void;
}) {
  const canAct = useCanAct();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [env, setEnv] = useState(item.env || "rc4");

  const post = async (action: NextAction, extra: Record<string, string> = {}) => {
    if (typeof Notification !== "undefined" && window.isSecureContext && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    setBusy(true);
    let res: { ok?: boolean; error?: string } = {};
    try {
      res = await (
        await fetch("/api/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ next: action, key: item.key, ...extra }),
        })
      ).json();
    } catch {
      /* 아래에서 실패로 알린다 */
    }
    setBusy(false);
    if (res.ok) {
      message.success(action === "resolve" ? "해결 처리를 시작했습니다." : "시작했습니다. 진행은 오더 콘솔에서 볼 수 있습니다.");
      onDone?.();
      refreshNextActions();
      router.refresh();
    } else {
      message.error(res.error === "already_running" ? "이미 실행 중입니다." : res.error || "요청에 실패했습니다.");
    }
  };

  const copy = async () => {
    if (await copyText(item.command || item.cmd)) message.success("명령을 복사했습니다. 터미널에 붙여넣으세요.");
    else message.error("복사하지 못했습니다");
  };

  /** 환경을 골라 배포·검증까지 자동으로 가는 버튼. action 은 deploy 또는 approve-deploy. */
  const deployControl = (action: NextAction, label: string, title: string, description: string, primary: boolean) => (
    <Space.Compact key={action} size="small">
      <Select size="small" value={env} onChange={setEnv} options={["dev", "rc1", "rc4"].map((v) => ({ value: v, label: v }))} />
      <Popconfirm title={title} description={description} okText={label} cancelText="취소" onConfirm={() => post(action, { env })}>
        <Button size="small" type={primary ? "primary" : "default"} loading={busy}>
          {label}
        </Button>
      </Popconfirm>
    </Space.Compact>
  );
  // 설계 확인·설계 확정·구현/리뷰 이어 가기에서는 통합까지만 갈지, 배포·검증까지 갈지 고른다.
  const withDeploy = item.kind === "design-confirm" || item.kind === "run-ready" || item.kind === "resume";

  const buttons: React.ReactNode[] = [];
  if (canAct && item.action === "deploy") {
    buttons.push(
      deployControl(
        "deploy",
        "자동 배포",
        `${env} 에 자동 배포할까요?`,
        "gh, argocd, 테스트 계정을 먼저 확인한 뒤 PR, 머지, 빌드, 배포, 검증까지 확인 없이 진행합니다.",
        true
      )
    );
  } else if (canAct && withDeploy && (item.action === "approve" || item.action === "autorun")) {
    const c = CONFIRM[item.action]!;
    const label = `${c.ok} (통합까지)`;
    // TASK- 작업은 배포하지 않고 통합에서 PR 을 만들고 끝난다.
    const isTask = item.key.startsWith("TASK-");
    buttons.push(
      <Popconfirm key="act" title={c.title} description={c.description} okText={label} cancelText="취소" onConfirm={() => post(item.action)}>
        <Button size="small" type="primary" loading={busy}>
          {label}
        </Button>
      </Popconfirm>,
      !isTask && deployControl(
        item.action === "approve" ? "approve-deploy" : "deploy",
        "배포·검증까지",
        item.action === "approve" ? `설계를 승인하고 ${env} 배포·검증까지 진행할까요?` : `${env} 배포·검증까지 진행할까요?`,
        `gh, argocd, 테스트 계정을 먼저 확인한 뒤 ${item.action === "approve" ? "승인을 기록하고 " : ""}구현, 리뷰, 통합, PR, 머지, 빌드, 배포, 검증까지 확인 없이 진행합니다.`,
        false
      )
    );
  } else if (canAct && item.action === "resolve") {
    buttons.push(
      <Popconfirm key="resolve" title="이 오더를 해결로 표시할까요?" okText="해결 처리" cancelText="취소" onConfirm={() => post("resolve")}>
        <Button size="small" type="primary" loading={busy}>
          해결 처리
        </Button>
      </Popconfirm>
    );
  } else if (canAct && item.action) {
    const c = CONFIRM[item.action];
    if (c) {
      buttons.push(
        <Popconfirm key="act" title={c.title} description={c.description} okText={c.ok} cancelText="취소" onConfirm={() => post(item.action)}>
          <Button size="small" type="primary" loading={busy}>
            {c.ok}
          </Button>
        </Popconfirm>
      );
    }
  }
  if (item.cmd) {
    buttons.push(
      <Tooltip key="cmd" title={item.command || item.cmd}>
        <Button size="small" type={buttons.length ? "default" : "primary"} icon={<CopyOutlined />} onClick={copy}>
          {item.cmd.split(" ")[0]} 명령 복사
        </Button>
      </Tooltip>
    );
  }
  if (item.link) {
    const external = /^https?:\/\//.test(item.link);
    buttons.push(
      <Button key="link" size="small" type={buttons.length ? "default" : "primary"} onClick={() => (external ? window.open(item.link, "_blank", "noopener,noreferrer") : router.push(item.link))}>
        {external ? "PR 열기" : item.link.startsWith("/releases") ? "릴리즈 화면 열기" : "열기"}
      </Button>
    );
  }
  if (showOpen) {
    buttons.push(
      <Button key="open" size="small" onClick={() => router.push(`/orchestration/${encodeURIComponent(item.key)}`)}>
        오더 열기
      </Button>
    );
  }
  return buttons.length ? <Space wrap size={6}>{buttons}</Space> : null;
}
