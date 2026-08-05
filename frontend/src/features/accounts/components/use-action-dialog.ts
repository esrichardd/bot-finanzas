"use client";

import { useEffect, useRef } from "react";

import type { AccountActionState } from "../action-state";

export function useActionSuccess(
  status: AccountActionState["status"],
  pending: boolean,
  onSuccess?: () => void,
) {
  const previousStatus = useRef<AccountActionState["status"]>(status);

  useEffect(() => {
    if (pending) {
      previousStatus.current = "idle";
      return;
    }
    if (status === "success" && previousStatus.current !== "success") {
      onSuccess?.();
    }
    previousStatus.current = status;
  }, [onSuccess, pending, status]);
}

export function useCloseOnActionSuccess(
  status: AccountActionState["status"],
  pending: boolean,
  onOpenChange: (open: boolean) => void,
  onSuccess?: () => void,
) {
  useActionSuccess(status, pending, () => {
    onSuccess?.();
    window.setTimeout(() => onOpenChange(false), 0);
  });
}
