import jwt from "jsonwebtoken";
import { User } from "../model/user.model.js";
import ApiError from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
  let token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");
  token = token?.trim(); 
  console.log(token);

  if (!token) {
    throw new ApiError(401, "Unauthorized - No token provided");
  }

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    console.log(decodedToken)
    const user = await User.findById(decodedToken?._id).select("-password -refreshToken");

    if (!user) {
      throw new ApiError(401, "Unauthorized - User not found");
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("JWT verification error:", error);
    let message = "Invalid or expired access token";
    if (error.name === "TokenExpiredError") {
      message = "Access token expired - Please refresh or login again";
    }
    throw new ApiError(401, message);
  }
});