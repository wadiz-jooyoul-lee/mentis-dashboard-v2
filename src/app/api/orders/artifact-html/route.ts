/**
 * 구현 내용(explainer.md)을 크롬 없는 self-contained HTML로 반환한다(아티팩트 탭의 로컬 미리보기·링크용).
 * 대시보드 셸(AppShell) 없이 순수 HTML을 주므로 iframe 미리보기·새 탭 열기·링크 복사에 그대로 쓸 수 있다.
 * markdown→HTML·mermaid 렌더는 CDN(marked·mermaid)으로 클라이언트에서 처리(로컬 대시보드라 CDN 허용).
 */
import { NextRequest, NextResponse } from "next/server";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE } from "@/lib/keys";

export const dynamic = "force-dynamic";

function shell(title: string, bodyInner: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui,-apple-system,'Apple SD Gothic Neo',sans-serif;max-width:820px;margin:40px auto;padding:0 20px;color:#57606a;line-height:1.7">${bodyInner}</body></html>`;
}

function renderPage(title: string, md: string): string {
  // </script>만 안전 처리하면 type="text/plain" script 안의 마크다운은 그대로 보존된다.
  const safe = md.replace(/<\/script>/gi, "<\\/script>");
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,'Apple SD Gothic Neo',sans-serif;max-width:900px;margin:0 auto;padding:32px 24px;color:#24292f;line-height:1.7}
  h1,h2,h3{border-bottom:1px solid #eaecef;padding-bottom:.3em;margin-top:1.6em}
  code{background:#f6f8fa;padding:.2em .4em;border-radius:4px;font-size:.9em}
  pre{background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto}
  pre code{background:none;padding:0}
  table{border-collapse:collapse;display:block;overflow-x:auto}
  th,td{border:1px solid #d0d7de;padding:6px 12px}
  blockquote{color:#57606a;border-left:.25em solid #d0d7de;padding:0 1em;margin:0}
  .mermaid{background:#fff;overflow-x:auto;text-align:center}
  img{max-width:100%}
</style>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head><body>
<div class="markdown-body" id="c"></div>
<script id="md" type="text/plain">${safe}</script>
<script>
  (function(){
    var md = document.getElementById('md').textContent;
    var c = document.getElementById('c');
    try { c.innerHTML = (window.marked ? marked.parse(md, {gfm:true}) : md); }
    catch(e){ c.textContent = md; }
    // \`\`\`mermaid 코드블록 → <pre class="mermaid">(mermaid.run 대상). textContent는 엔티티가 원문으로 복원됨.
    c.querySelectorAll('code.language-mermaid, code.lang-mermaid').forEach(function(el){
      var pre=document.createElement('pre'); pre.className='mermaid'; pre.textContent=el.textContent;
      (el.closest('pre')||el).replaceWith(pre);
    });
    try { if(window.mermaid){ mermaid.initialize({startOnLoad:false, securityLevel:'loose', theme:'default'}); mermaid.run(); } } catch(e){}
  })();
</script>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get("key") ?? "").trim();
  if (!ORDER_KEY_RE.test(key)) {
    return new NextResponse("invalid key", { status: 400 });
  }
  const epic = getEpic(key);
  const md = epic?.explainerMd;
  const html = md
    ? renderPage(`${key} — 구현 내용`, md)
    : shell(
        `${key} — 구현 내용`,
        "구현 내용(explainer)이 아직 없습니다. 대시보드의 <b>‘구현 내용’ 탭</b>에서 먼저 생성하세요."
      );
  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
