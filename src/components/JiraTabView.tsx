"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, Button, Space, Empty, Collapse, Input, Tag, message, Alert } from "antd";
import { ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import OrderHeader from "@/components/OrderHeader";
import MarkdownDoc from "@/components/MarkdownDoc";

const { TextArea } = Input;

type Props = {
  epicKey: string;
  mode: string | null;
  worktreeRemoved: boolean;
  /** 구현 산출물이 있어 ③ 업데이트 생성이 가능한지(=작업이 진행돼 정리할 내용이 있음). */
  canEnrich: boolean;
  jiraIssueMd: string | null;
  jiraIssueCleanMd: string | null;
  jiraCommentsMd: string | null;
  jiraEnrichMd: string | null;
  jiraPosted: { desc?: string; comment?: string };
};

async function callJira(body: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export default function JiraTabView(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState(props.jiraEnrichMd ?? "");

  // 서버가 새 내용을 주면(재생성·저장 후 새로고침) 편집칸을 동기화.
  useEffect(() => setDraft(props.jiraEnrichMd ?? ""), [props.jiraEnrichMd]);

  // 생성/게시 잡 트리거 → 완료되면 자동 갱신(백그라운드라 대기 안 함).
  const trigger = async (jira: string, extra: Record<string, unknown> = {}) => {
    const tag = jira + (typeof extra.target === "string" ? extra.target : "");
    setBusy(tag);
    const ok = await callJira({ jira, key: props.epicKey, ...extra });
    if (!ok) {
      message.error("요청에 실패했습니다");
      setBusy(null);
      return;
    }
    message.success("시작됨 — 완료되면 자동으로 갱신됩니다");
    setTimeout(() => router.refresh(), 4000);
    setTimeout(() => {
      router.refresh();
      setBusy(null);
    }, 12000);
  };

  const saveDraft = async () => {
    setBusy("save");
    const ok = await callJira({ jira: "save", key: props.epicKey, text: draft });
    setBusy(null);
    if (ok) {
      message.success("초안을 저장했습니다");
      router.refresh();
    } else {
      message.error("저장에 실패했습니다");
    }
  };

  // ① 기존 지라 이슈 내용: 정리본(있으면) + 원문 접기. dobby-order가 저장한 원문 재활용.
  // 아직 안 불러온 기존 오더면 "불러오기" 버튼(snapshot)으로 그때 조회.
  const hasIssue = !!(props.jiraIssueMd || props.jiraIssueCleanMd);
  const issueTab = hasIssue ? (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={busy === "clean"}
          onClick={() => trigger("clean")}
        >
          {props.jiraIssueCleanMd ? "다시 정리" : "읽기 쉽게 정리"}
        </Button>
      </Space>
      <MarkdownDoc md={props.jiraIssueCleanMd ?? props.jiraIssueMd ?? ""} />
      {props.jiraIssueCleanMd && (
        <Collapse
          ghost
          style={{ marginTop: 8 }}
          items={[
            {
              key: "raw",
              label: "원문 보기",
              children: <MarkdownDoc md={props.jiraIssueMd ?? ""} />,
            },
          ]}
        />
      )}
    </div>
  ) : (
    <Empty description="이슈 내용을 아직 불러오지 않았습니다 (작업 시작 전이거나 이전 오더)">
      <Button
        type="primary"
        loading={busy === "snapshot"}
        onClick={() => trigger("snapshot")}
      >
        Jira에서 이슈 불러오기
      </Button>
    </Empty>
  );

  // ② 코멘트 핵심 정리: 버튼 생성(전체 코멘트 새로 조회).
  const commentsTab = props.jiraCommentsMd ? (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={busy === "comments"}
          onClick={() => trigger("comments")}
        >
          다시 정리
        </Button>
      </Space>
      <MarkdownDoc md={props.jiraCommentsMd} />
    </div>
  ) : (
    <Empty description="코멘트 핵심 정리가 아직 없습니다">
      <Button
        type="primary"
        loading={busy === "comments"}
        onClick={() => trigger("comments")}
      >
        코멘트 핵심 정리 생성
      </Button>
    </Empty>
  );

  // ③ 업데이트 내용 정리: 편집 가능 + 게시(설명/코멘트). 게시 후 "추가됨" 배지.
  const enrichTab = props.jiraEnrichMd ? (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={busy === "enrich"}
          onClick={() => trigger("enrich")}
        >
          다시 생성
        </Button>
        <Button
          size="small"
          icon={<SaveOutlined />}
          loading={busy === "save"}
          onClick={saveDraft}
        >
          편집 저장
        </Button>
        <Button
          type="primary"
          size="small"
          loading={busy === "postdesc"}
          onClick={() => trigger("post", { target: "desc" })}
        >
          설명에 보강
        </Button>
        <Button
          size="small"
          loading={busy === "postcomment"}
          onClick={() => trigger("post", { target: "comment" })}
        >
          코멘트로 보강
        </Button>
        {props.jiraPosted.desc && <Tag color="success">설명 추가됨 · {props.jiraPosted.desc}</Tag>}
        {props.jiraPosted.comment && (
          <Tag color="success">코멘트 추가됨 · {props.jiraPosted.comment}</Tag>
        )}
      </Space>
      <TextArea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoSize={{ minRows: 10, maxRows: 30 }}
        style={{ fontFamily: "monospace", fontSize: 13 }}
      />
      <div style={{ marginTop: 16, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
        <MarkdownDoc md={draft} />
      </div>
    </div>
  ) : (
    <Empty
      description={
        props.canEnrich
          ? "업데이트 내용 정리가 아직 없습니다"
          : "작업이 진행돼 정리할 내용이 생기면 만들 수 있습니다"
      }
    >
      {props.canEnrich && (
        <Button type="primary" loading={busy === "enrich"} onClick={() => trigger("enrich")}>
          업데이트 내용 정리 생성
        </Button>
      )}
    </Empty>
  );

  return (
    <div>
      <OrderHeader
        epicKey={props.epicKey}
        mode={props.mode}
        worktreeRemoved={props.worktreeRemoved}
        hasJira
      />
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 12, marginBottom: 12 }}
        message="이슈 내용은 작업 시작 때 읽은 걸 재활용합니다. 정리·코멘트·업데이트·게시는 버튼으로 실행되며, 게시 후 Jira와 동기화하지는 않습니다."
      />
      <Tabs
        defaultActiveKey="issue"
        items={[
          { key: "issue", label: "기존 이슈 내용", children: issueTab },
          { key: "comments", label: "코멘트 핵심 정리", children: commentsTab },
          { key: "enrich", label: "업데이트 내용 정리", children: enrichTab },
        ]}
      />
    </div>
  );
}
