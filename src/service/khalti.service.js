import { asyncHandler } from "../utils/asyncHandler.js";
import axios from "axios";
import ApiError from "../utils/ApiError.js";

const KHALTI_BASE_URL = process.env.KHALTI_BASE_URL || "https://a.khalti.com/api/v2/";

export const initiateKhalti = async (payload) => {
  try {
    console.log("[Khalti] Base URL:", KHALTI_BASE_URL);
    console.log("[Khalti] Payload:", payload);

    const response = await axios.post(
      `${KHALTI_BASE_URL}epayment/initiate/`,
      payload,
      {
        headers: {
          Authorization: `Key ${process.env.KHALTI_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    console.log("[Khalti] SUCCESS:", response.data);
    return response.data;
  } catch (error) {
    console.error("[Khalti] FAILED:", {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      code: error.code,
    });

    if (error.response?.status === 503) {
      throw new ApiError(503, "Khalti service temporarily unavailable");
    }

    throw new ApiError(
      error.response?.status || 500,
      error.response?.data?.detail || error.message || "Khalti initiation failed"
    );
  }
};
export const verifyKhalti = async (pidx) => {
  try {
    console.log("[VERIFY KHALTI] pidx:", pidx);

    const response = await axios.post(
      `${process.env.KHALTI_BASE_URL || 'https://a.khalti.com/api/v2/'}epayment/lookup/`,
      { pidx },
      {
        headers: {
          Authorization: `Key ${process.env.KHALTI_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (!response?.data) {
      throw new ApiError(500, "Empty response from Khalti lookup");
    }

    console.log("[VERIFY KHALTI] Success:", response.data);
    return response.data;
  } catch (error) {
    console.error("[VERIFY KHALTI] Failed:", {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      code: error.code,
    });

    throw new ApiError(
      error.response?.status || 500,
      error.response?.data?.detail || error.message || "Khalti verification failed"
    );
  }
};
