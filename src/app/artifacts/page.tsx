import { listArtifacts } from "@/lib/orchestration";
import ArtifactListView from "@/components/ArtifactListView";

export const dynamic = "force-dynamic";

export default function ArtifactsPage() {
  return <ArtifactListView items={listArtifacts()} />;
}
