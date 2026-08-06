import type { TransferBreakdown, CreateTransferPayload } from "../../lib/api/movements";

export type MovementActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "preview"; preview: TransferBreakdown; payload: CreateTransferPayload }
  | { status: "error"; errorKey: string; fieldErrors?: Record<string, string[]> };

export const initialMovementActionState: MovementActionState = { status: "idle" };
