/** 마크다운 공용 파싱 헬퍼 (순수 함수, node 의존 없음). */

export type TableData = { headers: string[]; rows: string[][] };

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isSeparator(cells: string[]): boolean {
  return cells.every((c) => /^:?-{1,}:?$/.test(c) || c === "");
}

/** md 안의 모든 파이프 테이블을 파싱한다. */
export function parseTables(md: string): TableData[] {
  const lines = md.split("\n");
  const tables: TableData[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith("|")) continue;
    const headers = splitRow(lines[i]);
    // 다음 줄이 구분선이어야 유효한 테이블
    if (i + 1 >= lines.length || !isSeparator(splitRow(lines[i + 1]))) continue;
    const rows: string[][] = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith("|"); j++) {
      const cells = splitRow(lines[j]);
      if (!isSeparator(cells)) rows.push(cells);
    }
    tables.push({ headers, rows });
    i = j;
  }
  return tables;
}

/** 헤더에 keyword 중 하나가 포함된 첫 테이블을 찾는다. */
export function findTable(md: string, ...keywords: string[]): TableData | null {
  for (const t of parseTables(md)) {
    if (
      t.headers.some((h) =>
        keywords.some((k) => h.replace(/\*/g, "").includes(k))
      )
    )
      return t;
  }
  return null;
}

/** 테이블 헤더에서 keyword를 포함한 컬럼 인덱스. */
export function columnIndex(headers: string[], ...keywords: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].replace(/\*/g, "");
    if (keywords.some((k) => h.includes(k))) return i;
  }
  return -1;
}

/**
 * `**label**: value` 형태의 값을 뽑는다.
 * value는 `·`(중점) 또는 줄바꿈 전까지. 없으면 null.
 * 백틱(`)은 벗겨서 반환한다.
 */
export function field(md: string, label: string): string | null {
  const re = new RegExp(`\\*\\*${label}\\*\\*\\s*[:：]?\\s*([^·\\n]+)`);
  const m = md.match(re);
  if (!m) return null;
  return m[1].trim().replace(/^`|`$/g, "").trim() || null;
}

/**
 * `**label**: value` 에서 value를 **줄 끝까지** 뽑는다(중점 · 로 자르지 않음).
 * 한 줄에 값 하나만 있는 필드(제목·수정 설계·해결 근거 등)에 쓴다.
 */
export function fieldLine(md: string, label: string): string | null {
  const re = new RegExp(`\\*\\*${label}\\*\\*\\s*[:：]?\\s*(.+)`);
  const m = md.match(re);
  if (!m) return null;
  return m[1].trim().replace(/^`|`$/g, "").trim() || null;
}

/** `**label** {날짜}` 형태(콜론 없음)에서 날짜 문자열을 뽑는다. */
export function dateField(md: string, label: string): string | null {
  const re = new RegExp(
    `\\*\\*${label}\\*\\*\\s*[:：]?\\s*([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9:]+)`
  );
  const m = md.match(re);
  return m ? m[1].trim() : null;
}
