/**
 * Confluence 릴리즈 노트 표에 붙여넣을 **한 줄**을 만든다. (순수 함수, node 의존 없음)
 *
 * 대상 표: ServiceDev / `{연도}-{주}W WEB Release Note` 의 "정기배포" 표 — 13칸이다.
 * | 번호 | 서비스 | 기능 | 담당 프로덕트(팀) | 릴리즈 주요 내용 및 Jira Link | 개발 담당자 |
 * | 검증 환경 | RC 검증 결과 | 검증 담당자 | release branch | stage 배포확인 | live 배포확인 | 비고 |
 *
 * 채우는 것은 9칸 중 7칸. 번호·release/stage/live·비고는 **일부러 비운다** —
 * 붙이는 자리와 배포 이후에 정해지는 값이라 대시보드가 알 수 없다.
 */
import type { Bundle } from "@/lib/bundles";

/**
 * 우리 번들 이름 → 릴리즈 노트가 쓰는 이름.
 *
 * 이름이 다르다. 실제 표에서 확인한 것: `apps/global` 은 `static-global`,
 * `apps/account` 는 `static-account` 로 적는다(FE1-1983·FE1-1979 줄).
 * 저장소 통째인 것은 저장소 이름을 그대로 쓴다(`com.wadiz.ad.ui` 줄과 같은 방식).
 */
const SERVICE_NAME: Record<Bundle, string> = {
  static: "static",
  global: "static-global",
  account: "static-account",
  admin: "static-admin",
  studio: "studio",
  "app-api": "app-api",
  "wadiz-web": "com.wadiz.web",
};

/** 릴리즈 노트에 적는 순서. 실제 표의 `static, static-global, static-account, studio` 를 따른다. */
const SERVICE_ORDER: Bundle[] = [
  "static",
  "global",
  "account",
  "admin",
  "studio",
  "app-api",
  "wadiz-web",
];

export type ReleaseRow = {
  /** `static, static-global` */
  service: string;
  /** 개선 · 버그수정 */
  kind: string;
  /** FE1 · FE2 · CLIENT */
  team: string;
  issueKey: string;
  jiraUrl: string;
  /** `wadiz-frontend/feature/FE1-1983` — 저장소마다 한 줄 */
  branches: string[];
  /** 담당자 이름(멘션 기호 없이) */
  owner: string;
  /** RC4 · STAGE · DEV */
  env: string;
  /** PASS · FAIL */
  verdict: string;
};

/** 영향받는 번들 → 서비스 칸 글자. */
export function serviceCell(bundles: Bundle[]): string {
  const set = new Set(bundles);
  return SERVICE_ORDER.filter((b) => set.has(b))
    .map((b) => SERVICE_NAME[b])
    .join(", ");
}

/**
 * 기능 칸(신규/개선/버그수정)을 브랜치 접두어로 정한다.
 *
 * 실제 표와 맞는다(FE1-1969 `bugfix/…` → 버그수정, 나머지 `feature/…` → 개선).
 * "신규"는 브랜치만 봐서는 개선과 구분되지 않는다 — 사람이 고쳐 적는다.
 */
export function kindOf(branches: string[]): string {
  const b = branches.join(" ");
  if (/\b(bugfix|hotfix|fix)\//.test(b)) return "버그수정";
  if (/\bfeature\//.test(b)) return "개선";
  return "";
}

/** `FE1-1983` → `FE1`. 담당 프로덕트(팀) 칸. */
export function teamOf(key: string): string {
  return key.split("-")[0] ?? "";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 붙여넣을 HTML 표 한 줄.
 *
 * Jira 칸에는 **주소만** 넣는다. Confluence 가 알아서 `FE1-1983: 제목 / In Progress` 카드로
 * 바꿔 준다. 제목을 직접 적으면 오히려 카드가 안 되고 글자로 남는다.
 *
 * ⛔ 검증 환경·RC 검증 결과는 원래 Confluence 체크박스 매크로(고유 번호가 붙은 작업 항목)라
 * 붙여넣기로는 재현되지 않는다. 글자만 넣고, 체크박스가 필요하면 붙인 뒤 사람이 만든다.
 */
export function releaseRowHtml(r: ReleaseRow): string {
  const jira = `<a href="${esc(r.jiraUrl)}">${esc(r.jiraUrl)}</a>`;
  const branches = r.branches.length
    ? `<ul>${r.branches.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
    : "";
  const cells = [
    "", // 번호 — 붙이는 자리에서 정해진다
    esc(r.service),
    esc(r.kind),
    esc(r.team),
    jira + branches,
    r.owner ? `@${esc(r.owner)}` : "",
    esc(r.env),
    esc(r.verdict),
    r.owner ? `@${esc(r.owner)}` : "",
    "", // release branch 반영 여부
    "", // stage 배포확인
    "", // live 배포확인
    "", // 비고
  ];
  return `<table><tbody><tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr></tbody></table>`;
}

/** HTML 을 못 넣는 곳(메모장 등)에 떨어질 때의 글자판. 칸 구분은 탭이다. */
export function releaseRowText(r: ReleaseRow): string {
  const jira = [r.jiraUrl, ...r.branches].join(" ");
  const owner = r.owner ? `@${r.owner}` : "";
  return [
    "",
    r.service,
    r.kind,
    r.team,
    jira,
    owner,
    r.env,
    r.verdict,
    owner,
    "",
    "",
    "",
    "",
  ].join("\t");
}
