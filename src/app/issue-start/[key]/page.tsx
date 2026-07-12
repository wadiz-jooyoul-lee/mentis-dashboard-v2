import { getStart } from "@/lib/lifecycle";
import StartDetail from "@/components/StartDetail";

export const dynamic = "force-dynamic";

export default function StartDetailPage({
  params,
}: {
  params: { key: string };
}) {
  return <StartDetail issueKey={params.key} start={getStart(params.key)} />;
}
