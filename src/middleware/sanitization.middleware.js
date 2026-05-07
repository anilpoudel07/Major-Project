// Recursively strip keys that start with "$" or contain "." (NoSQL injection prevention).
// FIX: original used `clean(obj) || obj` which was misleading — objects are always truthy
// so the fallback never triggered. Simplified to direct mutation with no return value needed.
const clean = (obj) => {
  if (!obj || typeof obj !== "object") return;

  // Handle arrays by cleaning each element
  if (Array.isArray(obj)) {
    obj.forEach((item) => clean(item));
    return;
  }

  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
    } else if (obj[key] && typeof obj[key] === "object") {
      clean(obj[key]);
    }
  }
};

export const sanitize = (req, res, next) => {
  if (req.body) clean(req.body);
  if (req.params) clean(req.params);
  if (req.query) clean(req.query);
  next();
};


