import { useEffect, useMemo, useState } from "react";
import { fetchTopScores, type ScoreRow } from "../lib/scoreApi";

type Props = {
  limit?: number;
  difficulty?: "all" | "easy" | "normal" | "hard";
};

export default function GameRankingMini({
  limit = 8,
  difficulty = "all",
}: Props) {
  // ✅ 上位3位だけ
  const topLimit = useMemo(() => Math.min(3, Math.max(1, limit)), [limit]);

  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setErr(null);

      const res = await fetchTopScores({ difficulty, limit: topLimit });
      if (!mounted) return;

      if (!res.ok) {
        setErr(res.error || "unknown");
        setRows([]);
      } else {
        // ✅ 念のため3件に丸める（API側が多めに返してもOK）
        setRows(res.rows.slice(0, 3));
      }
      setLoading(false);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [difficulty, topLimit]);

  return (
    <div className="gRankCard" aria-label="ランキング">
      <div className="gRankHead">
        <div className="gRankTitle">ランキング</div>
        <div className="gRankSub">
          {difficulty === "all" ? "全体" : difficulty.toUpperCase()}
        </div>
      </div>

      {loading && <div className="gRankInfo">読み込み中…</div>}
      {err && <div className="gRankErr">取得失敗</div>}

      {!loading && !err && (
        <>
          {rows.length === 0 ? (
            <div className="gRankEmpty">まだ記録がありません</div>
          ) : (
            <div className="gRankTableWrap">
              <table className="gRankTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>名前</th>
                    <th>スコア</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 3).map((r, i) => (
                    <tr key={r.id}>
                      <td className="gRankNum">{i + 1}</td>
                      <td className="gRankName">{r.display_name || "ゲスト"}</td>
                      <td className="gRankScore">{r.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}