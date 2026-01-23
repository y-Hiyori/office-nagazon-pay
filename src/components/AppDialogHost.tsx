// src/components/AppDialogHost.tsx
import { useEffect, useState } from "react";
import { registerDialogEmitter } from "../lib/appDialog";
import "./AppDialogHost.css";

type AlertPayload = {
  title?: string;
  message: string;
  okText?: string;
};

type ConfirmPayload = {
  title?: string;
  message: string;
  okText?: string;
  cancelText?: string;
};

type DialogState =
  | null
  | {
      kind: "alert";
      payload: AlertPayload;
      resolve: () => void;
    }
  | {
      kind: "confirm";
      payload: ConfirmPayload;
      resolve: (v: boolean) => void;
    };

export default function AppDialogHost() {
  const [dlg, setDlg] = useState<DialogState>(null);

  useEffect(() => {
    registerDialogEmitter((req) => {
      setDlg(req as any);
    });
  }, []);

  useEffect(() => {
    // 開いてる間スクロール禁止（Contactのモーダルと同じ系）
    document.body.style.overflow = dlg ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [dlg]);

  if (!dlg) return null;

  const title = dlg.payload.title || "お知らせ";
  const msg = dlg.payload.message;

  const closeAlert = () => {
    if (dlg.kind !== "alert") return;
    const r = dlg.resolve;
    setDlg(null);
    r();
  };

  const closeConfirm = (v: boolean) => {
    if (dlg.kind !== "confirm") return;
    const r = dlg.resolve;
    setDlg(null);
    r(v);
  };

  return (
    <div className="appdlg-overlay" role="presentation">
      <div className="appdlg-shell" role="dialog" aria-modal="true" aria-label={title}>
        <div className="appdlg-title">{title}</div>
        <div className="appdlg-msg">{msg}</div>

        {dlg.kind === "alert" ? (
          <div className="appdlg-actions">
            <button type="button" className="appdlg-btn appdlg-primary" onClick={closeAlert}>
              {dlg.payload.okText || "OK"}
            </button>
          </div>
        ) : (
          <div className="appdlg-actions">
            <button
              type="button"
              className="appdlg-btn appdlg-sub"
              onClick={() => closeConfirm(false)}
            >
              {dlg.payload.cancelText || "キャンセル"}
            </button>
            <button
              type="button"
              className="appdlg-btn appdlg-primary"
              onClick={() => closeConfirm(true)}
            >
              {dlg.payload.okText || "OK"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}