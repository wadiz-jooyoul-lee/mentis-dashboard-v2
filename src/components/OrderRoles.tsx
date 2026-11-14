"use client";

import { createContext, useContext } from "react";

/**
 * 이 오더에 켜진 담당자(상태 문서의 담당자 줄). 오더 화면의 레이아웃이 한 번 읽어 내려 주고,
 * 공통 머리(OrderHeader)가 탭을 고르는 데 쓴다. 줄이 없는 오더는 null 이라 탭이 지금까지와 같다.
 */
const OrderRolesContext = createContext<string[] | null>(null);

export function OrderRolesProvider({ roles, children }: { roles: string[] | null; children: React.ReactNode }) {
  return <OrderRolesContext.Provider value={roles}>{children}</OrderRolesContext.Provider>;
}

export function useOrderRoles(): string[] | null {
  return useContext(OrderRolesContext);
}
