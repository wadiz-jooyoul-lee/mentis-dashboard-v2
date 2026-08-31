"use client";

import { useCanAct } from "@/components/CanAct";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, Space, Tag, Button, Typography, message } from "antd";
import { CloudUploadOutlined, SaveOutlined, CheckCircleOutlined, RightOutlined } from "@ant-design/icons";

const { Text } = Typography;

type Status = {
  lastBackupAt: string | null;
  pending: number;
  running: boolean;
  buttonThreshold: number;
  autoThreshold: number;
};

function fmt(iso: string | null): string {
  if (!iso) return "없음";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "없음";
  return d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * 홈 상단 백업 상태 카드.
 * - 마지막 백업 시각 + 미백업(마지막 백업 이후 새/수정) 세션 수 표시.
 * - 미백업 ≥ 버튼임계(10): "백업하기" 버튼 노출(수동).
 * - 미백업 ≥ 자동임계(20): 페이지 진입 시 1회 백그라운드 자동 백업.
 */
export default function BackupStatus({ initial = null }: { initial?: Status | null }) {
  const canAct = useCanAct();
  const [st, setSt] = useState<Status | null>(initial);
  const [busy, setBusy] = useState(false);
  const autoFired = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/backup", { cache: "no-store" });
      setSt(await r.json());
    } catch {
      /* 무시 */
    }
  }, []);

  const run = useCallback(
    async (auto: boolean) => {
      setBusy(true);
      try {
        const r = await fetch("/api/backup", { method: "POST" });
        if (r.ok) {
          if (!auto) message.success("백업을 시작했습니다");
          await load();
        } else if (!auto) {
          message.error("백업 시작 실패");
        }
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  // 최초 로드
  useEffect(() => {
    load();
  }, [load]);

  // 자동 백업(진입 시 1회): 미백업이 자동임계 이상이고 진행 중이 아니면.
  useEffect(() => {
    if (!st || autoFired.current) return;
    if (!st.running && st.pending >= st.autoThreshold) {
      autoFired.current = true;
      run(true);
    }
  }, [st, run]);

  // 진행 중이면 폴링(끝나면 최종 상태 반영).
  useEffect(() => {
    if (st?.running) {
      timer.current = setInterval(load, 3000);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
  }, [st?.running, load]);

  if (!st) return null;

  const showButton = st.pending >= st.buttonThreshold;
  const upToDate = st.pending === 0;

  return (
    <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: "10px 16px" } }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Space size={12} wrap>
          <Space size={6}>
            <CloudUploadOutlined style={{ color: "#8c8c8c" }} />
            <Text strong>세션 백업</Text>
          </Space>
          <Text type="secondary">마지막 백업: {fmt(st.lastBackupAt)}</Text>
          {st.running ? (
            <Tag color="processing">백업 중…</Tag>
          ) : upToDate ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>최신</Tag>
          ) : (
            <Tag color={showButton ? "warning" : "default"}>미백업 {st.pending}개</Tag>
          )}
        </Space>
        <Space size={8}>
          {canAct && showButton && !st.running && (
            <Button type="primary" size="small" icon={<SaveOutlined />} loading={busy} onClick={() => run(false)}>
              백업하기
            </Button>
          )}
          <Link href="/backup" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            목록·히스토리 <RightOutlined style={{ fontSize: 10 }} />
          </Link>
        </Space>
      </div>
      {st.pending >= st.autoThreshold && st.running && (
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
          미백업이 {st.autoThreshold}개를 넘어 자동으로 백업하고 있습니다.
        </Text>
      )}
    </Card>
  );
}
