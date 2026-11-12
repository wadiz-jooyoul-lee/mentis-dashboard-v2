/**
 * 세션 생존 — go-dobby 가 남기는 작업 표시(`{메타}/.presence/{세션}.json`)를 읽는다. (서버 전용)
 * 표시는 /do 세션이 시작할 때 만들고, 세션이 끝나면 훅이 지운다. 프로세스가 죽었으면 남아 있어도 죽은 것으로 본다.
 */
import fs from "node:fs";
import path from "node:path";
import { getMetaDir } from "@/lib/issues";

type Presence = { session?: string; pid?: number; keys?: string[]; state?: string; slug?: string };

function pidAlive(pid: number | undefined): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** 이 오더를 잡고 일하는 살아 있는 세션: 담당자 슬러그 → 세션 아이디. 닫기 안내로 끝난 세션은 뺀다. */
export function liveSessions(key: string): Record<string, string> {
  const dir = path.join(getMetaDir(), ".presence");
  const out: Record<string, string> = {};
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return out;
  }
  for (const f of files) {
    let p: Presence;
    try {
      p = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch {
      continue;
    }
    if (!p.slug || p.state === "done" || !p.keys?.includes(key) || !pidAlive(p.pid)) continue;
    out[p.slug] = p.session ?? f.replace(/\.json$/, "");
  }
  return out;
}

/** 상태 문서의 `- **자동 실행**:` 줄. 실행 중이라고 적혀 있어도 프로세스가 없으면 끊긴 것으로 본다. */
export type AutoRun = { text: string; running: boolean; lost: boolean };

export function autoRunState(line: string | null): AutoRun | null {
  if (!line) return null;
  const pid = Number(line.match(/pid\s+(\d+)/)?.[1] ?? 0);
  const says = line.startsWith("실행 중");
  const alive = says && pidAlive(pid);
  return { text: line, running: alive, lost: says && !alive };
}

/**
 * QA 감시(dobby-qa) 진행: `qa-watch.md` 상태 줄이 '감시 중'일 때만 본다.
 * 작업 세션(qa/work.pid)이나 QA 표시가 붙은 세션이 살아 있으면 active, 아무도 없으면 lost(창을 닫아 감시가 끊김).
 */
export type QaRun = "active" | "lost";

export function qaRun(key: string): QaRun | null {
  const dir = path.join(getMetaDir(), key);
  let watch = "";
  try {
    watch = fs.readFileSync(path.join(dir, "qa-watch.md"), "utf8");
  } catch {
    return null;
  }
  if (!/^- \*\*상태\*\*:[ \t]*감시 중/m.test(watch)) return null;
  try {
    if (pidAlive(Number(fs.readFileSync(path.join(dir, "qa", "work.pid"), "utf8").trim()))) return "active";
  } catch {}
  const pdir = path.join(getMetaDir(), ".presence");
  let files: string[] = [];
  try {
    files = fs.readdirSync(pdir).filter((f) => f.endsWith(".json"));
  } catch {}
  for (const f of files) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(pdir, f), "utf8")) as Presence & { qa?: boolean };
      if (p.qa && p.state !== "done" && p.keys?.includes(key) && pidAlive(p.pid)) return "active";
    } catch {}
  }
  return "lost";
}

/** QA 작업 세션의 진행(`progress.json` 단계가 'QA 수정'·'QA 리뷰'일 때). */
export type QaProgress = { stage: "QA 수정" | "QA 리뷰"; done: number; total: number };

export function qaProgress(key: string): QaProgress | null {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(getMetaDir(), key, "progress.json"), "utf8"));
    return (p.stage === "QA 수정" || p.stage === "QA 리뷰") && p.total > 0 ? { stage: p.stage, done: Math.min(p.done ?? 0, p.total), total: p.total } : null;
  } catch {
    return null;
  }
}
