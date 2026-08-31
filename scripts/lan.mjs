#!/usr/bin/env node
/**
 * 대시보드의 외부(다른 기기) 공개를 켜고 끈다 — 헤더 토글과 같은 일을 터미널에서.
 *
 * 서버는 항상 0.0.0.0에 열려 있고 실제 차단은 `src/proxy.ts`가 이 파일을 보고 한다.
 * 그래서 값만 바꾸면 재기동 없이 다음 요청부터 바로 반영된다.
 *
 *   node scripts/lan.mjs status   현재 공개 여부
 *   node scripts/lan.mjs on       외부 공개 켜기
 *   node scripts/lan.mjs off      이 맥에서만
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = process.env.PORT || "7253";
const FILE = path.join(process.cwd(), ".lan-exposure");

/** 파일이 없으면 꺼짐(안전한 기본값) — src/lib/lanToggle.ts와 같은 규칙. */
function isOn() {
  try {
    return fs.readFileSync(FILE, "utf8").trim() === "on";
  } catch {
    return false;
  }
}

/** 다른 기기가 쓸 주소. 숫자 IP 노출을 피해 mDNS 이름을 먼저 쓴다. */
function shareHost() {
  const name = spawnSync("scutil", ["--get", "LocalHostName"], { encoding: "utf8" }).stdout?.trim();
  if (name && /^[A-Za-z0-9-]+$/.test(name)) return `${name}.local`;
  return Object.values(os.networkInterfaces()).flat()
    .find((n) => n && n.family === "IPv4" && !n.internal)?.address ?? null;
}

function status() {
  const on = isOn();
  console.log(`외부 공개: ${on ? "켜짐 ⚠️" : "꺼짐 ✅"}  (${FILE})`);
  if (on) {
    const h = shareHost();
    if (h) console.log(`  다른 기기: http://${h}:${PORT}`);
  }
}

const cmd = process.argv[2] ?? "status";
if (cmd === "status") status();
else if (cmd === "on" || cmd === "off") {
  fs.writeFileSync(FILE, `${cmd}\n`);
  status();
} else console.log("사용법: node scripts/lan.mjs [status|on|off]");
