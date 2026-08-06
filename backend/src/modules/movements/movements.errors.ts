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

export class TransferSameAccountError extends AppError {
  constructor() {
    super("Cannot transfer to the same account", 400, "TRANSFER_SAME_ACCOUNT");
  }
}

export class TransferDestinationAmountRequiredError extends AppError {
  constructor() {
    super("Destination amount is required for cross-currency transfers", 400, "TRANSFER_DESTINATION_AMOUNT_REQUIRED");
  }
}

export class TransferSameCurrencyAmountMismatchError extends AppError {
  constructor() {
    super("Same-currency transfers must have equal amounts", 400, "TRANSFER_SAME_CURRENCY_AMOUNT_MISMATCH");
  }
}

export class TransferSourceFeesExceedAmountError extends AppError {
  constructor() {
    super("Source deducted fees must be less than the transfer amount", 400, "TRANSFER_SOURCE_FEES_EXCEED_AMOUNT");
  }
}

export class TransferDestinationFeesExceedAmountError extends AppError {
  constructor() {
    super("Destination fees must be less than the received amount", 400, "TRANSFER_DESTINATION_FEES_EXCEED_AMOUNT");
  }
}

export class TransferAmountOverflowError extends AppError {
  constructor() {
    super("Transfer amount is too large", 400, "TRANSFER_AMOUNT_OVERFLOW");
  }
}
