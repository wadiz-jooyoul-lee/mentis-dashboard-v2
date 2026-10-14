import { notFound } from "next/navigation";
import ConsoleTabs from "@/components/ConsoleTabs";
import { getEpic } from "@/lib/orchestration";
import { listConsoleAgents } from "@/lib/transcript";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";

export const dynamic = "force-dynamic";

export default async function OrderConsolePage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ agent?: string | string[] }>;
}) {
  const { key } = await params;
  const { agent } = await searchParams;
  if (!ORDER_KEY_RE.test(key)) notFound();

  const epic = getEpic(key);
  const agents = listConsoleAgents(key).map((a) => ({
    id: a.id,
    label: a.slug + (a.phase ? " · " + a.phase : ""),
  }));

  return (
    <ConsoleTabs
      orderKey={key}
      title={epic?.title ?? null}
      resolved={epic?.resolved ?? false}
      agents={agents}
      height={480}
      mode={epic?.orchestration?.mode ?? null}
      worktreeRemoved={epic?.worktreeRemoved ?? false}
      hasJira={epic?.hasJiraDoc || isJiraIssueKey(key)}
      hasDesign={epic?.hasDesignDoc ?? false}
      hasQa={!!epic?.qa}
      orderKind={epic?.orderKind ?? null}
      initialSelected={typeof agent === "string" ? agent : null}
    />
  );
}
