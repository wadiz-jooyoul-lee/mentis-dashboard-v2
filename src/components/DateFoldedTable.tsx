"use client";

import { useEffect, useMemo, useState } from "react";
import { Collapse, Table, Empty, Pagination, Typography } from "antd";
import type { TableProps } from "antd";

const { Text } = Typography;

/** 한 페이지에 보여줄 날짜 그룹 수 기본값. */
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

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
 *
 * 오더가 쌓이면 날짜 그룹(패널) 자체가 계속 늘어나 화면이 길어지므로 **날짜 그룹 단위로 페이징**한다
 * (행 단위가 아니다 — 대부분의 날짜 그룹은 항목이 10개 미만이라 행 페이징은 효과가 없다).
 * 페이지 크기는 사용자가 바꿀 수 있고 `storageKey`를 주면 브라우저에 기억한다.
 *
 * `groupLabel`을 주면 날짜로 나누지 않고 그 라벨의 **단일 그룹**으로 묶어(기본 펼침) 보여준다
 * — 날짜별 목록과 동일한 폴드 스타일을 재사용하려는 용도(예: "작업중" 섹션). 이때는 페이징하지 않는다.
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
  pageSize: pageSizeProp,
  storageKey,
}: {
  items: T[];
  dateOf: (r: T) => string | null | undefined;
  columns: TableProps<T>["columns"];
  rowKey: TableProps<T>["rowKey"];
  onRowClick?: (r: T) => void;
  rowClassName?: TableProps<T>["rowClassName"];
  emptyText?: string;
  groupLabel?: string;
  /** 한 페이지에 보여줄 날짜 그룹 수(기본 10). 단일 그룹 모드에서는 무시된다. */
  pageSize?: number;
  /** 페이지 크기를 브라우저에 기억할 키. 없으면 기억하지 않는다. */
  storageKey?: string;
}) {
  const single = groupLabel != null;

  const { groups, keys } = useMemo(() => {
    const g = new Map<string, T[]>();
    if (single) {
      g.set(groupLabel!, items);
      return { groups: g, keys: [groupLabel!] };
    }
    for (const it of items) {
      const k = dayKey(dateOf(it));
      const arr = g.get(k);
      if (arr) arr.push(it);
      else g.set(k, [it]);
    }
    const ks = Array.from(g.keys()).sort((a, b) => {
      if (a === "날짜 미상") return 1;
      if (b === "날짜 미상") return -1;
      return b.localeCompare(a); // 최신 날짜 먼저
    });
    return { groups: g, keys: ks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, single, groupLabel]);

  // 페이지 크기: 저장된 값이 있으면 그것, 없으면 prop → 기본값.
  // localStorage는 클라이언트에서만 읽어 hydration 불일치를 피한다.
  const [pageSize, setPageSize] = useState(pageSizeProp ?? DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (!storageKey) return;
    try {
      const v = Number(window.localStorage.getItem(`dft:size:${storageKey}`));
      if (v > 0) setPageSize(v);
    } catch {
      /* 사생활 보호 모드 등 — 기본값으로 둔다 */
    }
  }, [storageKey]);

  const changeSize = (size: number) => {
    setPageSize(size);
    setPage(1);
    if (!storageKey) return;
    try {
      window.localStorage.setItem(`dft:size:${storageKey}`, String(size));
    } catch {
      /* 저장 못 해도 이번 화면에서는 적용된다 */
    }
  };

  const pageKeys = single ? keys : keys.slice((page - 1) * pageSize, page * pageSize);

  // 목록이 줄어 현재 페이지가 비면 마지막 페이지로 당긴다.
  useEffect(() => {
    const last = Math.max(1, Math.ceil(keys.length / pageSize));
    if (page > last) setPage(last);
  }, [keys.length, pageSize, page]);

  // 단일 그룹이면 그 그룹을 펼침. 날짜별이면 오늘 그룹만 기본 펼침(없으면 그 페이지의 최신).
  // new Date()는 클라이언트에서만 평가해 hydration 불일치 방지.
  const [active, setActive] = useState<string[]>([]);
  useEffect(() => {
    if (single) {
      setActive(keys);
      return;
    }
    // 현재 페이지에 펼쳐진 그룹이 하나도 없으면 그 페이지의 첫 그룹을 펼친다.
    setActive((prev) => {
      if (prev.some((k) => pageKeys.includes(k))) return prev;
      const today = ymd(new Date());
      return pageKeys.includes(today) ? [today] : pageKeys.length ? [pageKeys[0]] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKeys.join(","), single]);

  if (items.length === 0) {
    return <Empty description={emptyText ?? "데이터 없음"} />;
  }

  const panels = pageKeys.map((k) => ({
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

  // 그룹이 가장 작은 페이지 크기보다 많을 때만 페이징 컨트롤을 보인다.
  // (크기를 크게 바꿔 한 페이지가 되어도 다시 줄일 수 있도록 계속 표시한다.)
  const showPager = !single && keys.length > PAGE_SIZE_OPTIONS[0];

  return (
    <>
      <Collapse
        activeKey={active}
        onChange={(k) => setActive(Array.isArray(k) ? k : [k])}
        items={panels}
      />
      {showPager && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <Pagination
            size="small"
            current={page}
            pageSize={pageSize}
            total={keys.length}
            // 크기 변경도 onChange로 함께 들어온다(antd가 onShowSizeChange 뒤에 onChange를 부르며
            // 페이지를 다시 세팅해, 따로 처리하면 "1페이지로 되돌리기"가 덮어써진다).
            onChange={(p, size) => (size !== pageSize ? changeSize(size) : setPage(p))}
            showSizeChanger
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            showTotal={(t, [a, b]) => `날짜 ${a}–${b} / 전체 ${t}일`}
          />
        </div>
      )}
    </>
  );
}
