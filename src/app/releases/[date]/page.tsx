import { notFound } from "next/navigation";
import { getRelease } from "@/lib/releases";
import ReleaseView from "@/components/ReleaseView";

export const dynamic = "force-dynamic";

export default async function ReleasePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const release = getRelease(date);
  if (!release) notFound();
  return <ReleaseView release={release} />;
}
