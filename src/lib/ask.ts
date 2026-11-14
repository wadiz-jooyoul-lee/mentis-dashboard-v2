/**
 * 질문 — /do 세션이나 자동 실행이 사람의 답을 받으려고 오더 폴더에 남긴 `ask.json`. (서버 전용, node I/O)
 * 쓰는 쪽은 go-dobby 의 `dobby_v2_ask`(형식은 그 헬퍼가 기준), 답을 적는 쪽은 `dobby_v2_ask_answer` 다. 여기서는 읽기만 한다.
 * 새 형식(v 2)은 일곱 칸을 갖고, 옛 형식(v 없음)은 제목·이유·할 일·선택지만 갖는다. 둘 다 읽는다.
 */
import fs from "node:fs";
import path from "node:path";
import { getMetaDir } from "@/lib/issues";

/** 답하는 방식: 예/아니오 · 하나 고르기 · 글로 적기 · 직접 해 주기 */
export type AskKind = "yesno" | "choice" | "input" | "action";

/** 방법 하나. label 이 답으로 저장되는 이름이다 */
export type AskOption = {
  label: string;
  /** 무엇을 하는지 */
  does: string;
  /** 고르면 어떻게 되는지 */
  effect: string;
  recommended: boolean;
  /** 권하는 이유(권하는 방법에만) */
  reason: string;
};

export type AskInfo = {
  /** 2 는 일곱 칸을 가진 새 형식, 1 은 옛 형식 */
  v: 1 | 2;
  kind: AskKind;
  /** 질문 한 줄 */
  title: string;
  /** 무슨 일이 있었나 (새 형식) */
  what: string;
  /** 왜 스스로 정하지 못했나 */
  why: string;
  /** 지금까지 해 본 것 (새 형식) */
  tried: string[];
  /** 방법들 (새 형식) */
  options: AskOption[];
  /** 고를 수 있는 이름들. 새 형식은 방법 이름과 같다 */
  choices: string[];
  /** 글로 적기면 무엇을 적을지와 예시, 직접 해 주기면 할 일과 명령 */
  todo: string;
  /** 답한 뒤 이어지는 일 (새 형식) */
  after: string;
  /** 했다고 답했는데 확인이 안 됐을 때 남는 메모 */
  note: string;
  /** 질문을 남긴 시각 "YYYY-MM-DD HH:MM" */
  created: string;
  /** 직접 해 주기에 확인 명령이 있다(통과해야 이어 간다) */
  hasCheck: boolean;
  /** 묻는 쪽의 표시 이름(기획자·테스터 등). 자동 실행 장치가 남긴 질문이면 "자동 실행" */
  from: string;
  /** 자동 실행이 살아서 이 답을 기다리는 중인가. 아니면 답한 뒤 자동 실행을 다시 띄운다 */
  waiting: boolean;
};

const KINDS: readonly AskKind[] = ["yesno", "choice", "input", "action"];
const ROLE_NAME: Record<string, string> = {
  "analysis-agent": "기획자",
  "review-agent": "리뷰어",
  "deploy-agent": "배포담당",
  "test-agent": "테스터",
  "produce-agent": "산출자",
  shell: "자동 실행",
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

function readRaw(key: string): Record<string, unknown> | null {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(getMetaDir(), key, "ask.json"), "utf8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

const answered = (j: Record<string, unknown>): boolean => !!str((j.answer as { value?: unknown } | null | undefined)?.value);

/** 아직 답을 받지 못한 질문의 제목. 질문이 없거나 이미 답했으면 null. */
export function openAskTitle(key: string): string | null {
  const j = readRaw(key);
  return j && !answered(j) ? str(j.title) || "질문" : null;
}

/** 오더의 질문 파일을 화면이 쓰는 모양으로 읽는다. 파일이 없거나 깨졌으면 undefined. */
export function readAsk(key: string, waiting = false): AskInfo | undefined {
  const j = readRaw(key);
  if (!j) return undefined;
  const v = Number(j.v) >= 2 ? 2 : 1;
  const options: AskOption[] = Array.isArray(j.options)
    ? j.options
        .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
        .map((o) => ({
          label: str(o.label),
          does: str(o.does),
          effect: str(o.effect),
          recommended: o.recommended === true,
          reason: str(o.reason),
        }))
        .filter((o) => o.label)
    : [];
  const choices = strs(j.choices);
  // 모르는 방식이 와도 답할 길이 남게 글로 적기로 받는다(답 헬퍼는 예/아니오·옛 하나 고르기 밖의 답을 가리지 않는다).
  const kind = (KINDS as readonly string[]).includes(str(j.kind)) ? (str(j.kind) as AskKind) : "input";
  const role = str((j.from as { role?: unknown } | undefined)?.role);
  return {
    v,
    kind,
    title: str(j.title),
    what: str(j.what),
    why: str(j.why),
    tried: strs(j.tried),
    options,
    choices: choices.length ? choices : kind === "yesno" ? ["예", "아니오"] : options.map((o) => o.label),
    todo: str(j.todo),
    after: str(j.after),
    note: str(j.note),
    created: str(j.created),
    hasCheck: !!str(j.check),
    from: role ? ROLE_NAME[role] ?? "개발자" : "자동 실행",
    waiting,
  };
}
