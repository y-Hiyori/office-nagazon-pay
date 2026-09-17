// src/lib/scrollLock.ts
// モーダルやドロワー表示中だけ body のスクロールを止める
// html には触らない。解除時は "" に戻して元のCSSへ返す。

const locks = new Set<string>();

function apply() {
  if (typeof document === "undefined") return;

  const locked = locks.size > 0;

  // html 全体は触らず、body だけ最小限ロックする
  document.documentElement.style.overflowY = "";
  document.body.style.overflowY = locked ? "hidden" : "";
  document.body.style.touchAction = locked ? "none" : "";
  document.body.dataset.scrollLocked = locked ? "true" : "false";
}

export function lockScroll(key: string) {
  locks.add(key);
  apply();
}

export function unlockScroll(key: string) {
  locks.delete(key);
  apply();
}

export function resetScrollLocks() {
  locks.clear();
  apply();
}
