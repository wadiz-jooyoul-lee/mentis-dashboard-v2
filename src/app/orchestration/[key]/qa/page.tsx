import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import QaView from "@/components/QaView";

export const dynamic = "force-dynamic";

export default async function QaPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!ORDER_KEY_RE.test(key)) notFound();
  const epic = getEpic(key);
  return (
    <QaView
      epicKey={key}
      title={epic?.title ?? null}
      qa={epic?.qa ?? null}
      ship={epic?.ship ?? []}
      repoUrl={epic?.repoUrl ?? null}
      mode={epic?.orchestration?.mode ?? null}
      worktreeRemoved={epic?.worktreeRemoved ?? false}
      resolved={epic?.resolved ?? false}
      hasJira={epic?.hasJiraDoc || isJiraIssueKey(key)}
      hasDesign={epic?.hasDesignDoc ?? false}
      orderKind={epic?.orderKind ?? null}
    />
  );
}
