# keepalive（ターミナルだけで完結する版）

各サービスの管理画面（GitHub Secrets、Vercel、Supabase、cron-job.org など）を
**一切触らずに**、ターミナルだけで自動アクセスを仕組みにします。

## なぜ画面設定が不要なのか

このリポジトリには **`.env` がコミットされている**（`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`）ため、
GitHub Actions はリポジトリをチェックアウトして `.env` を読むだけで接続できます。
→ **Secrets 登録が不要**。Supabase 側の設定も不要（クエリを投げるだけ）。
→ OCI 側も SSH で流し込むだけ（コンソール操作は不要）。

---

## セットアップ（コマンド2つ）

```bash
cd ~/Downloads
unzip nagazon_keepalive_v2.zip -d nagazon_keepalive && cd nagazon_keepalive

# Mac側（Supabase対策 + push）だけなら
bash setup_keepalive.sh

# OCI サーバー側（アイドル回収対策）まで自動でやるなら
bash setup_keepalive.sh ubuntu@161.33.19.160        # ← 実際のSSHユーザー名に合わせて
```

`setup_keepalive.sh` がやること：

1. `.github/workflows/keepalive.yml` と `scripts/oci_install.sh` をリポジトリへ配置
2. `.env` に接続情報があるか確認
3. ビルド確認（`npm run build`）
4. commit & push（← ここで GitHub 側の毎日実行が有効になる）
5. SSH でサーバーに `oci_install.sh` を流し込み、6時間ごとの systemd タイマーを登録

途中で `git push` が失敗する場合は、`git config user.email` が GitHub の登録メールと
一致しているか確認してください（自動デプロイが止まっていた原因と共通です）。

---

## 各サービスの止まる条件と対策（公式情報）

| 対象 | 止まる条件 | このパッケージの対策 |
|---|---|---|
| **Supabase（無料）** | 7日間、DB へのユーザーアクティビティが少ないと一時停止。公式いわく「毎日数回のリクエストで十分」 | GitHub Actions が毎日 1回 REST で実クエリ。さらに OCI のタイマーからも 6時間ごとに実施（二重化） |
| **OCI Always Free** | 7日間ずっと「CPU 95パーセンタイル < 20%」**かつ**「ネットワーク < 20%」**かつ**「メモリ < 20%」（A1 のみ）でアイドル判定 → 回収されることがある | 3条件は **AND**。CPU だけで 20% を超えれば対象外。6時間ごと45分の負荷（=7日の12.5%、5%以上必要） |
| **GitHub Actions** | 公開リポジトリは **60日間リポジトリ活動が無いと予約実行が無効化**される（無言） | 毎月1日、`keepalive` ブランチに空コミットを積む |

参照:
[Supabase Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing) ／
[Oracle Always Free Resources（Idle Compute Instances）](https://docs.oracle.com/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) ／
[GitHub: Disabling and enabling a workflow](https://docs.github.com/actions/managing-workflow-runs/disabling-and-enabling-a-workflow)

> **補足**: 公開リポジトリの GitHub Actions は**無料・分数無制限**です（このリポジトリは public）。
> Vercel Hobby に「無操作で停止」する仕組みはありません。空コミットは `main` ではなく
> `keepalive` ブランチに積むので、不要な本番デプロイは発生しません。

---

## 手动了動かし方・確認

```bash
# GitHub 側を今すぐ1回実行
gh workflow run keepalive.yml
gh run list --workflow=keepalive.yml --limit 3

# OCI 側を今すぐ1回実行（45分かかります）
ssh ubuntu@161.33.19.160 'sudo /usr/local/bin/oci_keepalive.sh'

# 次のタイマー予定
ssh ubuntu@161.33.19.160 'systemctl list-timers oci-keepalive.timer'

# Supabase が生きているか手元で確認
set -a; . ./.env; set +a
curl -s -o /dev/null -w "%{http_code}\n" \
  "${VITE_SUPABASE_URL%/}/rest/v1/products?select=id&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
```

---

## 調整値（サーバー上の `/etc/systemd/system/oci-keepalive.service`）

| 変数 | 既定 | 意味 |
|---|---|---|
| `KEEPALIVE_MINUTES` | 45 | 1回の負荷時間。6時間ごと45分で 7日の 12.5%（必要なのは 5% 以上） |
| `KEEPALIVE_WORKERS` | 1 | CPU ワーカー数。2 OCPU なら 1〜2 |
| `KEEPALIVE_CPU_LOAD` | 60 | 1ワーカーあたりの CPU 使用率(%)。2 OCPU で60% ≒ 全体30% |
| `KEEPALIVE_MEM_MB` | 0 | メモリ負荷（MB）。CPU だけで条件は満たせるので通常不要 |

> ⚠️ Oracle の測定間隔は非公開です。回収されると**インスタンスごと消えて再作成**になるため、
> 余裕を持った設定にしています。

---

## 注意点（セキュリティ）

- `.env` は**公開リポジトリにコミットされています**。今回の仕組みはこれを前提にしています。
  anon キーはもともと配信JSに埋め込まれる公開前提のキーなので、この構成で新たに漏れる情報はありません。
  **ただし将来 `SERVICE_ROLE_KEY` を `.env` に入れるのは絶対に避けてください**（全権限キーです）。
  その場合だけ、GitHub Secrets に移して `keepalive.yml` から `secrets.*` を参照する形に変えます。
- サーバー側の `/etc/oci-keepalive.env` は `chmod 600` で作成されます。

## 止まってしまったときの復旧

| 対象 | 復旧方法 |
|---|---|
| Supabase | ダッシュボード → 組織 → 該当プロジェクト → **Resume project**（停止から1年以内） |
| OCI インスタンス | 回収されると復元不可。コンソールから再作成が必要 |
| GitHub Actions | Actions タブ → 該当ワークフロー → **Enable workflow** |
