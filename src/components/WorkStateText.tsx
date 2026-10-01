"use client";

/**
 * 세션이 지금 뭘 하는지를 **한 줄**로 그린다. 보드 목록(작업 상태 칸 둘째 줄)과
 * 오더 상세(세션 이름 아래)에서 같이 쓴다 — 두 곳의 모양·색·문구가 어긋나지 않게 한곳에 둔다.
 */
import { Tooltip } from "antd";
import { GUESSED, WAITING_ON_USER, type WorkState } from "@/lib/workStateTypes";

const OTHER_COLOR: Partial<Record<WorkState, string>> = {
  "작업 중": "#1677ff",
  "쉬는 중": "#8c8c8c",
  끝남: "#389e0d",
  "살아서 멈춤": "#ad6800",
  "꺼진 채 멈춤": "#cf1322",
};

/** 기다리는 상태를 한 색으로 묶는다 — 어느 것이 "나를 기다림"인지는 WAITING_ON_USER 하나로 정한다. */
function workStateColor(st: WorkState): string {
  return WAITING_ON_USER.includes(st) ? "#d46b08" : (OTHER_COLOR[st] ?? "#8c8c8c");
}

/**
 * 화면에 쓸 **짧은 이름**. 값(WORK_STATES 8가지)은 그대로 두고 표시만 줄인다.
 * 긴 문구가 열을 벌려 가로 스크롤이 생겼다 — 실측 표 1133px > 담는 칸 998px,
 * 그중 이 열 혼자 155px였고 "글로 질문하고 대기 (추정)"이 원인이었다.
 * 정식 이름은 마우스를 올리면 설명과 함께 그대로 보인다.
 */
const SHORT_LABEL: Record<WorkState, string> = {
  "작업 중": "작업 중",
  "권한 승인 대기": "권한 대기",
  "선택지 질문 대기": "선택 대기",
  "글로 질문하고 대기": "질문 대기",
  "쉬는 중": "쉬는 중",
  끝남: "끝남",
  "살아서 멈춤": "살아서 멈춤",
  "꺼진 채 멈춤": "꺼진 채 멈춤",
};

/** 마우스를 올렸을 때 보여줄 설명. 무엇을 보고 그렇게 판정했는지 적는다. */
const WORK_STATE_HINT: Record<WorkState, string> = {
  "작업 중": "지금 무언가를 하고 있습니다.",
  "권한 승인 대기": "도구를 쓸지 물어보는 창이 떠 있습니다. 그 창에서 승인해 주세요.",
  "선택지 질문 대기": "선택지를 고르는 창이 떠 있습니다. 그 창에서 골라 주세요.",
  "글로 질문하고 대기":
    "마지막 글이 질문이나 요청으로 끝나 사용자를 기다리는 것으로 보았습니다. 글투로 가늠한 것이라 그냥 끝난 것일 수도 있습니다.",
  "쉬는 중": "할 일을 마치고 쉬고 있습니다.",
  끝남: "백그라운드 작업이 끝났습니다.",
  "살아서 멈춤": "백그라운드 작업이 살아 있는 채로 무언가를 기다리고 있습니다.",
  "꺼진 채 멈춤": "백그라운드 작업이 끝내지 못한 채 꺼졌습니다.",
};

/**
 * "작업 상태" 칸의 **둘째 줄** — 그 오더를 맡은 세션이 지금 뭘 하는지.
 * 자격이 없으면(세션이 꺼졌거나 끝난 오더) 아무것도 그리지 않는다.
 *
 * 왜 별도 열이 아니라 둘째 줄인가: 열로 두면 머리글만으로도 최소 60px이 붙어
 * 표가 담는 칸(998px)을 넘겨 가로 스크롤이 생겼다(실측 1061px). 여기 얹으면 폭이
 * 거의 안 는다. 첫 줄(태그)과 **글씨 크기·색**으로 갈라 뜻이 섞이지 않게 한다.
 * ⛔ 여기서 새 상태 이름을 만들지 않는다 — 값은 WORK_STATES 8가지뿐이다.
 */
function workStateLine(st: WorkState | null) {
  if (!st) return null;
  const guessed = st === GUESSED;
  return (
    <Tooltip title={`세션: ${st}${guessed ? " (추정)" : ""} — ${WORK_STATE_HINT[st]}`}>
      <span
        style={{
          fontSize: 11,
          lineHeight: 1.3,
          color: workStateColor(st),
          cursor: "help",
          whiteSpace: "nowrap",
        }}
      >
        {SHORT_LABEL[st]}
        {/* 추정인 값만 표시를 단다(물음표 한 글자). 나머지 7가지는 Claude Code가 알려 준 값 그대로다. */}
        {guessed && <span style={{ opacity: 0.6 }}>?</span>}
      </span>
    </Tooltip>
  );
}

export default workStateLine;
export { workStateColor, SHORT_LABEL, WORK_STATE_HINT };
