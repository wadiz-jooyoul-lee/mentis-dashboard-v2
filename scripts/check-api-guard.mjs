#!/usr/bin/env node
/**
 * 실행·변경 API에 로컬 전용 가드(denyRemote)가 빠졌는지 빌드 전에 잡는다.
 *
 * 규칙: src/app/api/ 하위 route.ts 가 POST·DELETE·PUT·PATCH 를 내보내면
 * 그 파일 안에 denyRemote 호출이 있어야 한다. 없으면 빌드 실패.
 * (프록시가 /api/*를 기본 차단하지만, Host 위조로 프록시를 지나친 요청은
 *  핸들러 가드가 2차로 막는다 — 새 API에서 이 겹을 빼먹는 실수 방지.)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src/app/api");
const MUTATING = /export\s+async\s+function\s+(POST|DELETE|PUT|PATCH)\b/;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name === "route.ts" ? [p] : [];
  });
}

const bad = [];
for (const f of fs.existsSync(ROOT) ? walk(ROOT) : []) {
  const src = fs.readFileSync(f, "utf8");
  if (MUTATING.test(src) && !src.includes("denyRemote")) bad.push(path.relative(process.cwd(), f));
}

if (bad.length) {
  console.error("⛔ 로컬 전용 가드(denyRemote) 없는 실행·변경 API:");
  for (const f of bad) console.error("   - " + f);
  console.error("   핸들러 첫 줄에 `const denied = denyRemote(req); if (denied) return denied;` 를 넣으세요.");
  process.exit(1);
}
console.log("✓ 실행·변경 API 가드 검사 통과");
