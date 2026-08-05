import { AppError } from "../../shared/errors.js";

export class AccountNameConflictError extends AppError {
  constructor() {
    super(
      "An active account with that name already exists",
      400,
      "ACCOUNT_NAME_CONFLICT",
    );
  }
}

export class AccountBalanceNotZeroError extends AppError {
  constructor() {
    super(
      "Account balance must be zero before archiving",
      400,
      "ACCOUNT_BALANCE_NOT_ZERO",
    );
  }
}

export class AccountAlreadyActiveError extends AppError {
  constructor() {
    super("Account is already active", 400, "ACCOUNT_ALREADY_ACTIVE");
  }
}
