

const clean = (obj) => {
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
};

export const sanitize = (req, res, next) => {
 
  if (req.body) req.body = clean(req.body) || req.body;
  if (req.params) req.params = clean(req.params) || req.params;

  if (req.query) {
    clean(req.query);
  }

  next();
};