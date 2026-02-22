// src/pages/AdminGameScores.tsx
import { useEffect, useMemo, useState } from "react";
import AdminHeader from "../components/AdminHeader";
import "./AdminGameScores.css";

import { appDialog } from "../lib/appDialog";

import {
  adminFetchScores,
  adminDeleteScoreById,
  adminDeleteScoresByRange,
  type AdminScoreRow,
} from "./game/lib/adminScoreApi";

type DiffFilter = "all" | "easy" | "normal" | "hard";

function toJaDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("ja-JP");
  } catch {
    return iso;
  }
}

export default function AdminGameScores() {
  const [q, setQ] = useState("");
  const [difficulty, setDifficulty] = useState<DiffFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(200);

  const [rows, setRows] = useState<AdminScoreRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canBulkDelete = useMemo(() => Boolean(from && to && from <= to), [from, to]);

  const load = async () => {
    setLoading(true);
    setErr(null);

    const res = await adminFetchScores({ q, difficulty, from, to, limit });

    if (!res.ok) {
      setErr(res.error);
      setRows([]);
    } else {
      setRows(res.rows);
    }
    setLoading(false);
  };

  useEffect(() => {
    document.body.classList.add("adminScoresBody");
    void load();
    return () => document.body.classList.remove("adminScoresBody");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDeleteOne = async (id: string) => {
    const target = rows.find((r) => r.id === id);

    const ok = await appDialog.confirm({
      title: "削除確認",
      message: `このスコアを削除しますか？（元に戻せません）${
        target
          ? `\n\n名前：${target.display_name || "ゲスト"}\nスコア：${target.score}\n難易度：${String(
              target.difficulty
            ).toUpperCase()}\n日時：${toJaDateTime(target.created_at)}`
          : ""
      }`,
      okText: "削除する",
      cancelText: "キャンセル",
    });

    if (!ok) return;

    const res = await adminDeleteScoreById(id);
    if (!res.ok) {
      await appDialog.alert({
        title: "削除失敗",
        message: `削除に失敗しました。\n\n${res.error}`,
        okText: "OK",
      });
      return;
    }

    setRows((prev) => prev.filter((r) => r.id !== id));

    await appDialog.alert({
      title: "削除完了",
      message: "削除しました。",
      okText: "OK",
    });
  };

  const onBulkDelete = async () => {
    if (!canBulkDelete) return;

    const diffLabel = difficulty === "all" ? "全体" : difficulty.toUpperCase();

    const ok = await appDialog.confirm({
      title: "期間削除の確認",
      message: `期間削除しますか？（元に戻せません）\n\n期間：${from} 〜 ${to}\n難易度：${diffLabel}`,
      okText: "削除する",
      cancelText: "キャンセル",
    });

    if (!ok) return;

    const res = await adminDeleteScoresByRange({ from, to, difficulty });

    if (!res.ok) {
      await appDialog.alert({
        title: "期間削除失敗",
        message: `期間削除に失敗しました。\n\n${res.error}`,
        okText: "OK",
      });
      return;
    }

    await appDialog.alert({
      title: "期間削除完了",
      message: "期間削除しました。再読み込みします。",
      okText: "OK",
    });

    void load();
  };

  return (
    <div className="adminScoresPage">
      <AdminHeader />

      {/* ✅ AdminHeader（fixed想定）に被らないようにページ側で下げる */}
      <main className="adminScoresMain">
        <div className="adminScoresWrap">
          <div className="adminScoresHead">
            <h1 className="adminScoresTitle">ゲームスコア管理</h1>
            <div className="adminScoresSub">
              ※ スコアの更新（改ざん）は不可。削除のみ可能（管理者のみ）。
            </div>
          </div>

          <section className="adminScoresCard">
            <div className="adminScoresFilters">
              <div className="fRow">
                <label className="fLabel">
                  名前検索
                  <input
                    className="fInput"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="例：ゲスト / 山口 など"
                  />
                </label>

                <label className="fLabel">
                  難易度
                  <select
                    className="fSelect"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as DiffFilter)}
                  >
                    <option value="all">全体</option>
                    <option value="easy">EASY</option>
                    <option value="normal">NORMAL</option>
                    <option value="hard">HARD</option>
                  </select>
                </label>

                <label className="fLabel">
                  表示件数
                  <input
                    className="fInput"
                    type="number"
                    min={20}
                    max={1000}
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value || 200))}
                  />
                </label>
              </div>

              <div className="fRow">
                <label className="fLabel">
                  期間（From）
                  <input
                    className="fInput"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>

                <label className="fLabel">
                  期間（To）
                  <input className="fInput" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </label>

                <button type="button" className="btnPrimary" onClick={load} disabled={loading}>
                  {loading ? "読み込み中…" : "検索 / 更新"}
                </button>

                <button
                  type="button"
                  className="btnDanger"
                  onClick={onBulkDelete}
                  disabled={loading || !canBulkDelete}
                  title={!canBulkDelete ? "From と To を正しく入れてください" : ""}
                >
                  期間削除
                </button>
              </div>
            </div>

            {err && <div className="adminScoresErr">取得失敗：{err}</div>}
            {!err && loading && <div className="adminScoresInfo">読み込み中…</div>}

            {!loading && !err && (
              <div className="adminScoresTableWrap" role="region" aria-label="スコア一覧">
                <table className="adminScoresTable">
                  <thead>
                    <tr>
                      <th>日時</th>
                      <th>名前</th>
                      <th>スコア</th>
                      <th>難易度</th>
                      <th>種別</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="tdDate" data-label="日時">
                          {toJaDateTime(r.created_at)}
                        </td>
                        <td className="tdName" data-label="名前">
                          {r.display_name || "ゲスト"}
                        </td>
                        <td className="tdScore" data-label="スコア">
                          {r.score}
                        </td>
                        <td className="tdDiff" data-label="難易度">
                          {String(r.difficulty).toUpperCase()}
                        </td>
                        <td className="tdType" data-label="種別">
                          {r.is_guest ? "GUEST" : "USER"}
                        </td>
                        <td className="tdActions" data-label="操作">
                          <button type="button" className="btnSmallDanger" onClick={() => onDeleteOne(r.id)}>
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}

                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="tdEmpty">
                          該当データがありません
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}