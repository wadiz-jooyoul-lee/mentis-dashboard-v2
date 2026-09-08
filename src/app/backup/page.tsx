import { getBackupStatus, listBackups, backupDir } from "@/lib/backup";
import {
  getOrchestrationBackupStatus,
  getInProgressStatus,
  readRunLog,
} from "@/lib/orchestrationBackup";
import BackupStatusView from "@/components/BackupStatusView";

export const dynamic = "force-dynamic";

export default function BackupPage() {
  const s = getBackupStatus();
  const { archives, totalBytes, log } = listBackups();
  const folder = getOrchestrationBackupStatus();
  const inp = getInProgressStatus();
  return (
    <BackupStatusView
      session={{
        archives,
        totalBytes,
        log,
        lastBackupAt: s.lastBackupAt,
        pending: s.pending,
        running: s.running,
        dest: backupDir(),
      }}
      folder={{
        archives: folder.archives,
        totalBytes: folder.totalBytes,
        orders: folder.orders,
        missing: folder.missing,
        stale: folder.stale,
        running: folder.running,
        log: folder.log,
        dest: folder.dest,
        metaDir: folder.metaDir,
      }}
      inprogress={{
        archives: inp.archives,
        totalBytes: inp.totalBytes,
        today: inp.today,
        has: inp.has,
        dueSlot: inp.dueSlot,
        due: inp.due,
        keepDays: inp.keepDays,
        dir: inp.dir,
        log: inp.log,
      }}
      runLog={readRunLog()}
    />
  );
}
