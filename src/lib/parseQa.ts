/**
 * QA 감시(dobby-qa) 산출물 파싱.
 *
 * 두 곳을 읽는다 — 둘 다 dobby-qa 가 쓰는 파일이고, 대시보드는 읽기만 한다.
 *   · `qa-watch.md`        폴링 설정 + 트리아지 표(어떤 버그를 끌어왔는지)
 *   · `status.md` `## QA`  편입된 버그의 처리 상태(수정·리뷰·배포·해결)
 *
 * 배포 진행은 따로 읽지 않는다 — dobby-qa 도 `## 배포` 표를 쓰므로 기존 파서를 그대로 쓴다.
 */
import { findTable, columnIndex } from "@/lib/md";
import { sectionBody } from "@/lib/parseOrderStatus";

const at = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : "");
/** 표 칸을 다듬어 돌려준다. 빈 칸·`-` 는 null. */
const cell = (row: string[], i: number): string | null => {
  const v = at(row, i).replace(/^`|`$/g, "").replace(/\*/g, "").trim();
  return v && v !== "-" ? v : null;
};

/** 트리아지 한 줄 — 이 버그를 끌어왔는지, 왜 그랬는지. */
export type QaTriageRow = {
  bugKey: string;
  title: string | null;
  /** 편입 · 무관 · 문의대기 · 보류 · 배포완료 · 해결 */
  verdict: string;
  /** 편입 기준 ①②③ */
  basis: string | null;
  slug: string | null;
  branch: string | null;
  slackTs: string | null;
  updatedAt: string | null;
};

/** 편입된 버그의 처리 상태 한 줄. */
export type QaStatusRow = {
  bugKey: string;
  basis: string | null;
  slug: string | null;
  /** 구현 · 리뷰 · 머지완료 · 배포중 · 검증중 · 배포완료 · 해결 */
  state: string;
  round: string | null;
  updatedAt: string | null;
};

export type QaInfo = {
  /** 폴링 주기(예: `5m`). */
  interval: string | null;
  lastPollAt: string | null;
  /** 고친 것을 되돌려 보내는 환경(dev·rc1·rc4·stage). */
  env: string | null;
  /** 기준 ①의 부모 QA 이슈. */
  parent: string | null;
  /** 기준 ②로 사용자가 지정한 버그들. */
  bugs: string | null;
  triage: QaTriageRow[];
  rows: QaStatusRow[];
};

/** `- **주기**: 5m · **마지막 폴**: 2026-10-01 14:20` 처럼 한 줄에 여러 값이 있는 꼴에서 하나를 뽑는다. */
function inlineField(md: string, label: string): string | null {
  const re = new RegExp(`\\*\\*${label}\\*\\*\\s*[:：]\\s*([^·\\n]+)`);
  const v = md.match(re)?.[1]?.replace(/`/g, "").trim();
  return v && v !== "-" ? v : null;
}

/** qa-watch.md 를 읽는다. 파일이 없으면 null(=QA가 돌지 않은 오더). */
export function parseQaWatch(md: string | null): Omit<QaInfo, "rows"> | null {
  if (!md || !md.trim()) return null;
  const head = sectionBody(md, /^폴링$/);
  const t = findTable(sectionBody(md, /^트리아지$/), "버그키");
  const ci = {
    key: columnIndex(t?.headers ?? [], "버그키", "이슈"),
    title: columnIndex(t?.headers ?? [], "제목"),
    verdict: columnIndex(t?.headers ?? [], "판정"),
    basis: columnIndex(t?.headers ?? [], "기준"),
    slug: columnIndex(t?.headers ?? [], "담당"),
    branch: columnIndex(t?.headers ?? [], "브랜치"),
    ts: columnIndex(t?.headers ?? [], "슬랙"),
    updated: columnIndex(t?.headers ?? [], "갱신"),
  };
  return {
    interval: inlineField(head, "주기"),
    lastPollAt: inlineField(head, "마지막 폴"),
    env: inlineField(head, "환경"),
    parent: inlineField(head, "parent"),
    bugs: inlineField(head, "bugs"),
    triage: (t?.rows ?? [])
      .map((r) => ({
        bugKey: at(r, ci.key).replace(/[`*]/g, "").trim(),
        title: cell(r, ci.title),
        verdict: (cell(r, ci.verdict) ?? "").trim(),
        basis: cell(r, ci.basis),
        slug: cell(r, ci.slug),
        branch: cell(r, ci.branch),
        slackTs: cell(r, ci.ts),
        updatedAt: cell(r, ci.updated),
      }))
      .filter((x) => x.bugKey),
  };
}

/** status.md 의 `## QA` 표를 읽는다. 없으면 빈 배열. */
export function parseQaRows(statusMd: string | null): QaStatusRow[] {
  if (!statusMd) return [];
  const t = findTable(sectionBody(statusMd, /^QA$/), "버그키");
  if (!t) return [];
  const ci = {
    key: columnIndex(t.headers, "버그키", "이슈"),
    basis: columnIndex(t.headers, "기준"),
    slug: columnIndex(t.headers, "담당"),
    state: columnIndex(t.headers, "상태"),
    round: columnIndex(t.headers, "라운드"),
    updated: columnIndex(t.headers, "갱신"),
  };
  return t.rows
    .map((r) => ({
      bugKey: at(r, ci.key).replace(/[`*]/g, "").trim(),
      basis: cell(r, ci.basis),
      slug: cell(r, ci.slug),
      state: (cell(r, ci.state) ?? "").trim(),
      round: cell(r, ci.round),
      updatedAt: cell(r, ci.updated),
    }))
    .filter((x) => x.bugKey);
}

/** 두 파일을 합쳐 QA 탭이 쓸 한 덩이로 만든다. qa-watch.md 가 없으면 null. */
export function parseQa(qaWatchMd: string | null, statusMd: string | null): QaInfo | null {
  const w = parseQaWatch(qaWatchMd);
  if (!w) return null;
  return { ...w, rows: parseQaRows(statusMd) };
}

/** 편입된(=처리 대상인) 버그만. 무관·보류는 뺀다. */
export function takenIn(qa: QaInfo): QaTriageRow[] {
  return qa.triage.filter((r) => !/무관|보류/.test(r.verdict));
}
