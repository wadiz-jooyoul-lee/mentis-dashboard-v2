import fs from "node:fs";
import path from "node:path";
import { getMetaDir } from "@/lib/issues";

/**
 * 데모 모드 — 메타 루트가 `.demo-meta`(시나리오 플레이어가 관리하는 격리 폴더)를 가리킬 때.
 * 이때만 헤더에 데모 컨트롤이 보이고, 반대로 잡 실행(헤드리스 claude)은 전부 막는다.
 */
export function isDemoMode(): boolean {
  return path.basename(getMetaDir()) === ".demo-meta";
}

export type DemoState = { step: number; total: number; label: string; key?: string; at?: string };

/** 플레이어가 남긴 현재 단계. 아직 시작 전(리셋도 안 함)이면 step -1. */
export function readDemoState(): DemoState {
  try {
    return JSON.parse(fs.readFileSync(path.join(getMetaDir(), ".demo-state.json"), "utf8")) as DemoState;
  } catch {
    return { step: -1, total: 14, label: "없음" };
  }
}
