import OrderDetailSkeleton from "@/components/OrderDetailSkeleton";

// 콘솔은 /orchestration/console/[key] 로 라우트 분기가 달라 loading.tsx가 따로 필요하다.
export default function Loading() {
  return <OrderDetailSkeleton />;
}
