import { listReleases } from "@/lib/releases";
import ReleaseListView from "@/components/ReleaseListView";

export const dynamic = "force-dynamic";

export default function ReleasesPage() {
  return <ReleaseListView items={listReleases()} />;
}
