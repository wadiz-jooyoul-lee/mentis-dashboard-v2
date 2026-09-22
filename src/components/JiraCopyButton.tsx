"use client";

import { useState } from "react";
import { Button, Tooltip, message } from "antd";
import { CopyOutlined, CheckOutlined } from "@ant-design/icons";
import { copyText } from "@/lib/clipboard";
import { jiraUrl } from "@/lib/jira";

/**
 * "Jira에서 열기" 옆 버튼 — 그 이슈의 Jira 주소를 클립보드에 넣는다.
 * 다른 사람에게 이슈를 알려 줄 때 새 탭을 열어 주소창을 긁을 필요가 없게 한다.
 */
export default function JiraCopyButton({ epicKey }: { epicKey: string }) {
  const [done, setDone] = useState(false);

  const onClick = async () => {
    const url = jiraUrl(epicKey);
    if (!(await copyText(url))) {
      message.error("복사에 실패했습니다.");
      return;
    }
    message.success(url);
    // 잠깐 체크 표시로 바꿔, 눌렸다는 것이 버튼에서도 보이게 한다.
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };

  return (
    <Tooltip title={done ? "복사했습니다" : "Jira 링크 복사"}>
      <Button
        type="link"
        aria-label="Jira 링크 복사"
        icon={done ? <CheckOutlined style={{ color: "#52c41a" }} /> : <CopyOutlined />}
        onClick={onClick}
      />
    </Tooltip>
  );
}
