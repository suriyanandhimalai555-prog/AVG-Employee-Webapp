// Define a base class for custom application errors that extends the built-in Error class
export class AppError extends Error {
  // Use 'public' in the constructor to automatically declare and assign properties to the class instance
  constructor(public message: string, public statusCode: number, public code: string) {
    // Call the parent 'Error' constructor with the provided error message
    super(message);
    // Explicitly set the prototype to ensure 'instanceof' checks work correctly with custom error classes
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// Define a specific error class for situations where a resource is not found (404)
export class NotFoundError extends AppError {
  constructor(message: string, code: string = 'NOT_FOUND') {
    // Invoke the parent constructor with the message, HTTP status code 404, and the provided or default error code
    super(message, 404, code);
  }
}

// Define a specific error class for forbidden access situations (403)
export class ForbiddenError extends AppError {
  constructor(message: string, code: string = 'FORBIDDEN') {
    // Invoke the parent constructor with the message, HTTP status code 403, and the provided or default error code
    super(message, 403, code);
  }
}

// Define a specific error class for unauthenticated or unauthorized access situations (401)
export class UnauthorizedError extends AppError {
  constructor(message: string, code: string = 'UNAUTHORIZED') {
    // Invoke the parent constructor with the message, HTTP status code 401, and the provided or default error code
    super(message, 401, code);
  }
}

// Define a specific error class for resource conflict situations, such as duplicate entries (409)
export class ConflictError extends AppError {
  constructor(message: string, code: string = 'CONFLICT') {
    // Invoke the parent constructor with the message, HTTP status code 409, and the provided or default error code
    super(message, 409, code);
  }
}

// Define a specific error class for invalid input or request data situations (400)
export class ValidationError extends AppError {
  constructor(message: string, code: string = 'VALIDATION_ERROR') {
    // Invoke the parent constructor with the message, HTTP status code 400, and the provided or default error code
    super(message, 400, code);
  }
}
