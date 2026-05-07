import { NfcCard } from "../model/Nfc.model.js";
import ApiError from "../utils/ApiError.js";
// FIX: asyncHandler was used but never imported — caused a ReferenceError on every call.
import { asyncHandler } from "../utils/asyncHandler.js";

// FIX: `next` was missing from the parameter list — the call to next() would throw
// "next is not defined" and leave every request hanging with no response.
export const requireVerifiedNfc = asyncHandler(async (req, res, next) => {
  const card = await NfcCard.findOne({ user: req.user._id, isVerified: true });
  if (!card) throw new ApiError(403, "Please verify your NFC card first.");
  next();
});
