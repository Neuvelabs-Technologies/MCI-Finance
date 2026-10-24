/** An error with an HTTP status. `field` ties it to one form field so the client can highlight it. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message: string, field?: string) => new ApiError(400, message, field);
export const notFound = (message = 'Not found') => new ApiError(404, message);
export const unauthorized = (message = 'Not signed in') => new ApiError(401, message);
