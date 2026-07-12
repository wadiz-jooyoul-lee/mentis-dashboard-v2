import { listStarts, getStartDir } from "@/lib/lifecycle";
import { listJobs } from "@/lib/jobs";
import StartList from "@/components/StartList";

export const dynamic = "force-dynamic";

export default function IssueStartPage() {
  return (
    <StartList
      starts={listStarts()}
      sourceDir={getStartDir()}
      initialJobs={listJobs()}
    />
  );
}
