/**
 * 지금 떠 있는 Claude Code 세션 목록. (서버 전용 — 외부 명령 실행)
 *
 * 오더의 `status.md ## 세션`에는 **세션 ID(UUID)**만 적혀 있어서, 그것만으로는
 * 다른 세션에 말을 걸 수 없다. 말을 거는 주소는 **세션 이름**(예: `dobby-playground-2c`)이다.
 * 여기서 UUID를 이름으로 바꿔 준다.
 *
 * ⚠️ 이름은 세션이 시작될 때 붙고(`{폴더 이름}-{16진수 2자리}`) **바뀔 수 있다**
 *    (레지스트리에 `nameSource`·`nameSince` 칸이 따로 있다 = 고정이 아니라는 뜻).
 *    그래서 이름을 메타에 적어 두지 않고, 볼 때마다 UUID로 다시 찾는다.
 */
import { spawnSync } from "node:child_process";

/** `claude agents --json` 한 줄. 필요한 칸만 추린다. */
export type LiveSession = {
  sessionId: string;
  /** SendMessage로 보낼 때 쓰는 주소. */
  name: string;
  cwd: string | null;
  /** interactive(사람이 쓰는 대화 세션) / background(백그라운드 잡). */
  kind: string | null;
  /** idle(쉬는 중) · busy(작업 중) · waiting(무언가 기다리는 중). 없을 수 있다. */
  status: string | null;
  /** status=waiting일 때 무엇을 기다리는지. 예: "permission prompt". */
  waitingFor: string | null;
  /** 백그라운드 세션에만 있다 — done(끝남) · blocked(멈춤). 대화형은 늘 null. */
  state: string | null;
  /** 프로세스 번호. 없으면 프로그램이 이미 꺼진 것이다(blocked와 묶어 판정). */
  pid: number | null;
};

let cache: { at: number; val: LiveSession[] } | null = null;

/**
 * 떠 있는 세션 목록. `~/.claude/sessions/*.json`을 직접 읽지 않고 **공식 창구**를 쓴다
 * (도움말: "for scripting; does not require a TTY"). 내부 파일 형식이 바뀌어도 안 깨진다.
 *
 * 한 번에 0.25초쯤 걸린다(CLI 프로세스를 띄웠다 내리는 비용). 이슈 화면마다 부르므로
 * 5초 메모이즈한다 — transcript.ts discoverFromProjects와 같은 방식.
 */
function liveSessions(): LiveSession[] {
  if (cache && Date.now() - cache.at < 5000) return cache.val;

  let val: LiveSession[] = [];
  try {
    // --all 을 붙여 **끝난 백그라운드 세션까지** 받는다. 안 붙이면 state="done" 이 통째로
    // 빠져서 "끝남"을 판정할 길이 없다(실측: 19건 → 24건).
    const r = spawnSync("claude", ["agents", "--json", "--all"], { encoding: "utf8", timeout: 3000 });
    const raw = r.status === 0 ? JSON.parse(r.stdout) : null;
    if (Array.isArray(raw)) {
      val = raw
        .filter((a) => a && typeof a.sessionId === "string" && typeof a.name === "string")
        .map((a) => ({
          sessionId: a.sessionId,
          name: a.name,
          cwd: typeof a.cwd === "string" ? a.cwd : null,
          kind: typeof a.kind === "string" ? a.kind : null,
          status: typeof a.status === "string" ? a.status : null,
          waitingFor: typeof a.waitingFor === "string" ? a.waitingFor : null,
          state: typeof a.state === "string" ? a.state : null,
          pid: typeof a.pid === "number" ? a.pid : null,
        }));
    }
  } catch {
    /* claude가 없거나 출력이 깨졌으면 "떠 있는 세션 없음"으로 둔다(꾸밈 기능). */
  }

  cache = { at: Date.now(), val };
  return val;
}

/**
 * 세션 UUID로 지금 떠 있는 **대화형** 세션을 찾는다. 꺼져 있으면 null.
 *
 * 백그라운드 잡은 뺀다 — 오더를 맡은 세션은 실측 15건이 전부 interactive였고,
 * 사용자가 말을 걸 대상도 사람이 쓰는 세션이다.
 */
export function liveSessionByUuid(uuid: string | null): LiveSession | null {
  if (!uuid) return null;
  return liveSessions().find((a) => a.sessionId === uuid && a.kind === "interactive") ?? null;
}

/**
 * 세션 UUID로 **종류를 가리지 않고** 찾는다(백그라운드 잡 포함).
 *
 * 작업 상태 판정(workState)은 백그라운드 전용 값 — 끝남·살아서 멈춤·꺼진 채 멈춤 — 을
 * 가려야 해서 대화형만 봐서는 안 된다. 말을 걸 주소를 보여주는 쪽(liveSessionByUuid)과
 * 목적이 다르므로 따로 둔다.
 */
export function sessionByUuid(uuid: string | null): LiveSession | null {
  if (!uuid) return null;
  return liveSessions().find((a) => a.sessionId === uuid) ?? null;
}
