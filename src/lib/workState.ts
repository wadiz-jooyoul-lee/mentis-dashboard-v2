/**
 * 세션이 **지금 무엇을 하고 있는지**. (서버 전용 — 전사 파일 읽기)
 *
 * 보드의 기존 "작업 상태"(작업중·해결됨·종료)는 오더가 **어디까지 왔는지**다.
 * 여기서 내는 값은 그 오더를 맡은 **세션이 지금 뭘 하는지**로 뜻이 다르다.
 * 둘을 섞지 않도록 화면에서도 열을 나눠 둔다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sessionByUuid, type LiveSession } from "@/lib/sessionRegistry";
import { GUESSED, type WorkState } from "@/lib/workStateTypes";

export { WORK_STATES, GUESSED, WAITING_ON_USER, type WorkState } from "@/lib/workStateTypes";

/**
 * 사용자를 기다리는 말투. 한국어는 질문을 물음표 없이 끝내는 일이 흔해서
 * 물음표만 보면 절반 넘게 놓친다 — 쉬는 중인 세션 15개의 마지막 문장을 사람이 직접
 * 채점한 결과, 물음표만 보면 8건 중 3건만 잡고 5건을 놓쳤다(헛잡음 0).
 * 이 말투까지 함께 보면 6건을 잡고 2건을 놓친다(헛잡음 1).
 * 놓치는 쪽이 훨씬 비싸므로(기다리는 세션을 못 보고 지나친다) 넓은 쪽을 쓴다.
 *   놓쳤던 실제 문장: "대기하겠습니다. 진행 결정 주시면 그때 착수하겠습니다."
 *                     "바꿀지 말씀해 주세요." / "원하시면 … 안을 잡아 드리겠습니다."
 */
const ASK_RE = /(주세요|주시면|말씀해|알려\s*주|정해\s*주|골라\s*주|선택해\s*주|어느\s*쪽|할까요|드릴까요|하시겠|원하시면)/;

/** 글투를 볼 범위. 끝 200자만 본다 — 글 중간에 지나가듯 쓴 말투까지 잡으면 헛잡음이 는다. */
const ASK_TAIL = 200;

/** 전사에서 처음 읽을 양. 46MB짜리도 이 정도면 마지막 대화가 들어 있었다(실측). */
const TAIL_BYTES = 512 * 1024;
/** 한 줄이 아주 길면(큰 도구 결과) 못 찾을 수 있어 4배씩 키운다. 여기까지만. */
const TAIL_MAX = 8 * 1024 * 1024;

type Entry = {
  type?: string;
  message?: {
    stop_reason?: string;
    content?: Array<{ type?: string; name?: string; id?: string; tool_use_id?: string; text?: string }>;
  };
};

/**
 * 세션 전사 파일 경로. `~/.claude/projects/{cwd의 / 와 . 을 - 로 바꾼 이름}/{세션ID}.jsonl`.
 * 떠 있는 대화형 세션 17개로 규칙을 확인했다(17개 모두 이 경로에 있었다).
 */
function transcriptPath(a: LiveSession): string | null {
  if (!a.cwd) return null;
  return path.join(
    os.homedir(),
    ".claude",
    "projects",
    a.cwd.replace(/[/.]/g, "-"),
    `${a.sessionId}.jsonl`
  );
}

/**
 * 전사 **끝부분**만 읽어 대화 줄(assistant·user)을 뽑는다. 파일이 46MB까지 커서
 * 통째로 읽으면 안 된다. 끝에서 자른 첫 줄은 반쯤 잘려 있으므로 버린다.
 * 끝에는 대화가 아닌 기록(attachment·system·last-prompt·ai-title 등)이 붙으므로
 * 타입으로 걸러 낸다.
 */
function tailEntries(file: string): Entry[] {
  let budget = TAIL_BYTES;
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return [];
  }
  while (budget <= TAIL_MAX) {
    let buf: Buffer;
    try {
      const fd = fs.openSync(file, "r");
      try {
        const start = Math.max(0, size - budget);
        buf = Buffer.alloc(Math.min(budget, size - start));
        fs.readSync(fd, buf, 0, buf.length, start);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return [];
    }
    const lines = buf.toString("utf8").split("\n");
    if (size > budget) lines.shift(); // 잘린 첫 줄은 버린다
    const out: Entry[] = [];
    for (const ln of lines) {
      if (!ln.trim()) continue;
      try {
        const j = JSON.parse(ln) as Entry;
        if (j.type === "assistant" || j.type === "user") out.push(j);
      } catch {
        /* 대화가 아닌 줄·깨진 줄은 넘긴다 */
      }
    }
    if (out.length > 0 || size <= budget) return out;
    budget *= 4;
  }
  return [];
}

/** 전사 끝을 보고 "사용자를 기다리는 중"인지 가린다. 아니면 null. */
function askingState(a: LiveSession): WorkState | null {
  const file = transcriptPath(a);
  if (!file) return null;
  const ents = tailEntries(file);
  const last = ents[ents.length - 1];
  if (!last || last.type !== "assistant") return null;
  const content = last.message?.content ?? [];

  // 선택지 질문 창: 마지막 줄에 AskUserQuestion 호출이 있는데 그 결과가 아직 없다.
  // (결과가 왔다면 그 tool_result를 담은 user 줄이 뒤에 붙어 마지막 줄이 바뀐다.)
  if (content.some((b) => b?.type === "tool_use" && b.name === "AskUserQuestion")) {
    return "선택지 질문 대기";
  }

  if (last.message?.stop_reason !== "end_turn") return null;
  const text = content
    .filter((b) => b?.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  if (!text) return null;
  const endsWithQuestion = /[?？]$/.test(text.replace(/[*_`\s]+$/, ""));
  return endsWithQuestion || ASK_RE.test(text.slice(-ASK_TAIL)) ? GUESSED : null;
}

/**
 * 세션 UUID로 작업 상태를 낸다. 세션이 떠 있지 않으면 **null**(9번째 값을 만들지 않는다).
 *
 * 판정 순서는 확실한 것부터다 — 앞의 것이 뒤의 것을 덮는다.
 *  1 작업 중 · 2 권한 승인 대기 · 3 선택지 질문 대기 · 4 글로 질문하고 대기(추정) · 5 쉬는 중
 *  (백그라운드 전용) 6 끝남 · 7 살아서 멈춤 · 8 꺼진 채 멈춤
 *
 * ⚠️ 2번과 7번은 **동시에 성립한다** — 실측된 백그라운드 세션 하나가
 *    status=waiting/permission prompt 이면서 state=blocked·pid 있음이었다.
 *    2번을 먼저 본다: 7번은 "뭔가 기다린다"는 막연한 말이지만 2번은 사용자가
 *    무엇을 해야 하는지를 알려 준다.
 */
export function workState(uuid: string | null): WorkState | null {
  const a = sessionByUuid(uuid);
  if (!a) return null;

  if (a.status === "busy") return "작업 중";
  if (a.status === "waiting" && a.waitingFor === "permission prompt") return "권한 승인 대기";

  const asking = askingState(a);
  if (asking) return asking;

  if (a.state === "done") return "끝남";
  if (a.state === "blocked") return a.pid ? "살아서 멈춤" : "꺼진 채 멈춤";
  if (a.status === "idle") return "쉬는 중";
  return null;
}
