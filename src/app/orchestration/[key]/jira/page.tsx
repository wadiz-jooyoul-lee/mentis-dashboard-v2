import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import JiraTabView from "@/components/JiraTabView";

export const dynamic = "force-dynamic";

export default async function JiraPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!ORDER_KEY_RE.test(key)) notFound();
  const epic = getEpic(key);
  // Jira 키가 아니고(문서 전용 TASK-) 이슈 원문도 없으면 Jira 탭 성립 X.
  // Jira 키면 아직 이슈를 안 불러왔어도 탭을 열어 "불러오기" 버튼을 제공.
  if (!epic?.jiraIssueMd && !isJiraIssueKey(key)) notFound();

  const canEnrich = !!(epic?.implementationMd || epic?.produceMd || epic?.explainerMd);

  return (
    <JiraTabView
      epicKey={key}
      title={epic?.title ?? null}
      resolved={epic?.resolved ?? false}
      mode={epic?.orchestration?.mode ?? null}
      worktreeRemoved={epic?.worktreeRemoved ?? false}
      hasDesign={!!epic?.designMd || !!epic?.outcomeMd}
      canEnrich={canEnrich}
      jiraIssueMd={epic?.jiraIssueMd ?? null}
      jiraIssueCleanMd={epic?.jiraIssueCleanMd ?? null}
      jiraCommentsMd={epic?.jiraCommentsMd ?? null}
      jiraEnrichMd={epic?.jiraEnrichMd ?? null}
      jiraPosted={epic?.jiraPosted ?? {}}
    />
  );
}
