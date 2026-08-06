"use client";

import { useEffect, useRef } from "react";

import type { CategoryActionState } from "../action-state";

export function useCloseOnActionSuccess(
  status: CategoryActionState["status"],
  pending: boolean,
  onOpenChange: (open: boolean) => void,
  onSuccess?: () => void,
) {
  const previousStatus = useRef<CategoryActionState["status"]>(status);
  useEffect(() => {
    if (pending) {
      previousStatus.current = "idle";
      return;
    }
    if (status === "success" && previousStatus.current !== "success") {
      onSuccess?.();
      window.setTimeout(() => onOpenChange(false), 0);
    }
    previousStatus.current = status;
  }, [onOpenChange, onSuccess, pending, status]);
}

export function useActionSuccess(
  status: CategoryActionState["status"],
  pending: boolean,
  onSuccess?: () => void,
) {
  const previousStatus = useRef<CategoryActionState["status"]>(status);
  useEffect(() => {
    if (pending) {
      previousStatus.current = "idle";
      return;
    }
    if (status === "success" && previousStatus.current !== "success") onSuccess?.();
    previousStatus.current = status;
  }, [onSuccess, pending, status]);
}
