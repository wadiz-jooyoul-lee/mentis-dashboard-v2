"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * 실행·변경 버튼을 보여줄지(= 이 화면이 대시보드가 실행 중인 맥에서 열렸는지).
 *
 * 판정은 서버(/api/lan의 canToggle = isSelfRequest)가 하고, 여기서는 결과만 받아
 * 화면 전체에 공유한다. 진짜 방어는 각 API의 denyRemote 가드다 — 이 값은 눌러봤자
 * 403인 버튼을 처음부터 숨기는 용도.
 *
 * 로딩 중 기본값은 true다: 대부분 로컬 사용자라 버튼이 깜빡이며 나타나는 것을 피한다.
 * 외부 화면에서는 잠깐 보였다 사라질 수 있지만 눌러도 서버가 막는다.
 * (외부 + 공개 중이면 /api/lan 자체가 프록시에서 403 → canToggle 없음 → false.)
 */
const Ctx = createContext(true);

export function CanActProvider({ children }: { children: React.ReactNode }) {
  const [canAct, setCanAct] = useState(true);
  useEffect(() => {
    fetch("/api/lan")
      .then((r) => r.json())
      .then((d) => setCanAct(!!d?.canToggle))
      .catch(() => setCanAct(false));
  }, []);
  return <Ctx.Provider value={canAct}>{children}</Ctx.Provider>;
}

/** true = 실행·변경 가능(이 맥). false = 읽기 전용(다른 기기에서 열람 중). */
export function useCanAct(): boolean {
  return useContext(Ctx);
}
