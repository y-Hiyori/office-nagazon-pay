// src/lib/scrollLock.ts
//
// ✅ スクロールロックを「参照カウント」風に安全に管理するユーティリティ。
// どこかが lock している間だけ body を overflow:hidden にする。
// （ドロワー／モーダルが複数重なっても、解除漏れで全体がスクロール不能にならないようにする）

const locks = new Set<string>();

function apply() {
  if (typeof document === "undefined") return;
  document.body.style.overflow = locks.size > 0 ? "hidden" : "";
}

export function lockScroll(key: string) {
  locks.add(key);
  apply();
}

export function unlockScroll(key: string) {
  locks.delete(key);
  apply();
}

// 何かがバグってロックが残った時の「強制解除」
export function resetScrollLocks() {
  locks.clear();
  apply();
}