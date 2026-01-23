// src/lib/appDialog.ts
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

type DialogRequest =
  | { kind: "alert"; payload: AlertPayload; resolve: () => void }
  | { kind: "confirm"; payload: ConfirmPayload; resolve: (v: boolean) => void };

let emit: ((req: DialogRequest) => void) | null = null;

export function registerDialogEmitter(fn: (req: DialogRequest) => void) {
  emit = fn;
}

export const appDialog = {
  alert(payload: AlertPayload) {
    return new Promise<void>((resolve) => {
      if (!emit) return resolve(); // Hostが無い場合でも落ちない
      emit({ kind: "alert", payload, resolve });
    });
  },

  confirm(payload: ConfirmPayload) {
    return new Promise<boolean>((resolve) => {
      if (!emit) return resolve(false);
      emit({ kind: "confirm", payload, resolve });
    });
  },
};