import ApiError from "../utils/ApiError.js";

export const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    // FIX: was `throw new ApiError(400, error)` which passed the full Zod error object
    // as the message — stringified to "[object Object]" in the response.
    // Now extracts human-readable field errors from Zod's error.errors array.
    const messages = error.errors?.map((e) => `${e.path.join(".")}: ${e.message}`) ?? [
      error.message,
    ];
    throw new ApiError(400, messages.join(", "), error.errors ?? []);
  }
};
