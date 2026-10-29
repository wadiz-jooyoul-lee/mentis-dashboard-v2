import Link from "next/link";
import { listDataCards } from "@/lib/data";
import DataCard from "@/components/DataCard";

export const dynamic = "force-dynamic";

const BADGES = ["성과 있음", "판단 이르다", "차이 없음", "나빠짐", "수집 이상", "수집 확인"];

export default async function DataListPage({ searchParams }: { searchParams: Promise<{ badge?: string }> }) {
  const { badge } = await searchParams;
  const all = listDataCards();
  const cards = badge ? all.filter((c) => c.verdict === badge) : all;
  const filters = [{ label: "전체", href: "/data", count: all.length, on: !badge }].concat(
    BADGES.map((b) => ({
      label: b,
      href: `/data?badge=${encodeURIComponent(b)}`,
      count: all.filter((c) => c.verdict === b).length,
      on: badge === b,
    }))
  );
  return (
    <div>
      <h2 style={{ margin: "0 0 4px" }}>데이터 분석</h2>
      <p style={{ color: "#8c8c8c", margin: "0 0 12px" }}>
        해결된 작업이 라이브에서 어떤 변화를 냈는지 와디태그로 본 결과입니다. 카드를 누르면 그 오더의 데이터 탭으로 갑니다.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {filters.map((f) => (
          <Link
            key={f.label}
            href={f.href}
            style={{
              padding: "2px 10px",
              borderRadius: 12,
              border: `1px solid ${f.on ? "#1677ff" : "#d9d9d9"}`,
              color: f.on ? "#1677ff" : "inherit",
              fontSize: 13,
            }}
          >
            {f.label} {f.count}
          </Link>
        ))}
      </div>
      {cards.length === 0 ? (
        <p style={{ color: "#8c8c8c", textAlign: "center", marginTop: 48 }}>아직 분석한 작업이 없습니다</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 16 }}>
          {cards.map((c) => (
            <DataCard key={c.key} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}
