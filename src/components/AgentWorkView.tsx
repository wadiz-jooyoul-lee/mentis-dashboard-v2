"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Space, Empty, List, Collapse, Typography } from "antd";
import { FileOutlined, BranchesOutlined, CodeOutlined } from "@ant-design/icons";
import type { AgentWork, EditHunk } from "@/lib/orchestration";
import "./markdown.css";

const { Text } = Typography;

/** before→after 코드를 -/+ 로 표시. Write(old="")는 + 만. */
function DiffView({ hunks }: { hunks: EditHunk[] }) {
  const lineStyle: React.CSSProperties = {
    whiteSpace: "pre",
    padding: "0 8px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    lineHeight: 1.5,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {hunks.map((h, i) => (
        <div key={i} style={{ border: "1px solid #f0f0f0", borderRadius: 6, overflowX: "auto" }}>
          {h.old
            ? h.old.split("\n").map((l, j) => (
                <div key={`o${j}`} style={{ ...lineStyle, background: "#fff1f0", color: "#a8071a" }}>
                  - {l}
                </div>
              ))
            : null}
          {h.new.split("\n").map((l, j) => (
            <div key={`n${j}`} style={{ ...lineStyle, background: "#f6ffed", color: "#135200" }}>
              + {l}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 에이전트 한 명의 작업 내역(수정 파일·커밋·diff·요약). Drawer/카드 안에서 재사용. */
export default function AgentWorkView({ work }: { work: AgentWork }) {
  const w = work;
  if (!w.found) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={`작업 로그를 찾을 수 없습니다: ${w.logPath || "(경로 없음)"}`}
      />
    );
  }
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Text strong>
          <FileOutlined /> 수정·생성 파일 ({w.files.length})
        </Text>
        {w.baseDir && (
          <div>
            <Text type="secondary" style={{ fontSize: 12 }} code>
              {w.baseDir}/
            </Text>
          </div>
        )}
        <List
          size="small"
          dataSource={w.files}
          locale={{ emptyText: "수정 파일 없음" }}
          renderItem={(f) => (
            <List.Item style={{ padding: "4px 0", border: "none" }}>
              <Text code style={{ fontSize: 13 }}>
                {f}
              </Text>
            </List.Item>
          )}
        />
      </div>

      {w.commits.length > 0 && (
        <div>
          <Text strong>
            <BranchesOutlined /> 커밋·푸시 ({w.commits.length})
          </Text>
          {w.commits.map((c, i) => (
            <div key={i}>
              <Text code style={{ fontSize: 12 }}>
                {c}
              </Text>
            </div>
          ))}
        </div>
      )}

      {w.diffs.length > 0 && (
        <div>
          <Text strong>
            <CodeOutlined /> 코드 변경 diff ({w.diffs.length}개 파일)
          </Text>
          <Collapse
            ghost
            size="small"
            items={w.diffs.map((fd) => ({
              key: fd.file,
              label: (
                <Space size={6}>
                  <Text code style={{ fontSize: 12 }}>
                    {fd.file}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {fd.hunks.length}곳
                  </Text>
                </Space>
              ),
              children: <DiffView hunks={fd.hunks} />,
            }))}
          />
        </div>
      )}

      {w.summary && (
        <div>
          <Text strong>요약</Text>
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{w.summary}</ReactMarkdown>
          </div>
        </div>
      )}

      <Text type="secondary" style={{ fontSize: 11 }}>
        로그: {w.logPath}
      </Text>
    </Space>
  );
}
