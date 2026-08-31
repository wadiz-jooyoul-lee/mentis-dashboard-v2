#!/usr/bin/env node
/**
 * 대시보드의 LAN(다른 기기) 공개를 켜고 끈다.
 *
 * 왜 스크립트인가: 공개 여부는 서버가 어느 주소에 바인드했는지로 정해진다(127.0.0.1 = 이 맥만,
 * 0.0.0.0 = 같은 네트워크 전체). Next 14의 미들웨어는 edge 런타임이라 파일 토글을 읽을 수 없어
 * 앱 안에서 껐다 켤 수 없다. 그래서 바인드를 바꿔 재기동하는 방식으로 토글한다.
 *
 *   node scripts/lan.mjs status   현재 공개 여부
 *   node scripts/lan.mjs on       LAN 공개로 재기동(0.0.0.0)
 *   node scripts/lan.mjs off      이 맥 전용으로 재기동(127.0.0.1)
 */
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = process.env.PORT || "7253";
const LOG = path.join(process.cwd(), ".next-dev.log");

const sh = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" }).stdout ?? "";

/** 이 포트를 듣고 있는 (pid, 바인드주소) 목록. */
function listeners() {
  const out = sh("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"]);
  return out.split("\n").slice(1).filter(Boolean).map((l) => {
    const c = l.split(/\s+/);
    return { pid: c[1], addr: (c[8] || "").replace(`:${PORT}`, "") };
  });
}

function status() {
  const ls = listeners();
  if (ls.length === 0) return console.log(`포트 ${PORT}: 실행 중인 서버 없음`);
  for (const { pid, addr } of ls) {
    const open = addr === "*" || addr === "0.0.0.0";
    console.log(`포트 ${PORT} (pid ${pid}) 바인드=${addr} → LAN 공개 ${open ? "켜짐 ⚠️" : "꺼짐 ✅"}`);
    if (open) {
      const ip = Object.values(os.networkInterfaces()).flat()
        .find((n) => n && n.family === "IPv4" && !n.internal)?.address;
      const name = sh("scutil", ["--get", "LocalHostName"]).trim();
      if (name) console.log(`  다른 기기: http://${name}.local:${PORT}`);
      if (ip) console.log(`  (IP)      http://${ip}:${PORT}`);
    }
  }
}

function restart(host) {
  for (const { pid } of listeners()) {
    console.log(`기존 서버 종료 (pid ${pid})`);
    spawnSync("kill", [pid]);
  }
  const fd = fs.openSync(LOG, "a");
  const child = spawn("npx", ["next", "dev", "-p", PORT, "-H", host], {
    detached: true, stdio: ["ignore", fd, fd],
  });
  child.unref();
  console.log(`재기동: -H ${host} (로그: ${LOG})`);
  setTimeout(status, 3500);
}

const cmd = process.argv[2] ?? "status";
if (cmd === "status") status();
else if (cmd === "on") restart("0.0.0.0");
else if (cmd === "off") restart("127.0.0.1");
else console.log("사용법: node scripts/lan.mjs [status|on|off]");
