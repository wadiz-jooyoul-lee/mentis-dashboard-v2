import { listEnds, getEndDir } from "@/lib/lifecycle";
import EndList from "@/components/EndList";

export const dynamic = "force-dynamic";

export default function IssueEndPage() {
  return <EndList ends={listEnds()} sourceDir={getEndDir()} />;
}
