import { AppError } from "../../shared/errors.js";

export class CategoryNameConflictError extends AppError {
  constructor() {
    super(
      "An active category with that name already exists at this level",
      400,
      "CATEGORY_NAME_CONFLICT",
    );
  }
}

export class CategoryAlreadyArchivedError extends AppError {
  constructor() {
    super("Category is already archived", 400, "CATEGORY_ALREADY_ARCHIVED");
  }
}

export class CategoryAlreadyActiveError extends AppError {
  constructor() {
    super("Category is already active", 400, "CATEGORY_ALREADY_ACTIVE");
  }
}

export class CategoryParentArchivedError extends AppError {
  constructor() {
    super("The parent category must be active", 400, "CATEGORY_PARENT_ARCHIVED");
  }
}
