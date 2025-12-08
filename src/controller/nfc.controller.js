import { NfcCard } from "../model/Nfc.model.js";
import { User } from "../model/user.model.js";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const registerNfcCard = asyncHandler(async (req, res) => {
  const { cardUid, cardType = "personal" } = req.body;
  const userId = req.user?._id;
  console.log(userId);

  if (!cardUid) {
    throw new ApiError(400, "Card UID is required");
  }

  const normalizedUid = cardUid.toUpperCase().trim();

  const existingCard = await NfcCard.findOne({ cardUid: normalizedUid });


  if (existingCard) {
    if (existingCard.user.toString() !== userId.toString()) {
      throw new ApiError(403, "This card is already registered to another user");
    }

    return res.status(200).json(
      new ApiResponse(200, existingCard, "Card already registered")
    );
  }


  const newCard = await NfcCard.create({
    cardUid: normalizedUid,
    user: userId,
    cardType,
    isVerified: false,
  });


await User.updateOne(
  { _id: userId, defaultNfcCard: null },
  { $set: { defaultNfcCard: newCard._id } }
);
const user = await User.findById(userId);
console.log(await User.findById(user.defaultNfcCard));


  return res.status(201).json(
    new ApiResponse(201, newCard, "NFC card registered! Waiting for admin verification")
  );
});



export { registerNfcCard };
