/** 오더에 켜진 담당자를 상태 문서에서 읽는다. (서버 전용, node I/O) */
import fs from "node:fs";
import path from "node:path";
import { getMetaDir } from "@/lib/issues";
import { ORDER_KEY_RE } from "@/lib/keys";
import { isProductOrder, parseRoles } from "@/lib/parseOrderStatus";

/** 상태 문서의 담당자 줄. 줄이 없거나(이 줄이 생기기 전의 오더) 오더가 없으면 null. */
export function readOrderRoles(key: string): string[] | null {
  if (!ORDER_KEY_RE.test(key)) return null;
  try {
    return parseRoles(fs.readFileSync(path.join(getMetaDir(), key, "status.md"), "utf8"));
  } catch {
    return null;
  }
}

/** 개발자 없이 산출물만 만드는 /do 오더인가. 배포와 검증, 데이터 분석의 대상이 아니다. */
export function isProductOrderKey(key: string): boolean {
  return isProductOrder(readOrderRoles(key));
}
