import { jobsInstalled, jobsStatus, readJobsData } from "@/lib/dobbyJobs";
import TeamJobsView from "@/components/TeamJobsView";

export const dynamic = "force-dynamic";

export default async function TeamJobsPage() {
  return <TeamJobsView data={readJobsData()} initialStatus={await jobsStatus()} installed={jobsInstalled()} />;
}
