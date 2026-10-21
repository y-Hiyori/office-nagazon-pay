// src/components/SaleCountdown.tsx
// セール終了までの残り時間を表示（1分ごとに更新）
import { useEffect, useState } from "react";
import "./SaleCountdown.css";

type Props = {
  endsAt?: string | null;
  className?: string;
  prefix?: string;
};

function formatLeft(ms: number): string {
  if (ms <= 0) return "";
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return "まもなく終了";

  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;

  if (days > 0) return `あと${days}日${hours}時間`;
  if (hours > 0) return `あと${hours}時間${mins}分`;
  return `あと${mins}分`;
}

export default function SaleCountdown({ endsAt, className, prefix = "終了まで" }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return null;

  const left = end - now;
  if (left <= 0) return null;

  return (
    <span className={`sale-countdown ${className ?? ""}`.trim()}>
      {prefix} {formatLeft(left)}
    </span>
  );
}
