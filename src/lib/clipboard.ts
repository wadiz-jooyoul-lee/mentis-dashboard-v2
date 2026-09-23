/**
 * 클립보드 복사.
 *
 * 보안 컨텍스트가 아니면(예: `http://192.168.x.x` 로 접속) `navigator.clipboard` 가 없다.
 * 사내망에서 IP로 열어 쓰는 일이 있어 `execCommand` 폴백이 필요하다.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 폴백으로 진행 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 서식이 살아 있는 복사 — Confluence 표에 칸을 맞춰 붙여넣기 위함.
 *
 * 글자만 담으면 표 한 줄이 한 칸에 통째로 들어간다. `text/html` 을 같이 담아야 편집기가
 * 표로 알아본다. HTML 을 못 받는 곳(메모장 등)에 떨어질 때를 위해 글자판도 함께 담는다.
 */
export async function copyHtml(html: string, text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch {
    /* 폴백으로 진행 */
  }
  // 보안 컨텍스트가 아닐 때(사내망 IP 접속). textarea 로는 HTML 이 죽으므로
  // contenteditable 에 넣고 선택해서 복사한다 — 이러면 서식이 살아 있다.
  try {
    const div = document.createElement("div");
    div.contentEditable = "true";
    div.innerHTML = html;
    div.style.position = "fixed";
    div.style.top = "-1000px";
    div.style.opacity = "0";
    document.body.appendChild(div);
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const ok = document.execCommand("copy");
    sel?.removeAllRanges();
    document.body.removeChild(div);
    return ok;
  } catch {
    return false;
  }
}
