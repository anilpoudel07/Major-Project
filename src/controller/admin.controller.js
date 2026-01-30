import { success } from "zod";
import { User } from "../model/user.model.js";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { NfcCard } from "../model/Nfc.model.js";

export const getAllData = asyncHandler(async (req, res, next) => {
  const user = await User.find().select("-password -refreshToken");
  res.json(new ApiResponse(200, user, "All users are fetched"));
});

export const updateRoleByAdmin = asyncHandler(async (req, res, next) => {
  const { role } = req.body;
  const validRoles = ["driver", "operator", "admin"];

  if (!validRoles.includes(role)) {
    throw new ApiError(400, "Invalid role");
  }

  await User.findByIdAndUpdate(
    req.params.userId,
    {
      $addToSet: {
        user_type: role,
      },
    },
    { new: true }
  );

  res.json(new ApiResponse(200, {}, `${role} role added successfully`));
});

export const removeRole = asyncHandler(async (req, res) => {
  const { role } = req.body;

  await User.findByIdAndUpdate(
    req.params.userId,
    {
      $pull: {
        user_type: role,
      },
    },
    { new: true }
  );

  res.json(new ApiResponse(200, {}, `${role} role removed`));
});

export const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (req.user._id.toString() === userId) {
    throw new ApiError(400, "You cannot delete yourself");
  }

  const deletedUser = await User.findByIdAndDelete(userId);

  return res.json(
    new ApiResponse(200, {
      _id: deletedUser._id,
      FirstName: deletedUser.FirstName,
      email: deletedUser.email,
    }, "User deleted permanently")
  );
});

export const getPendingNfcCard = asyncHandler(async (req, res) => {
  const pendingCards = await NfcCard.find({ isVerified: false })
    .populate("user", "FirstName email phone nid")
    .lean();

  const result = pendingCards.map((card) => ({
    _id: card._id,
    cardUid: card.cardUid,
    cardType: card.cardType || "personal",
    requestedAt: card.requestedAt,
    user: {
      FirstName: card.user.FirstName,
      email: card.user.email,
      phone: card.user.phone,
      nid: card.user.nid,
    },
  }));

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Pending NFC card requests fetched successfully"
      )
    );
});

export const verifyNfcCard = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const card = await NfcCard.findById(id);
  if (!card) throw new ApiError(404, "NFC card not found");

  if (card.isVerified) {
    return res
      .status(200)
      .json(new ApiResponse(200, card, "Card already verified"));
  }

  card.isVerified = true;
  card.verifiedBy = req.user._id;
  card.verifiedAt = new Date();

  await card.save();
  await card.populate("user", "FirstName email");

  res
    .status(200)
    .json(new ApiResponse(200, card, "NFC card verified successfully"));
});

export const rejectNfcCard = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await NfcCard.findByIdAndDelete(id);

  res
    .status(200)
    .json(new ApiResponse(200, null, "Card registration rejected"));
});

