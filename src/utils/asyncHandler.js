

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next))
    .then(() => {
      // If handler didn't send response and didn't call next(), continue
      if (!res.headersSent && next) {
        next();
      }
    })
    .catch((err) => {
      // Prevent double response or headersSent crash
      if (res && !res.headersSent && typeof res.status === 'function') {
        const statusCode = err.statusCode || err.status || 500;
        const message = err.message || 'Internal Server Error';

        console.error('Async handler caught error:', {
          path: req?.originalUrl || 'unknown',
          method: req?.method || 'unknown',
          message,
          stack: err.stack,
          status: statusCode,
        });

        return res.status(statusCode).json({
          success: false,
          message,
          ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        });
      }

      // If res is not usable → pass to next or global handler
      console.error('Async handler fallback - res unavailable:', err);
      if (next && typeof next === 'function') {
        next(err);
      }
    });
};

export { asyncHandler };
