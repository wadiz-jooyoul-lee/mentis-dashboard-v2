import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import { getJobStatus } from "@/lib/jobs";
import ExplainerView from "@/components/ExplainerView";

export const dynamic = "force-dynamic";

export default async function ExplainPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!ORDER_KEY_RE.test(key)) notFound();
  const epic = getEpic(key);
  const job = getJobStatus(`explain-${key}`);
  return (
    <ExplainerView
      epicKey={key}
      title={epic?.title ?? null}
      resolved={epic?.resolved ?? false}
      md={epic?.explainerMd ?? null}
      job={job.state === "none" ? null : { state: job.state, feed: job.feed }}
      mode={epic?.orchestration?.mode ?? null}
      worktreeRemoved={epic?.worktreeRemoved ?? false}
      hasJira={!!epic?.jiraIssueMd || isJiraIssueKey(key)}
      orderKind={epic?.orderKind ?? null}
    />
  );
}
