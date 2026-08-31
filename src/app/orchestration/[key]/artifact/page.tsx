import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import { lanIpv4, lanHostname } from "@/lib/lanHost";
import ArtifactTabView from "@/components/ArtifactTabView";

export const dynamic = "force-dynamic";

export default function ArtifactPage({ params }: { params: { key: string } }) {
  if (!ORDER_KEY_RE.test(params.key)) notFound();
  const epic = getEpic(params.key);
  return (
    <ArtifactTabView
      epicKey={params.key}
      title={epic?.title ?? null}
      resolved={epic?.resolved ?? false}
      hasExplainer={!!epic?.explainerMd}
      shareUrl={epic?.artifactShareUrl ?? null}
      // 링크에 숫자 IP를 노출하지 않도록 mDNS 이름을 먼저 쓰고, 안 되면 IP로 폴백한다.
      lanHost={lanHostname() ?? lanIpv4()}
      mode={epic?.orchestration?.mode ?? null}
      worktreeRemoved={epic?.worktreeRemoved ?? false}
      hasJira={!!epic?.jiraIssueMd || isJiraIssueKey(params.key)}
      orderKind={epic?.orderKind ?? null}
    />
  );
}
