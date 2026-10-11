// src/components/Loading.tsx
// 読み込み中の共通表示（回転するリング＋ゆっくり点滅する文字）
import "./Loading.css";

type Props = {
  /** 表示する文言（既定：読み込み中） */
  label?: string;
  /** full: 画面全体の中央 / block: 枠内の中央 / compact: 小さな枠内 / inline: 文中の小さな表示 */
  variant?: "full" | "block" | "compact" | "inline";
};

export default function Loading({ label = "読み込み中", variant = "block" }: Props) {
  if (variant === "inline") {
    return (
      <span className="app-loading-inline" role="status" aria-live="polite">
        <span className="app-spinner app-spinner--sm" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <div className={`app-loading app-loading--${variant}`} role="status" aria-live="polite">
      <span className="app-spinner" aria-hidden="true" />
      <span className="app-loading-label">
        {label}
        <span className="app-loading-dots" aria-hidden="true">
          <i>.</i>
          <i>.</i>
          <i>.</i>
        </span>
      </span>
    </div>
  );
}
