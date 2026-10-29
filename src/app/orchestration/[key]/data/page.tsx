import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import { getJobStatus } from "@/lib/jobs";
import { readDataOrder } from "@/lib/data";
import { notFound } from "next/navigation";
import DataTabView from "@/components/DataTabView";

export const dynamic = "force-dynamic";

export default async function DataPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!ORDER_KEY_RE.test(key)) notFound();
  const epic = getEpic(key);
  const job = (id: string) => {
    const s = getJobStatus(id);
    return s.state === "none" ? null : { state: s.state, feed: s.feed };
  };
  return (
    <DataTabView
      epicKey={key}
      header={{
        title: epic?.title ?? null,
        mode: epic?.orchestration?.mode ?? null,
        worktreeRemoved: epic?.worktreeRemoved ?? false,
        resolved: epic?.resolved ?? false,
        hasJira: epic?.hasJiraDoc || isJiraIssueKey(key),
        hasDesign: epic?.hasDesignDoc ?? false,
        hasQa: !!epic?.qa,
        orderKind: epic?.orderKind ?? null,
      }}
      target={isJiraIssueKey(key) && (epic?.resolved ?? false)}
      data={readDataOrder(key)}
      share={epic?.artifactShares.find((s) => s.slug === "data") ?? null}
      specJob={job(`data-spec-${key}`)}
      runJob={job(`data-${key}`)}
    />
  );
}
