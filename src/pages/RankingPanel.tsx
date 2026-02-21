// src/pages/RankingPanel.tsx
import { useEffect, useState } from "react";
import { fetchTopScores, type ScoreRow } from "./game/lib/scoreApi";

export default function RankingPanel() {
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);

    const res = await fetchTopScores({ difficulty: "all", limit: 20 });

    if (!res.ok) setErr(res.error);
    else setRows(res.rows);

    setLoading(false);
  };

  useEffect(() => {
    void load(); // 初回だけ取得（更新ボタンなし）
  }, []);

  return (
    <section className="rankPanel">
      <div className="rankHead">
        <h3 className="rankTitle">ランキング（全体）</h3>
      </div>

      {loading && <div className="rankInfo">読み込み中…</div>}
      {err && <div className="rankErr">取得失敗：{err}</div>}

      {!loading && !err && (
        <div className="rankTableWrap">
          <table className="rankTable">
            <thead>
              <tr>
                <th>#</th>
                <th>名前</th>
                <th>スコア</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="rankNum">{i + 1}</td>
                  <td className="rankName">
                    {r.display_name || "ゲスト"}
                  </td>
                  <td className="rankScore">{r.score}</td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="rankEmpty">
                    まだ記録がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}