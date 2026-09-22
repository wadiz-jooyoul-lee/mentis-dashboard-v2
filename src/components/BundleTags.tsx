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
  if (!report) return <Skeleton.Button active size="small" style={{ width: 64, height: 22 }} />;
  // 변경 파일을 못 찾은 경우(브랜치 정리·커밋 없음)는 조용히 아무것도 안 그린다.
  if (report.unknown || report.impacts.length === 0) return null;

  return (
    <>
      {report.impacts.map((i) => (
        <Tooltip
          key={i.bundle}
          title={
            <span>
              {i.direct ? "이 번들 소스를 직접 고쳤습니다" : "공유 패키지를 고쳐 영향을 받습니다"}
              <br />
              {i.reasons.slice(0, 6).join(" · ")}
              {i.reasons.length > 6 && ` 외 ${i.reasons.length - 6}`}
            </span>
          }
        >
          {/* 직접 고친 번들은 색을 채우고, 공유 패키지 탓은 테두리만 남긴다.
              후자는 실제로는 영향이 없을 수 있어 사람이 걸러야 한다. */}
          <Tag
            color={COLOR[i.bundle]}
            style={
              i.direct
                ? { margin: 0 }
                : { margin: 0, background: "transparent", borderStyle: "dashed" }
            }
          >
            {i.bundle}
          </Tag>
        </Tooltip>
      ))}
    </>
  );
}
