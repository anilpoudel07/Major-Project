import { NfcCard } from "../model/Nfc.model.js";
import { User } from "../model/user.model.js";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const registerNfcCard = asyncHandler(async (req, res) => {
    const { userId, cardUid, cardType = "personal" } = req.body;

    
    const existedUser = await User.findById(userId).select("-password -refreshToken");
    if (!existedUser) {
        throw new ApiError(404, "User not found");
    }

   
    const existingCard = await NfcCard.findOne({ cardUid });
    if (existingCard) {
        throw new ApiError(400, "This NFC card UID is already registered");
    }

    
    const nfcCard = await NfcCard.create({
        cardUid,
        user: userId,
        cardType
    });

    
    if (!existedUser.default_card) {
        existedUser.default_card = nfcCard._id;
        await existedUser.save();
    }

   
    return res.status(200).json(
        new ApiResponse(
            nfcCard,
            "NFC card has been successfully created and linked to the user"
        )
    );
});

export { registerNfcCard };
