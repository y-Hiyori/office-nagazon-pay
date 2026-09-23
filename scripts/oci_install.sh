#!/usr/bin/env bash
# ==================================================================
# OCI（Oracle Cloud）Always Free インスタンス側の設定
#   Mac のターミナルから、このファイルをサーバーへ流し込むだけで完結します:
#       ssh <user>@<host> 'sudo bash -s' < scripts/oci_install.sh
#
#   やること:
#     1) stress-ng を入れて、6時間ごと45分の「無害な負荷」を回す
#        → Oracle のアイドル判定は「CPU<20% AND ネットワーク<20% AND メモリ<20%」の
#          AND 条件なので、CPU だけで 20% を超えていれば回収対象になりません。
#          95パーセンタイル方式なので「7日のうち5%以上」負荷が必要 → 6h×45m = 12.5%
#     2) 同じタイマーで Supabase と Vercel を叩く（サーバー側からの保険）
# ==================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "sudo で実行してください: ssh <user>@<host> 'sudo bash -s' < scripts/oci_install.sh" >&2
  exit 1
fi

# ---------- 1) 負荷ツール ----------
if ! command -v stress-ng >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y && apt-get install -y stress-ng curl
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y stress-ng curl
  elif command -v yum >/dev/null 2>&1; then
    yum install -y stress-ng curl
  else
    echo "パッケージマネージャを判別できませんでした。stress-ng を手動で入れてください" >&2
  fi
fi

# ---------- 2) 実行スクリプト ----------
cat > /usr/local/bin/oci_keepalive.sh <<'INNER'
#!/usr/bin/env bash
# OCI アイドル回収対策 + Supabase/Vercel への定期アクセス
set -uo pipefail

MINUTES="${KEEPALIVE_MINUTES:-45}"
WORKERS="${KEEPALIVE_WORKERS:-1}"
LOAD="${KEEPALIVE_CPU_LOAD:-60}"
MEM_MB="${KEEPALIVE_MEM_MB:-0}"
ENV_FILE="${KEEPALIVE_ENV_FILE:-/etc/oci-keepalive.env}"

log() { echo "[$(date '+%F %T %Z')] $*"; }

log "start minutes=${MINUTES} workers=${WORKERS} cpu_load=${LOAD}% mem=${MEM_MB}MB"

# ---- Supabase / Vercel への定期アクセス（アプリを開かなくても活動を作る） ----
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
  if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_ANON_KEY:-}" ]; then
    CODE=$(curl -sS -o /dev/null -w '%{http_code}' "${SUPABASE_URL%/}/rest/v1/products?select=id&limit=1" \
      -H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" || echo 000)
    log "supabase: HTTP ${CODE}"
  else
    log "supabase: skip（${ENV_FILE} に SUPABASE_URL / SUPABASE_ANON_KEY が未設定）"
  fi
  if [ -n "${VERCEL_URL:-}" ]; then
    CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$VERCEL_URL" || echo 000)
    log "vercel: HTTP ${CODE}"
  fi
else
  log "supabase: skip（${ENV_FILE} がありません）"
fi

# ---- 無害な負荷（アイドル判定よけ） ----
if command -v stress-ng >/dev/null 2>&1; then
  args=(--cpu "$WORKERS" --cpu-load "$LOAD" --timeout "${MINUTES}m" --metrics-brief)
  if [ "${MEM_MB}" -gt 0 ] 2>/dev/null; then
    args+=(--vm 1 --vm-bytes "${MEM_MB}M" --vm-keep)
  fi
  stress-ng "${args[@]}"
else
  log "stress-ng が無いので簡易負荷で代替します"
  END=$(( $(date +%s) + MINUTES * 60 ))
  PIDS=()
  for _ in $(seq "$WORKERS"); do
    ( while [ "$(date +%s)" -lt "$END" ]; do head -c 3000000 /dev/urandom | sha256sum >/dev/null; done ) &
    PIDS+=("$!")
  done
  wait "${PIDS[@]}" || true
fi

log "done"
INNER
chmod +x /usr/local/bin/oci_keepalive.sh

# ---------- 3) 環境ファイル（Supabase/Vercel の接続先） ----------
if [ ! -f /etc/oci-keepalive.env ]; then
  cat > /etc/oci-keepalive.env <<'INNER'
# keepalive から叩く接続先（アプリを開かなくても活動を作るため）
SUPABASE_URL=https://ztuxukezfshvihwxjojt.supabase.co
SUPABASE_ANON_KEY=
VERCEL_URL=https://office-nagazon-pay.vercel.app/
INNER
  chmod 600 /etc/oci-keepalive.env
  echo "※ /etc/oci-keepalive.env の SUPABASE_ANON_KEY を埋めてください（1行）"
fi

# ---------- 4) 6時間ごとのタイマー ----------
if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  cat > /etc/systemd/system/oci-keepalive.service <<'INNER'
[Unit]
Description=OCI Always Free keepalive (prevent idle reclamation) + Supabase/Vercel ping
After=network-online.target

[Service]
Type=oneshot
Environment=KEEPALIVE_MINUTES=45
Environment=KEEPALIVE_WORKERS=1
Environment=KEEPALIVE_CPU_LOAD=60
# メモリ負荷も足したい場合（A1 12GB 想定）
# Environment=KEEPALIVE_MEM_MB=3000
ExecStart=/usr/local/bin/oci_keepalive.sh
INNER

  cat > /etc/systemd/system/oci-keepalive.timer <<'INNER'
[Unit]
Description=Run OCI keepalive every 6 hours

[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
INNER

  systemctl daemon-reload
  systemctl enable --now oci-keepalive.timer
  echo "--- タイマー登録 ---"
  systemctl list-timers oci-keepalive.timer --no-pager || true
else
  ( crontab -l 2>/dev/null | grep -v oci_keepalive.sh ; \
    echo '0 */6 * * * /usr/local/bin/oci_keepalive.sh >> /var/log/oci_keepalive.log 2>&1' ) | crontab -
  echo "--- cron 登録 ---"
  crontab -l
fi

echo
echo "完了しました。動作テスト: sudo /usr/local/bin/oci_keepalive.sh  (45分かかります)"
