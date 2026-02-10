import mongoose from "mongoose";
import ApiError from "../utils/ApiError.js";

const errorHandler = (err, req, res, next) => {
  // Prevent double response
  if (res.headersSent) {
    console.warn('Global error handler: Headers already sent - skipping');
    return next(err);
  }

  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode =
      error.statusCode || (error instanceof mongoose.Error ? 400 : 500);
    const message = error.message || "Something went wrong";

    error = new ApiError(statusCode, message, error?.errors || [], err.stack);
  }

  const response = {
    success: error.success,
    message: error.message,
    errors: error.errors,
    ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}),
  };

  console.error('Global error handler caught:', {
    path: req.originalUrl,
    method: req.method,
    status: error.statusCode,
    message: error.message,
    stack: error.stack,
  });

  return res.status(error.statusCode).json(response);
};

export { errorHandler };
