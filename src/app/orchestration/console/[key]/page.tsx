import { notFound } from "next/navigation";
import ConsoleTabs from "@/components/ConsoleTabs";
import { getEpic } from "@/lib/orchestration";
import { listConsoleAgents } from "@/lib/transcript";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";

export const dynamic = "force-dynamic";

export default function OrderConsolePage({
  params,
}: {
  params: { key: string };
}) {
  if (!ORDER_KEY_RE.test(params.key)) notFound();

  const epic = getEpic(params.key);
  const agents = listConsoleAgents(params.key).map((a) => ({
    id: a.id,
    label: a.slug + (a.phase ? " · " + a.phase : ""),
  }));

  return (
    <ConsoleTabs
      orderKey={params.key}
      agents={agents}
      height={480}
      mode={epic?.orchestration?.mode ?? null}
      worktreeRemoved={epic?.worktreeRemoved ?? false}
      hasJira={!!epic?.jiraIssueMd || isJiraIssueKey(params.key)}
    />
  );
}
