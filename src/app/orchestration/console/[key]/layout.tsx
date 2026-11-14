import { OrderRolesProvider } from "@/components/OrderRoles";
import { readOrderRoles } from "@/lib/orderRoles";

export const dynamic = "force-dynamic";

/** 오더 화면 공통 — 켜진 담당자를 한 번 읽어 머리(탭 구성)에 내려 준다. 화면 모양은 바꾸지 않는다. */
export default async function OrderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return <OrderRolesProvider roles={readOrderRoles(key)}>{children}</OrderRolesProvider>;
}
