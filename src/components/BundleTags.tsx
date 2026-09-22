"use client";

import { useEffect, useState } from "react";
import { Tag, Tooltip, Skeleton } from "antd";
import type { Bundle, BundleReport } from "@/lib/bundles";

/** 번들마다 고정 색. 색만 보고 어느 번들인지 알아보게 한다. */
const COLOR: Record<Bundle, string> = {
  global: "blue",
  account: "purple",
  static: "green",
  studio: "orange",
  "app-api": "cyan",
  "wadiz-web": "volcano",
};

/**
 * 태그 묶음을 감싸는 틀. 옅은 판 위에 올려 옆의 "에이전트 소개"와 한 덩어리로 섞이지 않게 한다.
 * 자리표시와 본 태그가 같은 자리를 차지하도록 양쪽에 똑같이 쓴다.
 */
const GROUP: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  marginRight: 12,
  padding: "2px 8px",
  borderRadius: 6,
  background: "#fafafa",
  border: "1px solid #f0f0f0",
};

/**
 * 오더 제목 옆에 "테스트하려면 어느 번들을 다시 배포해야 하나"를 보여 준다.
 *
 * 판정에 git·grep 이 들어가 1.5초쯤 걸리므로 **본문을 막지 않게** 따로 불러온다.
 * 결과가 오기 전에는 좁은 자리표시만 두어 제목 줄이 흔들리지 않게 한다.
 */
export default function BundleTags({ epicKey }: { epicKey: string }) {
  const [report, setReport] = useState<BundleReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/bundles/${epicKey}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: BundleReport) => alive && setReport(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [epicKey]);

  if (failed) return null;
  if (!report)
    return (
      <span style={GROUP}>
        <Skeleton.Button active size="small" style={{ width: 56, height: 20 }} />
      </span>
    );
  // 변경 파일을 못 찾은 경우(브랜치 정리·커밋 없음)는 조용히 아무것도 안 그린다.
  if (report.unknown || report.impacts.length === 0) return null;

  return (
    <span style={GROUP}>
      {report.impacts.map((i) => (
        <Tooltip
          key={i.bundle}
          title={
            <span>
              {i.direct
                ? `이 번들 폴더의 파일을 고쳤습니다 (닿는 변경 ${i.count}개)`
                : `공유 코드를 거쳐 닿습니다 (${i.count}개)`}
              <br />
              {i.reasons.map((r) => (
                <span key={r} style={{ display: "block" }}>
                  {shorten(r)}
                </span>
              ))}
              {i.count > i.reasons.length && `외 ${i.count - i.reasons.length}개`}
            </span>
          }
        >
          {/* 직접 고친 번들은 색을 채우고, 공유 코드 탓은 점선 테두리만 남긴다.
              옆의 숫자가 닿는 변경 파일 수 — 1이면 스치기만 한 것이라 사람이 걸러 볼 만하다. */}
          <Tag
            color={COLOR[i.bundle]}
            style={
              i.direct
                ? { margin: 0 }
                : { margin: 0, background: "transparent", borderStyle: "dashed" }
            }
          >
            {i.bundle} <span style={{ opacity: 0.65 }}>{i.count}</span>
          </Tag>
        </Tooltip>
      ))}
    </span>
  );
}

/** 경로가 길어 툴팁이 넘친다. 가운데를 접어 맨 앞 두 칸과 파일 이름만 남긴다. */
function shorten(p: string): string {
  const parts = p.split("/");
  if (parts.length <= 4) return p;
  return `${parts[0]}/${parts[1]}/…/${parts[parts.length - 1]}`;
}
