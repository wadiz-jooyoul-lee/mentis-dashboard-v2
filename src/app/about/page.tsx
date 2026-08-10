import fs from "node:fs";
import path from "node:path";
import AboutView from "@/components/AboutView";

export const dynamic = "force-dynamic";

// 저장소 루트의 ABOUT.md를 읽는다(문서 정본은 하나 — GitHub와 대시보드가 같은 파일을 본다).
function readAbout(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "ABOUT.md"), "utf8");
  } catch {
    return "# 소개\n\n`ABOUT.md`를 찾을 수 없습니다.";
  }
}

export default function AboutPage() {
  return <AboutView md={readAbout()} />;
}
