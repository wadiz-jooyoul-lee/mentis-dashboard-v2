import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import { getLanIp } from "@/lib/net";
import ArtifactTabView from "@/components/ArtifactTabView";

export const dynamic = "force-dynamic";

export default function ArtifactPage({ params }: { params: { key: string } }) {
  if (!ORDER_KEY_RE.test(params.key)) notFound();
  const epic = getEpic(params.key);
  return (
    <ArtifactTabView
      epicKey={params.key}
      hasExplainer={!!epic?.explainerMd}
      shareUrl={epic?.artifactShareUrl ?? null}
      lanIp={getLanIp()}
      mode={epic?.orchestration?.mode ?? null}
      worktreeRemoved={epic?.worktreeRemoved ?? false}
      hasJira={!!epic?.jiraIssueMd || isJiraIssueKey(params.key)}
    />
  );
}
