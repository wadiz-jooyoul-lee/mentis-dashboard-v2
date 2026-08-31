import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import { getJobStatus } from "@/lib/jobs";
import DesignOutcomeView from "@/components/DesignOutcomeView";

export const dynamic = "force-dynamic";

export default async function DesignPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!ORDER_KEY_RE.test(key)) notFound();
  const epic = getEpic(key);
  if (!epic) notFound();
  return (
    <DesignOutcomeView
      epicKey={key}
      title={epic.title ?? null}
      resolved={epic.resolved ?? false}
      mode={epic.orchestration?.mode ?? null}
      worktreeRemoved={epic.worktreeRemoved ?? false}
      hasJira={!!epic.jiraIssueMd || isJiraIssueKey(key)}
      orderKind={epic.orderKind ?? null}
      designMd={epic.designMd}
      outcomeMd={epic.outcomeMd}
      designMtime={epic.designMtime}
      designJobState={getJobStatus(`design-${key}`).state}
      orderRunning={getJobStatus(key).state === "running"}
    />
  );
}
