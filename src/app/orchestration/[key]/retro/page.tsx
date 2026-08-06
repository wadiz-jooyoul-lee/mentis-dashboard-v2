import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import { getJobStatus } from "@/lib/jobs";
import { notFound } from "next/navigation";
import RetroView from "@/components/RetroView";

export const dynamic = "force-dynamic";

export default function RetroPage({ params }: { params: { key: string } }) {
  if (!ORDER_KEY_RE.test(params.key)) notFound();
  const epic = getEpic(params.key);
  const job = getJobStatus(`retro-${params.key}`);
  return (
    <RetroView
      epicKey={params.key}
      title={epic?.title ?? null}
      md={epic?.retroMd ?? null}
      job={job.state === "none" ? null : { state: job.state, feed: job.feed }}
      mode={epic?.orchestration?.mode ?? null}
      worktreeRemoved={epic?.worktreeRemoved ?? false}
      resolved={epic?.resolved ?? false}
      hasJira={!!epic?.jiraIssueMd || isJiraIssueKey(params.key)}
      orderKind={epic?.orderKind ?? null}
    />
  );
}
