import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import VerifyView from "@/components/VerifyView";

export const dynamic = "force-dynamic";

export default function VerifyPage({ params }: { params: { key: string } }) {
  if (!ORDER_KEY_RE.test(params.key)) notFound();
  const epic = getEpic(params.key);
  if (!epic) notFound();

  return (
    <VerifyView
      epicKey={params.key}
      mode={epic.orchestration?.mode ?? null}
      worktreeRemoved={epic.worktreeRemoved}
      hasJira={!!epic.jiraIssueMd || isJiraIssueKey(params.key)}
      runs={epic.runs}
      testGuideMd={epic.testGuideMd}
    />
  );
}
