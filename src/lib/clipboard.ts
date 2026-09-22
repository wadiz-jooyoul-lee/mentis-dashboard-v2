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
