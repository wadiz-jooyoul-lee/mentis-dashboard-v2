import fs from "node:fs";
import path from "node:path";
import { getMetaDir } from "@/lib/issues";
import { isOrderKey } from "@/lib/keys";

/** 오더 목록 위에 고정한 오더 키들. 점으로 시작해 오더 목록 스캔에서 빠진다. */
function pinsFile(): string {
  return path.join(getMetaDir(), ".dashboard-pins.json");
}

export function readPins(): string[] {
  try {
    const v = JSON.parse(fs.readFileSync(pinsFile(), "utf8"));
    return Array.isArray(v) ? v.filter((k) => typeof k === "string" && isOrderKey(k)) : [];
  } catch {
    return [];
  }
}

export function setPin(key: string, on: boolean): string[] {
  const rest = readPins().filter((k) => k !== key);
  const next = on ? [...rest, key] : rest;
  fs.writeFileSync(pinsFile(), JSON.stringify(next, null, 2));
  return next;
}
