"use client";

import { useEffect, useState } from "react";
import { Collapse, Table, Empty, Typography } from "antd";
import type { TableProps } from "antd";

const { Text } = Typography;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** 다양한 날짜 문자열에서 YYYY-MM-DD 그룹 키를 뽑는다. */
function dayKey(v: string | null | undefined): string {
  if (!v) return "날짜 미상";
  if (/T\d|Z$/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return ymd(d);
  }
  const m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(v);
  return isNaN(d.getTime()) ? "날짜 미상" : ymd(d);
}

/**
 * 항목을 날짜별로 묶어 접이식(Collapse)으로 보여준다.
 * 최신 날짜 그룹이 맨 위이며 기본으로 펼쳐진다.
 * `groupLabel`을 주면 날짜로 나누지 않고 그 라벨의 **단일 그룹**으로 묶어(기본 펼침) 보여준다
 * — 날짜별 목록과 동일한 폴드 스타일을 재사용하려는 용도(예: "작업중" 섹션).
 */
export default function DateFoldedTable<T extends object>({
  items,
  dateOf,
  columns,
  rowKey,
  onRowClick,
  rowClassName,
  emptyText,
  groupLabel,
}: {
  items: T[];
  dateOf: (r: T) => string | null | undefined;
  columns: TableProps<T>["columns"];
  rowKey: TableProps<T>["rowKey"];
  onRowClick?: (r: T) => void;
  rowClassName?: TableProps<T>["rowClassName"];
  emptyText?: string;
  groupLabel?: string;
}) {
  const single = groupLabel != null;

  const groups = new Map<string, T[]>();
  if (single) {
    groups.set(groupLabel!, items);
  } else {
    for (const it of items) {
      const k = dayKey(dateOf(it));
      const arr = groups.get(k);
      if (arr) arr.push(it);
      else groups.set(k, [it]);
    }
  }

  const keys = single
    ? [groupLabel!]
    : Array.from(groups.keys()).sort((a, b) => {
        if (a === "날짜 미상") return 1;
        if (b === "날짜 미상") return -1;
        return b.localeCompare(a); // 최신 날짜 먼저
      });

  // 단일 그룹이면 그 그룹을 펼침. 날짜별이면 오늘 그룹만 기본 펼침(없으면 최신).
  // new Date()는 클라이언트에서만 평가해 hydration 불일치 방지.
  const [active, setActive] = useState<string[]>([]);
  useEffect(() => {
    if (single) {
      setActive(keys);
      return;
    }
    const today = ymd(new Date());
    setActive(keys.includes(today) ? [today] : keys.length ? [keys[0]] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join(",")]);

  if (items.length === 0) {
    return <Empty description={emptyText ?? "데이터 없음"} />;
  }

  const panels = keys.map((k) => ({
    key: k,
    label: (
      <span>
        <Text strong>{k}</Text>{" "}
        <Text type="secondary">({groups.get(k)!.length})</Text>
      </span>
    ),
    children: (
      <Table<T>
        rowKey={rowKey}
        columns={columns}
        dataSource={groups.get(k)}
        pagination={false}
        size="middle"
        scroll={{ x: "max-content" }}
        rowClassName={rowClassName}
        onRow={
          onRowClick
            ? (r) => ({
                onClick: () => onRowClick(r),
                style: { cursor: "pointer" },
              })
            : undefined
        }
      />
    ),
  }));

  return (
    <Collapse
      activeKey={active}
      onChange={(k) => setActive(Array.isArray(k) ? k : [k])}
      items={panels}
    />
  );
}
