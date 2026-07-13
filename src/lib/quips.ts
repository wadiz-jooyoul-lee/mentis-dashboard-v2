/**
 * 아바타 소감(재미기능) — 대시보드 전용. 스킬 avatar-quips가 생성한
 * `$ORCHESTRATION_META/.mentis-quips/{키}.json`을 읽는다(격리 — 기존 파서·데이터 무영향).
 * 파일이 없거나 깨졌으면 null → 말풍선 없이 정상 동작.
 */
import fs from "fs";
import path from "path";
import { getMetaDir } from "@/lib/issues";

export type QuipMood = "happy" | "cheer" | "complain" | "ponder" | "chill" | "tired" | "bored";
export type Quip = { mood: QuipMood; text: string };
export type QuipContext = "board" | "changes" | "reviews";
export type QuipsFile = {
  sig?: string;
  generatedAt?: string;
  board?: Record<string, Quip>;
  changes?: Record<string, Quip>;
  reviews?: Record<string, Quip>;
};

function quipsDir(): string {
  return path.join(getMetaDir(), ".mentis-quips");
}
export function quipsPath(key: string): string {
  return path.join(quipsDir(), `${key}.json`);
}

export function readQuips(key: string): QuipsFile | null {
  try {
    return JSON.parse(fs.readFileSync(quipsPath(key), "utf8")) as QuipsFile;
  } catch {
    return null;
  }
}

/**
 * 오더 콘텐츠 서명. 스킬이 저장한 quips.sig와 비교해 "다시 생성해야 하나"를 판단한다.
 * orchestration.md의 수정시각(ms), 없으면 status.md. (스킬과 동일 규칙)
 */
export function orderSignature(key: string): string {
  const dir = path.join(getMetaDir(), key);
  for (const f of ["orchestration.md", "status.md"]) {
    try {
      return String(Math.floor(fs.statSync(path.join(dir, f)).mtimeMs));
    } catch {
      /* 다음 후보 */
    }
  }
  return "0";
}
