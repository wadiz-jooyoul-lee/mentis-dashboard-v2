"use client";

import { Button, Dropdown, message } from "antd";
import { CopyOutlined, DownOutlined, ExportOutlined, LinkOutlined } from "@ant-design/icons";
import { copyText } from "@/lib/clipboard";
import { jiraUrl } from "@/lib/jira";

/**
 * "Jira" 버튼 — 누르면 그 이슈의 Jira 링크 복사·열기 메뉴가 뜬다.
 * 다른 사람에게 이슈를 알려 줄 때 새 탭을 열어 주소창을 긁을 필요가 없게 한다.
 */
export default function JiraButton({ epicKey }: { epicKey: string }) {
  const url = jiraUrl(epicKey);

  const onClick = async ({ key }: { key: string }) => {
    if (key === "open") {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (await copyText(url)) message.success(url);
    else message.error("복사에 실패했습니다.");
  };

  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      menu={{
        onClick,
        items: [
          { key: "copy", icon: <CopyOutlined />, label: "링크 복사" },
          { key: "open", icon: <ExportOutlined />, label: "열기" },
        ],
      }}
    >
      <Button type="link" icon={<LinkOutlined />}>
        Jira <DownOutlined style={{ fontSize: 10 }} />
      </Button>
    </Dropdown>
  );
}
