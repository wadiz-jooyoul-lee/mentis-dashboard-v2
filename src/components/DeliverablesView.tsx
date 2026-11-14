"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, Collapse, Empty, Space, Tag, Typography } from "antd";
import { ExportOutlined, FileTextOutlined, FolderOutlined } from "@ant-design/icons";
import OrderHeader from "@/components/OrderHeader";
import type { Deliverable, ProduceDoc, ProduceUpload } from "@/lib/orchestration";
import "./markdown.css";

const { Title, Text } = Typography;

function Md({ md }: { md: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </div>
  );
}

/** 산출 기록의 제목 — 문서 첫 `# 제목`, 없으면 산출물 이름. */
function recordTitle(d: ProduceDoc, many: boolean): string {
  const h1 = d.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const name = d.name.replace(/^produce-/, "").replace(/\.md$/i, "");
  if (h1) return many && name !== "produce" ? `${name} — ${h1}` : h1;
  return name === "produce" ? "산출 기록" : name;
}

/** 산출물 파일을 맨 위 폴더별로 묶는다. 폴더 밖 파일은 빈 이름 묶음에 둔다. */
function groupByFolder(files: Deliverable[]): { folder: string; files: Deliverable[] }[] {
  const map = new Map<string, Deliverable[]>();
  for (const f of files) {
    const i = f.name.lastIndexOf("/");
    const folder = i < 0 ? "" : f.name.slice(0, i);
    map.set(folder, [...(map.get(folder) ?? []), f]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([folder, fs]) => ({ folder, files: fs }));
}

/**
 * 산출물 탭 — 코드가 아닌 산출물(문서, 조사 보고)을 한곳에서 본다.
 * 위에서부터 올린 곳(문서를 올린 주소), 산출 기록(무엇을 만들었고 근거가 무엇인지), 산출물 파일(하위 폴더 포함).
 */
export default function DeliverablesView({
  epicKey,
  title = null,
  mode = null,
  worktreeRemoved = false,
  resolved = false,
  hasJira = false,
  hasDesign = false,
  hasQa = false,
  orderKind = null,
  produceDocs,
  uploads,
  deliverables,
}: {
  epicKey: string;
  title?: string | null;
  mode?: string | null;
  worktreeRemoved?: boolean;
  resolved?: boolean;
  hasJira?: boolean;
  hasDesign?: boolean;
  hasQa?: boolean;
  orderKind?: "development" | "deliverable" | "summary" | null;
  produceDocs: ProduceDoc[];
  uploads: ProduceUpload[];
  deliverables: Deliverable[];
}) {
  const many = produceDocs.length > 1;
  const groups = groupByFolder(deliverables);
  const empty = produceDocs.length === 0 && deliverables.length === 0;
  return (
    <div>
      <OrderHeader
        epicKey={epicKey}
        title={title}
        mode={mode}
        worktreeRemoved={worktreeRemoved}
        resolved={resolved}
        hasJira={hasJira}
        hasDesign={hasDesign}
        hasQa={hasQa}
        orderKind={orderKind}
      />
      <div style={{ marginTop: 16 }}>
        {empty && (
          <Empty
            description={
              <span>
                아직 산출물이 없습니다.
                <br />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  산출자가 문서나 조사 보고를 만들면 여기에 기록과 파일이 모입니다.
                </Text>
              </span>
            }
          />
        )}

        {uploads.length > 0 && (
          <Card size="small" style={{ marginBottom: 16 }} title="올린 곳" data-uploads>
            <Space orientation="vertical" size={6} style={{ width: "100%" }}>
              {uploads.map((u, i) => (
                <Space key={i} size={8} wrap>
                  <Tag color="green" style={{ margin: 0 }}>
                    {u.kind}
                  </Tag>
                  <a href={u.url} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>
                    {u.url} <ExportOutlined />
                  </a>
                  {many && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {u.from.replace(/^produce-/, "").replace(/\.md$/i, "")}
                    </Text>
                  )}
                </Space>
              ))}
            </Space>
          </Card>
        )}

        {produceDocs.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <Title level={4}>산출 기록</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              무엇을 만들었고 어디에 두었는지, 근거와 확인하지 못한 것을 적은 기록입니다.
            </Text>
            <Space orientation="vertical" size={12} style={{ width: "100%", marginTop: 10 }}>
              {produceDocs.map((d) => (
                <Card key={d.name} size="small" title={recordTitle(d, many)} data-produce-doc>
                  <Md md={d.content.replace(/^#\s+.+$/m, "")} />
                </Card>
              ))}
            </Space>
          </div>
        )}

        {deliverables.length > 0 && (
          <div>
            <Title level={4}>산출물</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              저장소에 들어가지 않는 보고와 조사 파일입니다. 저장소 안에 만든 문서는 코드 변경 탭에서 봅니다.
            </Text>
            <Space orientation="vertical" size={16} style={{ width: "100%", marginTop: 10 }}>
              {groups.map((g) => (
                <div key={g.folder || "."} data-deliverable-folder={g.folder || "."}>
                  {g.folder && (
                    <div style={{ marginBottom: 6 }}>
                      <Tag icon={<FolderOutlined />} style={{ margin: 0 }}>
                        {g.folder}
                      </Tag>
                    </div>
                  )}
                  <Collapse
                    defaultActiveKey={deliverables.length === 1 ? [deliverables[0].name] : []}
                    items={g.files.map((d) => ({
                      key: d.name,
                      label: (
                        <Space size={6}>
                          <FileTextOutlined />
                          {d.name.slice(g.folder ? g.folder.length + 1 : 0)}
                        </Space>
                      ),
                      extra: d.content ? (
                        <a
                          href={`data:text/plain;charset=utf-8,${encodeURIComponent(d.content)}`}
                          download={d.name.split("/").pop()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          다운로드
                        </a>
                      ) : undefined,
                      children:
                        d.kind === "md" ? (
                          <Md md={d.content} />
                        ) : d.kind === "html" ? (
                          <iframe
                            title={d.name}
                            srcDoc={d.content}
                            sandbox=""
                            style={{ width: "100%", height: 520, border: "1px solid #f0f0f0", borderRadius: 6 }}
                          />
                        ) : (
                          <Text type="secondary">미리보기를 지원하지 않는 파일입니다.</Text>
                        ),
                    }))}
                  />
                </div>
              ))}
            </Space>
          </div>
        )}
      </div>
    </div>
  );
}
