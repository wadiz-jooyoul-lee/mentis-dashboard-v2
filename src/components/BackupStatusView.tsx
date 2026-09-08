"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCanAct } from "@/components/CanAct";
import {
  Alert, Breadcrumb, Button, Card, Collapse, Space, Statistic, Tabs, Tag, Typography, message,
} from "antd";
import { ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import SessionBackupTable, { fmtBytes, type SessionArchive } from "@/components/SessionBackupTable";
import OrchestrationBackupTable, { type OrchArchive } from "@/components/OrchestrationBackupTable";
import InProgressBackupTable, { type InProgressArchive } from "@/components/InProgressBackupTable";

const { Title, Text, Paragraph } = Typography;

type Session = {
  archives: SessionArchive[];
  totalBytes: number;
  log: string;
  lastBackupAt: string | null;
  pending: number;
  running: boolean;
  dest: string;
};
type Folder = {
  archives: OrchArchive[];
  totalBytes: number;
  orders: number;
  missing: number;
  stale: number;
  running: boolean;
  log: string;
  dest: string;
  metaDir: string;
};
type InProgress = {
  archives: InProgressArchive[];
  totalBytes: number;
  today: string;
  has: { am: boolean; pm: boolean };
  dueSlot: "am" | "pm" | null;
  due: boolean;
  keepDays: number;
  dir: string;
  log: string;
};

type Health = "ok" | "warn" | "bad";
const HEALTH: Record<Health, { color: string; label: string }> = {
  ok: { color: "green", label: "정상" },
  warn: { color: "gold", label: "주의" },
  bad: { color: "red", label: "위험" },
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

const SLOT_LABEL = { am: "오전", pm: "오후" } as const;

export default function BackupStatusView({
  session,
  folder,
  inprogress,
  runLog,
}: {
  session: Session;
  folder: Folder;
  inprogress: InProgress;
  runLog: string;
}) {
  const canAct = useCanAct();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(session.running || folder.running);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetch("/api/backup", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/backup/orchestration", { cache: "no-store" }).then((r) => r.json()),
      ]);
      const still = !!a?.running || !!b?.running;
      setRunning(still);
      if (!still && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
        router.refresh();
      }
    } catch {
      /* 무시 */
    }
  }, [router]);

  useEffect(() => {
    if (running && !timer.current) timer.current = setInterval(poll, 3000);
    return () => {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
    };
  }, [running, poll]);

  const post = async (url: string, key: string, okMsg: string) => {
    setBusy(key);
    try {
      const r = await fetch(url, { method: "POST" });
      if (r.ok) {
        message.success(okMsg);
        setRunning(true);
        setTimeout(() => router.refresh(), 1500);
      } else {
        const d = await r.json().catch(() => null);
        message.error(d?.error || "실행 실패");
      }
    } finally {
      setBusy(null);
    }
  };

  // ── 건강 상태 판정 ────────────────────────────────────────────────
  const sessionAge = daysSince(session.lastBackupAt);
  const sessionHealth: Health =
    session.lastBackupAt == null || (sessionAge != null && sessionAge >= 7)
      ? "bad"
      : session.pending > 0
      ? "warn"
      : "ok";
  const folderHealth: Health =
    folder.orders > 0 && folder.archives.length === 0
      ? "bad"
      : folder.missing > 0 || folder.stale > 0
      ? "warn"
      : "ok";
  const inpHealth: Health =
    inprogress.archives.length === 0 ? "bad" : inprogress.due ? "warn" : "ok";

  // ── 손봐야 할 것 ──────────────────────────────────────────────────
  const issues: { text: string; action?: { label: string; url: string; key: string; msg: string } }[] = [];
  if (session.lastBackupAt == null) {
    issues.push({ text: "세션 전사 백업이 아직 없습니다.", action: { label: "지금 백업", url: "/api/backup", key: "s", msg: "백업을 시작했습니다" } });
  } else if (sessionAge != null && sessionAge >= 7) {
    issues.push({ text: `세션 전사 마지막 백업이 ${sessionAge}일 전입니다.`, action: { label: "지금 백업", url: "/api/backup", key: "s", msg: "백업을 시작했습니다" } });
  } else if (session.pending > 0) {
    issues.push({ text: `세션 전사 미백업 ${session.pending}개.`, action: { label: "지금 백업", url: "/api/backup", key: "s", msg: "백업을 시작했습니다" } });
  }
  if (folder.missing > 0) {
    issues.push({ text: `메타 폴더 ${folder.missing}개가 아직 백업되지 않았습니다.`, action: { label: "전체 백업", url: "/api/backup/orchestration", key: "f", msg: "전체 백업을 시작했습니다" } });
  }
  if (folder.stale > 0) {
    issues.push({ text: `메타 ${folder.stale}개가 백업 이후 변경되었습니다.`, action: { label: "전체 백업", url: "/api/backup/orchestration", key: "f", msg: "전체 백업을 시작했습니다" } });
  }
  if (inprogress.due && inprogress.dueSlot) {
    issues.push({
      text: `진행중 백업: 오늘 ${SLOT_LABEL[inprogress.dueSlot]} 회차가 없습니다.`,
      action: { label: "지금 실행", url: "/api/backup/orchestration/inprogress?manual=1", key: "i", msg: "진행중 백업을 시작했습니다" },
    });
  }
  if (inprogress.archives.length === 0) {
    issues.push({
      text: "진행중 백업이 아직 없습니다.",
      action: { label: "지금 실행", url: "/api/backup/orchestration/inprogress?manual=1", key: "i", msg: "진행중 백업을 시작했습니다" },
    });
  }

  const card = (
    title: string,
    health: Health,
    desc: string,
    stats: { label: string; value: React.ReactNode; warn?: boolean }[],
    action?: { label: string; url: string; key: string; msg: string },
  ) => (
    <Card size="small" style={{ flex: "1 1 260px", minWidth: 260 }}>
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <Space size={8} align="center">
          <Text strong>{title}</Text>
          <Tag color={HEALTH[health].color}>{HEALTH[health].label}</Tag>
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>{desc}</Text>
        <Space size={20} wrap>
          {stats.map((s) => (
            <Statistic
              key={s.label}
              title={s.label}
              value={s.value as string | number}
              valueStyle={{ fontSize: 15, color: s.warn ? "#d48806" : undefined }}
            />
          ))}
        </Space>
        {canAct && action ? (
          <Button
            size="small"
            icon={<SaveOutlined />}
            loading={busy === action.key}
            onClick={() => post(action.url, action.key, action.msg)}
          >
            {action.label}
          </Button>
        ) : null}
      </Space>
    </Card>
  );

  const restoreBlock = (title: string, note: string, cmd: string) => (
    <div style={{ marginBottom: 20 }}>
      <Text strong>{title}</Text>
      <Paragraph type="secondary" style={{ fontSize: 12, margin: "4px 0 6px" }}>{note}</Paragraph>
      <Paragraph copyable={{ text: cmd }} style={{ margin: 0 }}>
        <pre style={{ margin: 0, fontSize: 12, background: "#fafafa", padding: 10, borderRadius: 6, overflowX: "auto" }}>
          {cmd}
        </pre>
      </Paragraph>
    </div>
  );

  const logPane = (label: string, text: string) => ({
    key: label,
    label,
    children: (
      <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 360, overflow: "auto" }}>
        {text.trim() || "(로그 없음)"}
      </pre>
    ),
  });

  return (
    <div>
      <Breadcrumb style={{ marginBottom: 12 }} items={[{ title: <Link href="/">홈</Link> }, { title: "백업" }]} />
      <Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>백업</Title>
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        세 가지를 각각 지킵니다 — <Text strong>세션 전사</Text>(대화 기록),
        <Text strong> 메타 폴더별</Text>(해결된 작업의 문서·코드 변경 기록),
        <Text strong> 메타 진행중</Text>(아직 작업중인 폴더의 임시 스냅샷).
        {running ? <Tag color="processing" icon={<ReloadOutlined spin />} style={{ marginLeft: 8 }}>백업 중…</Tag> : null}
      </Paragraph>

      {issues.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="손봐야 할 것"
          description={
            <Space direction="vertical" size={4} style={{ width: "100%" }}>
              {issues.map((it, i) => (
                <Space key={i} size={8} wrap>
                  <Text>· {it.text}</Text>
                  {canAct && it.action ? (
                    <Button
                      size="small"
                      type="link"
                      loading={busy === it.action.key}
                      onClick={() => post(it.action!.url, it.action!.key, it.action!.msg)}
                      style={{ padding: 0 }}
                    >
                      {it.action.label}
                    </Button>
                  ) : null}
                </Space>
              ))}
            </Space>
          }
        />
      ) : (
        <Alert type="success" showIcon style={{ marginBottom: 16 }} message="세 가지 백업 모두 최신입니다." />
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {card(
          "세션 전사",
          sessionHealth,
          "~/.claude/projects 전체 백업 · 최신 1개",
          [
            { label: "마지막", value: sessionAge == null ? "없음" : sessionAge === 0 ? "오늘" : `${sessionAge}일 전` },
            { label: "미백업", value: `${session.pending}개`, warn: session.pending > 0 },
            { label: "용량", value: fmtBytes(session.totalBytes) },
          ],
          { label: "지금 백업", url: "/api/backup", key: "s", msg: "백업을 시작했습니다" },
        )}
        {card(
          "메타 · 폴더별",
          folderHealth,
          "해결 처리할 때 그 폴더만 갱신",
          [
            { label: "백업됨", value: `${folder.archives.length}/${folder.orders}` },
            { label: "변경됨", value: `${folder.stale}개`, warn: folder.stale > 0 },
            { label: "용량", value: fmtBytes(folder.totalBytes) },
          ],
          { label: "전체 백업", url: "/api/backup/orchestration", key: "f", msg: "전체 백업을 시작했습니다" },
        )}
        {card(
          "메타 · 진행중",
          inpHealth,
          `하루 두 회차 · ${inprogress.keepDays}일 보관`,
          [
            { label: "오늘 오전", value: inprogress.has.am ? "완료" : "—", warn: !inprogress.has.am && inprogress.dueSlot != null },
            { label: "오늘 오후", value: inprogress.has.pm ? "완료" : "—", warn: !inprogress.has.pm && inprogress.dueSlot === "pm" },
            { label: "보관", value: `${inprogress.archives.length}개` },
            { label: "용량", value: fmtBytes(inprogress.totalBytes) },
          ],
          { label: "지금 실행", url: "/api/backup/orchestration/inprogress?manual=1", key: "i", msg: "진행중 백업을 시작했습니다" },
        )}
      </div>

      <Tabs
        defaultActiveKey="folder"
        items={[
          {
            key: "session",
            label: `세션 전사 (${session.archives.length})`,
            children: (
              <>
                <Paragraph type="secondary" style={{ fontSize: 12 }}>
                  저장 위치: <Text code>{session.dest}</Text> · 매번 전체를 담고 최신 하나만 남깁니다. 바뀐 파일이 없으면 새로 만들지 않습니다.
                </Paragraph>
                <SessionBackupTable archives={session.archives} />
              </>
            ),
          },
          {
            key: "folder",
            label: `메타 · 폴더별 (${folder.archives.length})`,
            children: (
              <>
                <Paragraph type="secondary" style={{ fontSize: 12 }}>
                  저장 위치: <Text code>{folder.dest}</Text> · 원본: <Text code>{folder.metaDir}</Text> ·
                  화면 확인용 이미지는 담지 않습니다.
                </Paragraph>
                <OrchestrationBackupTable archives={folder.archives} />
              </>
            ),
          },
          {
            key: "inprogress",
            label: `메타 · 진행중 (${inprogress.archives.length})`,
            children: (
              <>
                <Paragraph type="secondary" style={{ fontSize: 12 }}>
                  저장 위치: <Text code>{inprogress.dir}</Text> · 해결·종료되지 않은 폴더만 모아 한 파일로 담습니다.
                  오전 10시 이후·오후 3시 이후에 대시보드가 열려 있으면 자동으로 채워집니다.
                </Paragraph>
                <InProgressBackupTable archives={inprogress.archives} today={inprogress.today} />
              </>
            ),
          },
          {
            key: "restore",
            label: "복원",
            children: (
              <div style={{ maxWidth: 760 }}>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="바로 덮어쓰지 마십시오"
                  description="복원은 지금 파일을 덮어쓸 수 있습니다. 임시 폴더에 먼저 풀어 확인한 뒤 옮기는 순서를 권합니다. 아래 명령은 복사해서 터미널에서 실행하십시오."
                />
                {restoreBlock(
                  "① 무엇이 들었는지 먼저 보기 (풀지 않음)",
                  "아카이브 안의 파일 목록만 출력합니다.",
                  `zstd -dc {아카이브} | tar -tf -`,
                )}
                {restoreBlock(
                  "② 임시 폴더에 풀어 확인",
                  "원본을 건드리지 않고 내용을 살펴봅니다.",
                  `mkdir -p /tmp/orch-restore\ntar -xf {아카이브} -C /tmp/orch-restore`,
                )}
                {restoreBlock(
                  "③ 확인 후 제자리로 — 메타 백업 (폴더별 · 진행중)",
                  "아카이브 안의 경로가 메타 루트 기준이라 그대로 들어갑니다.",
                  `rsync -a /tmp/orch-restore/ ${folder.metaDir}/`,
                )}
                {restoreBlock(
                  "③ 확인 후 제자리로 — 세션 전사",
                  "아카이브 하나에 전부 들어 있어 이것만 풀면 됩니다.",
                  `tar -xf {아카이브} -C ~/.claude/projects`,
                )}
                <Alert
                  type="warning"
                  showIcon
                  message="진행중 백업은 그 시점 스냅샷입니다"
                  description="아직 작업중인 폴더를 담은 것이라, 지금 폴더보다 오래된 내용일 수 있습니다. ②단계 비교를 반드시 거치십시오."
                />
              </div>
            ),
          },
          {
            key: "log",
            label: "로그",
            children: (
              <Collapse
                defaultActiveKey={["메타 · 폴더별 (backup-log.txt)"]}
                items={[
                  logPane("메타 · 폴더별 (backup-log.txt)", folder.log),
                  logPane("메타 · 진행중 (inprogress-log.txt)", inprogress.log),
                  logPane("스크립트 실행 출력 (backup-run.log)", runLog),
                  logPane("세션 전사 (backup-log.txt)", session.log),
                ]}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
