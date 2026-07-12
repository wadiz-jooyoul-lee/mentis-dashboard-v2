"use client";

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
 */
export default function DateFoldedTable<T extends object>({
  items,
  dateOf,
  columns,
  rowKey,
  onRowClick,
  emptyText,
}: {
  items: T[];
  dateOf: (r: T) => string | null | undefined;
  columns: TableProps<T>["columns"];
  rowKey: TableProps<T>["rowKey"];
  onRowClick?: (r: T) => void;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <Empty description={emptyText ?? "데이터 없음"} />;
  }

  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = dayKey(dateOf(it));
    const arr = groups.get(k);
    if (arr) arr.push(it);
    else groups.set(k, [it]);
  }

  const keys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "날짜 미상") return 1;
    if (b === "날짜 미상") return -1;
    return b.localeCompare(a); // 최신 날짜 먼저
  });

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

  return <Collapse defaultActiveKey={[keys[0]]} items={panels} />;
}
