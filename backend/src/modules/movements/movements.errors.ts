import { AppError } from "../../shared/errors.js";

export class AccountAlreadyAtTargetBalanceError extends AppError {
  constructor() {
    super(
      "Account already has the requested balance",
      400,
      "ACCOUNT_ALREADY_AT_TARGET_BALANCE",
    );
  }
}
