// src/middleware/sanitization.middleware.js

export const sanitize = (req, res, next) => {
  function clean(obj) {
    if (!obj || typeof obj !== "object") return obj;

    for (const key in obj) {
      if (key.startsWith("$") || key.includes(".")) {
        delete obj[key];
        continue;
      }
      if (obj[key] && typeof obj[key] === "object") {
        clean(obj[key]);
      }
    }
    return obj;
  }


  if (req.body) req.body = clean(req.body);
  if (req.query) req.query = clean(req.query);
  if (req.params) req.params = clean(req.params);

  next();
};