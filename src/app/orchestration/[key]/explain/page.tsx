import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import { getJobStatus } from "@/lib/jobs";
import ExplainerView from "@/components/ExplainerView";

export const dynamic = "force-dynamic";

export default function ExplainPage({ params }: { params: { key: string } }) {
  if (!ORDER_KEY_RE.test(params.key)) notFound();
  const epic = getEpic(params.key);
  const job = getJobStatus(`explain-${params.key}`);
  return (
    <ExplainerView
      epicKey={params.key}
      title={epic?.title ?? null}
      md={epic?.explainerMd ?? null}
      job={job.state === "none" ? null : { state: job.state, feed: job.feed }}
      mode={epic?.orchestration?.mode ?? null}
      worktreeRemoved={epic?.worktreeRemoved ?? false}
      hasJira={!!epic?.jiraIssueMd || isJiraIssueKey(params.key)}
    />
  );
}
