import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { processTapEvent } from "../service/tap.service.js";

/**
 * Handle NFC tap event from ESP8266
 * POST /api/v1/user/tap
 */
export const handleTap = asyncHandler(async (req, res) => {
  const { rfid, busId, latitude, longitude } = req.body;

  const result = await processTapEvent(rfid, busId, latitude, longitude);

  return res.status(200).json(
    new ApiResponse(200, result, result.message)
  );
});

