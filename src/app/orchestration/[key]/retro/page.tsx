import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import { getJobStatus } from "@/lib/jobs";
import { notFound } from "next/navigation";
import RetroView from "@/components/RetroView";

export const dynamic = "force-dynamic";

export default async function RetroPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!ORDER_KEY_RE.test(key)) notFound();
  const epic = getEpic(key);
  const job = getJobStatus(`retro-${key}`);
  return (
    <RetroView
      epicKey={key}
      title={epic?.title ?? null}
      md={epic?.retroMd ?? null}
      job={job.state === "none" ? null : { state: job.state, feed: job.feed }}
      mode={epic?.orchestration?.mode ?? null}
      worktreeRemoved={epic?.worktreeRemoved ?? false}
      resolved={epic?.resolved ?? false}
      hasJira={!!epic?.jiraIssueMd || isJiraIssueKey(key)}
      orderKind={epic?.orderKind ?? null}
    />
  );
}
