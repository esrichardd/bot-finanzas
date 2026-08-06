"use client";

import { useEffect, useRef } from "react";
import type { CreditCardActionState } from "../action-state";

export function useCreditCardActionSuccess(
  state: CreditCardActionState,
  pending: boolean,
  onSuccess?: () => void,
) {
  const previousStatus = useRef<CreditCardActionState["status"]>(state.status);
  useEffect(() => {
    if (pending) {
      previousStatus.current = "idle";
      return;
    }
    if (state.status === "success" && previousStatus.current !== "success") onSuccess?.();
    previousStatus.current = state.status;
  }, [onSuccess, pending, state.status]);
}
