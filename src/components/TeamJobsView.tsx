"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Breadcrumb, Button, Card, Empty, Popconfirm, Segmented, Space, Table, Tabs, Tag, Typography, message } from "antd";
import { useCanAct } from "@/components/CanAct";
import type { JobsData, JobsIssue, JobsOverlap, JobsStatus } from "@/lib/dobbyJobs";

const { Title, Text } = Typography;
const STAGES = ["착수 전", "개발 중", "리뷰 중", "검증 환경 반영", "배포 대기", "라이브 반영"];
const STAGE_COLOR = ["#d9d9d9", "#91caff", "#4096ff", "#1677ff", "#faad14", "#52c41a"];
const KINDS = ["새로 생김", "진행 시작", "해결됨", "종료"] as const;
const jira = (k: string) => `https://wadiz.atlassian.net/browse/${k}`;
const days = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
const hm = (iso: string) => {
  const d = new Date(iso.replace(" ", "T"));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}(${"일월화수목금토"[d.getDay()]}) ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function kindOf(i: JobsIssue): (typeof KINDS)[number] {
  const to = i.changes?.at(-1)?.to;
  return to === "진행 중" ? "진행 시작" : to === "해결됨" ? "해결됨" : to === "종료" ? "종료" : "새로 생김";
}

function Stage({ i }: { i: JobsIssue }) {
  if (i.stage === "에픽") return <Tag>에픽 (하위 이슈로 진행)</Tag>;
  const n = STAGES.indexOf(i.stage);
  return (
    <span style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span aria-hidden style={{ display: "inline-grid", gridTemplateColumns: "repeat(5, 12px)", gap: 2 }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <i key={s} style={{ height: 6, borderRadius: 2, background: s <= n ? STAGE_COLOR[n] : STAGE_COLOR[0] }} />
        ))}
      </span>
      {i.stage}
    </span>
  );
}

function IssueCell({ i, extra }: { i: JobsIssue; extra?: React.ReactNode }) {
  return (
    <div style={{ minWidth: 260 }}>
      <a href={jira(i.key)} target="_blank" rel="noreferrer" style={{ fontFamily: "monospace", fontSize: 12 }}>
        {i.key}
      </a>
      <div>{i.summary}</div>
      {i.parentSummary && <Text type="secondary" style={{ fontSize: 12 }}>상위: {i.parentSummary}</Text>}
      {extra}
    </div>
  );
}

function BranchCell({ i }: { i: JobsIssue }) {
  if (!i.branches.length) return <Text type="secondary">브랜치 없음</Text>;
  return (
    <div style={{ minWidth: 220, display: "grid", gap: 4 }}>
      {i.branches.slice(0, 2).map((b) => {
        const prs = b.prs.filter((p) => p.state !== "CLOSED").slice(0, 3);
        return (
          <div key={b.repo + b.branch}>
            <code style={{ fontSize: 12 }}>
              {b.repo} / {b.branch}
            </code>
            <div>
              {prs.length ? (
                prs.map((p) => (
                  <span key={p.n} style={{ marginRight: 8 }}>
                    <a href={p.url} target="_blank" rel="noreferrer">#{p.n}</a>{" "}
                    {p.state === "MERGED" ? "병합됨" : p.draft ? "초안" : p.review === "APPROVED" ? "승인됨" : p.review === "CHANGES_REQUESTED" ? "수정 요청" : "리뷰 중"}
                    <Text type="secondary"> → {p.base}</Text>
                  </span>
                ))
              ) : (
                <Text type="secondary">PR 없음</Text>
              )}
            </div>
            {b.in.length > 0 && <Text type="secondary" style={{ fontSize: 12 }}>들어간 곳: {b.in.join(", ")}</Text>}
          </div>
        );
      })}
      {i.branches.length > 2 && <Text type="secondary">외 {i.branches.length - 2}개 브랜치</Text>}
    </div>
  );
}

const LevelTag = ({ l }: { l: string }) => <Tag color={l === "충돌 주의" ? "red" : "orange"}>{l}</Tag>;
function Why({ o }: { o: JobsOverlap }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {o.why.map((w) => (
        <code key={w} style={{ fontSize: 12, wordBreak: "break-all" }}>{w}</code>
      ))}
      {o.more ? <Text type="secondary">외 {o.more}개 파일</Text> : null}
    </div>
  );
}

/** 조사 상태 줄: 마지막 조사, 다음 자동 조사, 지금 조사 버튼. 실행 중이면 5초마다 다시 읽는다. */
function RunBar({ initial, installed }: { initial: JobsStatus | null; installed: boolean }) {
  const canAct = useCanAct();
  const router = useRouter();
  const [st, setSt] = useState(initial);
  const load = useCallback(async () => {
    const r = await fetch("/api/dobby-jobs", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    const s = r && "nextAuto" in r ? (r as JobsStatus) : null;
    setSt(s);
    return s;
  }, []);
  useEffect(() => {
    if (!st?.running) return;
    const t = setInterval(async () => {
      const r = await load();
      if (r && !r.running) router.refresh(); // 끝나면 새 결과로 다시 그림
    }, 5000);
    return () => clearInterval(t);
  }, [st?.running, load, router]);
  const run = async () => {
    const r = await fetch("/api/dobby-jobs", { method: "POST" }).then((x) => x.json()).catch(() => null);
    message.info(r?.result ?? "실행 요청에 실패했습니다");
    await load();
  };
  const today = new Date().toISOString().slice(0, 10);
  const doneToday = st?.lastSuccess?.slice(0, 10) === today;
  return (
    <Card size="small" style={{ marginTop: 12 }}>
      <Space wrap size={[24, 8]} style={{ width: "100%", justifyContent: "space-between" }}>
        <Space wrap size={[24, 4]}>
          <Text>마지막 조사 <b>{st?.lastSuccess ? hm(st.lastSuccess) : "없음"}</b></Text>
          <Text>다음 자동 조사 <b>{st?.nextAuto ? hm(st.nextAuto) : "-"}</b></Text>
          {st?.lastError && <Text type="danger">{st.lastError}</Text>}
        </Space>
        {!installed ? (
          <Text type="secondary">설치된 go-dobby 에 dobby-jobs 가 없습니다</Text>
        ) : st?.running ? (
          <Button loading>조사 중… ({st.running.by ?? ""} {st.running.startedAt?.slice(11, 16) ?? ""} 시작)</Button>
        ) : doneToday ? (
          <Popconfirm title="오늘 이미 조사했습니다. 다시 조사할까요?" okText="다시 조사" cancelText="취소" onConfirm={run} disabled={!canAct}>
            <Button disabled={!canAct}>다시 조사</Button>
          </Popconfirm>
        ) : (
          <Button type="primary" onClick={run} disabled={!canAct}>지금 조사</Button>
        )}
      </Space>
    </Card>
  );
}

function DailyTab({ d, byKey }: { d: JobsData; byKey: Record<string, JobsIssue> }) {
  const [team, setTeam] = useState("전체");
  const [kind, setKind] = useState("전체");
  const picked = d.issues.filter((i) => i.picked);
  const hot = d.overlaps.filter((o) => byKey[o.issue]?.picked);
  const list = picked
    .filter((i) => (team === "전체" || d.teams[i.project] === team) && (kind === "전체" || kindOf(i) === kind))
    .sort((a, b) => KINDS.indexOf(kindOf(a)) - KINDS.indexOf(kindOf(b)) || (b.updated > a.updated ? 1 : -1));
  const summary = Object.entries(d.teams).map(([p, name]) => {
    const t = picked.filter((i) => i.project === p);
    return { name, ...Object.fromEntries(KINDS.map((k) => [k, t.filter((i) => kindOf(i) === k).length])), crit: hot.filter((o) => o.level === "충돌 주의" && byKey[o.issue].project === p).length };
  });
  return (
    <Space orientation="vertical" size={20} style={{ width: "100%" }}>
      <Table size="small" pagination={false} rowKey="name" dataSource={summary}
        columns={[{ title: "팀", dataIndex: "name" }, ...KINDS.map((k) => ({ title: k, dataIndex: k, align: "right" as const })),
          { title: "내 오더와 충돌 주의", dataIndex: "crit", align: "right" as const, render: (n: number) => (n ? <Tag color="red">{n}</Tag> : 0) }]} />
      <div>
        <Title level={5}>내 오더와 겹치는 변경 {hot.length}건</Title>
        <Text type="secondary">이번에 바뀐 이슈 중 내 오더와 같은 파일, 같은 상위 이슈, 같은 폴더를 건드린 것입니다.</Text>
        <OverlapTable rows={hot} byKey={byKey} showOrder />
      </div>
      <div>
        <Title level={5}>바뀐 이슈 {picked.length}건</Title>
        <Space orientation="vertical" size={6}>
          <Segmented value={team} onChange={(v) => setTeam(String(v))} options={["전체", ...Object.values(d.teams)]} />
          <Segmented value={kind} onChange={(v) => setKind(String(v))} options={["전체", ...KINDS]} />
        </Space>
        <Table style={{ marginTop: 8 }} size="small" rowKey="key" dataSource={list} pagination={{ pageSize: 30, hideOnSinglePage: true }} scroll={{ x: true }}
          columns={[
            { title: "이슈", key: "i", render: (_: unknown, i: JobsIssue) => <IssueCell i={i} /> },
            { title: "팀", key: "t", render: (_: unknown, i: JobsIssue) => d.teams[i.project] },
            { title: "담당", dataIndex: "assignee" },
            { title: "이전 상태", key: "f", render: (_: unknown, i: JobsIssue) => <Text type="secondary" delete={!!i.changes?.length}>{i.changes?.length ? i.changes[0].from : "새 이슈"}</Text> },
            { title: "지금 상태", key: "s", render: (_: unknown, i: JobsIssue) => <Tag color={i.status === "진행 중" ? "blue" : i.status === "해결됨" ? "green" : undefined}>{i.status}</Tag> },
            { title: "바뀐 시각", key: "a", render: (_: unknown, i: JobsIssue) => <Text type="secondary" style={{ whiteSpace: "nowrap" }}>{hm(i.changes?.at(-1)?.at ?? i.created)}</Text> },
            { title: "진행도", key: "g", render: (_: unknown, i: JobsIssue) => <Stage i={i} /> },
            { title: "브랜치와 PR", key: "b", render: (_: unknown, i: JobsIssue) => <BranchCell i={i} /> },
          ]} />
      </div>
    </Space>
  );
}

function OverlapTable({ rows, byKey, showOrder }: { rows: JobsOverlap[]; byKey: Record<string, JobsIssue>; showOrder?: boolean }) {
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="겹치는 작업이 없습니다" />;
  return (
    <div style={{ overflowX: "auto", marginTop: 8 }}><Table size="small" pagination={false} rowKey={(o) => o.order + o.issue}
      dataSource={[...rows].sort((a, b) => Number(a.level !== "충돌 주의") - Number(b.level !== "충돌 주의"))}
      columns={[
        { title: "겹침", key: "l", render: (_: unknown, o: JobsOverlap) => <LevelTag l={o.level} /> },
        { title: "상대 이슈", key: "i", render: (_: unknown, o: JobsOverlap) => <IssueCell i={byKey[o.issue]} /> },
        { title: "담당", key: "a", render: (_: unknown, o: JobsOverlap) => byKey[o.issue].assignee },
        { title: "진행도", key: "g", render: (_: unknown, o: JobsOverlap) => <Stage i={byKey[o.issue]} /> },
        ...(showOrder ? [{ title: "내 오더", key: "o", render: (_: unknown, o: JobsOverlap) => <Link href={`/orchestration/${o.order}`}>{o.order}</Link> }] : []),
        { title: "겹친 근거", key: "w", render: (_: unknown, o: JobsOverlap) => <Why o={o} /> },
      ]} /></div>
  );
}

function PeopleTab({ d }: { d: JobsData }) {
  const act = d.issues.filter((i) => i.status === "진행 중");
  const ovN = (k: string) => d.overlaps.filter((o) => o.issue === k).length;
  return (
    <Space orientation="vertical" size={28} style={{ width: "100%" }}>
      {Object.entries(d.teams).map(([p, name]) => {
        const t = act.filter((i) => i.project === p);
        const people: Record<string, JobsIssue[]> = {};
        t.forEach((i) => (people[i.assignee] ||= []).push(i));
        const gap = t.filter((i) => i.stage === "착수 전").length;
        return (
          <div key={p}>
            <Title level={4} style={{ marginBottom: 8 }}>
              {name} <Text type="secondary" style={{ fontSize: 14, fontWeight: 400 }}>진행 중 {t.length}건 · 담당자 {Object.keys(people).length}명{gap ? ` · 코드 흔적 없음 ${gap}건` : ""}</Text>
            </Title>
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              {Object.entries(people).sort((a, b) => b[1].length - a[1].length).map(([who, list]) => {
                list.sort((a, b) => STAGES.indexOf(b.stage) - STAGES.indexOf(a.stage));
                const stale = list.filter((i) => i.lastCommit && days(i.lastCommit) >= 7).length;
                return (
                  <Card key={who} size="small" title={<Space><b>{who}</b>{who === d.me && <Tag color="blue">나</Tag>}<Text type="secondary" style={{ fontWeight: 400 }}>진행 중 {list.length}건{stale ? ` · 7일 넘게 커밋 없음 ${stale}건` : ""}</Text></Space>}>
                    <div style={{ overflowX: "auto" }}><Table size="small" pagination={false} rowKey="key" dataSource={list}
                      columns={[
                        { title: "이슈", key: "i", render: (_: unknown, i: JobsIssue) => <IssueCell i={i} extra={<>
                          {i.stage === "착수 전" && <div><Text type="warning" style={{ fontSize: 12 }}>Jira는 진행 중인데 브랜치가 없습니다</Text></div>}
                          {ovN(i.key) > 0 && <div><Text type="warning" style={{ fontSize: 12 }}>내 오더와 겹침 {ovN(i.key)}건</Text></div>}</>} /> },
                        { title: "진행도", key: "g", render: (_: unknown, i: JobsIssue) => <Stage i={i} /> },
                        { title: "브랜치와 PR", key: "b", render: (_: unknown, i: JobsIssue) => <BranchCell i={i} /> },
                        { title: "마지막 커밋", key: "c", render: (_: unknown, i: JobsIssue) => i.lastCommit ? <Text type={days(i.lastCommit) >= 7 ? "warning" : "secondary"} style={{ whiteSpace: "nowrap" }}>{hm(i.lastCommit)}<br />{days(i.lastCommit)}일 전</Text> : <Text type="secondary">없음</Text> },
                        { title: "문서", key: "d", render: (_: unknown, i: JobsIssue) => i.docs.length ? <Space orientation="vertical" size={0}>{i.docs.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">{u.includes("figma") ? "피그마" : u.includes("google") ? "구글 문서" : "컨플루언스"}</a>)}</Space> : <Text type="secondary">없음</Text> },
                      ]} /></div>
                  </Card>
                );
              })}
            </Space>
          </div>
        );
      })}
    </Space>
  );
}

function OverlapTab({ d, byKey }: { d: JobsData; byKey: Record<string, JobsIssue> }) {
  const withO = d.orders.filter((o) => d.overlaps.some((x) => x.order === o.key));
  const without = d.orders.filter((o) => !withO.includes(o));
  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Text type="secondary">끝나지 않은 내 오더 {d.orders.length}개와, 진행 중이거나 이번에 바뀐 팀 이슈를 비교했습니다.</Text>
      {withO.map((o) => (
        <Card key={o.key} size="small" title={<div><Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}><Link href={`/orchestration/${o.key}`}>{o.key}</Link> · 오더 단계 {o.stage} · 내 커밋이 고친 파일 {o.fileCount}개</Text><div>{o.title}</div></div>}>
          <OverlapTable rows={d.overlaps.filter((x) => x.order === o.key)} byKey={byKey} />
        </Card>
      ))}
      {without.length > 0 && (
        <div>
          <Title level={5}>겹치는 것이 없는 오더</Title>
          {without.map((o) => (
            <div key={o.key}><Link href={`/orchestration/${o.key}`}>{o.key}</Link> {o.title}{o.fileCount ? "" : <Text type="secondary"> (아직 커밋 없음)</Text>}</div>
          ))}
        </div>
      )}
    </Space>
  );
}

function BaselineTab({ d }: { d: JobsData }) {
  const rows = Object.entries(d.teams).map(([p, name]) => {
    const t = d.issues.filter((i) => i.project === p);
    const done = t.filter((i) => ["해결됨", "종료"].includes(i.status)).length;
    const prog = t.filter((i) => i.status === "진행 중").length;
    return { name, prog, todo: t.length - prog - done, done };
  });
  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Text type="secondary">처음 조사라 기준 정리를 했습니다. 끝나지 않은 이슈 전부와 지난주 월요일 이후 끝난 이슈입니다. 다음 조사부터는 바뀐 이슈만 보입니다.</Text>
      <Table size="small" pagination={false} rowKey="name" dataSource={rows}
        columns={[{ title: "팀", dataIndex: "name" }, { title: "진행 중", dataIndex: "prog", align: "right" }, { title: "해야 할 일", dataIndex: "todo", align: "right" }, { title: "지난주 이후 끝남", dataIndex: "done", align: "right" }]} />
    </Space>
  );
}

/** 팀 이슈 현황 — 조사 상태 줄, 그 아래 탭 셋(바뀐 이슈 / 담당자별 진행 / 내 오더와 겹침). */
export default function TeamJobsView({ data, initialStatus, installed }: { data: JobsData | null; initialStatus: JobsStatus | null; installed: boolean }) {
  const byKey = useMemo(() => Object.fromEntries((data?.issues ?? []).map((i) => [i.key, i])), [data]);
  const [tab, setTab] = useState("daily");
  const d = data;
  return (
    <div>
      <Breadcrumb items={[{ title: <Link href="/">홈</Link> }, { title: "팀 이슈 현황" }]} style={{ marginBottom: 12 }} />
      <Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>팀 이슈 현황</Title>
      <Text type="secondary">{d ? `${Object.values(d.teams).join(" · ")}의 Jira 이슈를 브랜치, PR과 맞춰 봤습니다.` : "FE개발1팀 · FE개발2팀 · 클라이언트개발팀의 Jira 이슈를 브랜치, PR과 맞춰 봅니다."}</Text>
      <RunBar initial={initialStatus} installed={installed} />
      {!d ? (
        <Empty style={{ marginTop: 40 }} description="아직 조사 기록이 없습니다. 평일 오전 9시에 자동으로 조사하거나, 위 버튼으로 지금 조사할 수 있습니다." />
      ) : (
        <>
          {d.headline?.length ? (
            <Alert style={{ marginTop: 12 }} type="info" showIcon message="요약" description={<ul style={{ margin: 0, paddingLeft: 18 }}>{d.headline.map((h) => <li key={h}>{h}</li>)}</ul>} />
          ) : null}
          {d.fetchFailed.length > 0 && (
            <Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
              원격 갱신에 실패한 저장소 {d.fetchFailed.length}개({d.fetchFailed.join(", ")})는 이전 브랜치 정보로 판정했습니다.
            </Text>
          )}
          <Text type="secondary" style={{ display: "block", marginTop: 4, fontSize: 12 }}>
            조사 기간 {hm(d.since)} 부터 {hm(d.until)} 까지
          </Text>
          <Tabs style={{ marginTop: 8 }} activeKey={tab} onChange={setTab}
            items={[
              d.mode === "daily"
                ? { key: "daily", label: `바뀐 이슈 ${d.issues.filter((i) => i.picked).length}`, children: <DailyTab d={d} byKey={byKey} /> }
                : { key: "daily", label: "기준 정리", children: <BaselineTab d={d} /> },
              { key: "people", label: `담당자별 진행 ${d.issues.filter((i) => i.status === "진행 중").length}`, children: <PeopleTab d={d} /> },
              { key: "overlap", label: <span>내 오더와 겹침 <Tag color={d.overlaps.some((o) => o.level === "충돌 주의") ? "red" : undefined} style={{ marginInlineEnd: 0 }}>{d.overlaps.length}</Tag></span>, children: <OverlapTab d={d} byKey={byKey} /> },
            ]} />
        </>
      )}
    </div>
  );
}
