import { NfcCard } from "../model/Nfc.model"
import ApiError from "../utils/ApiError"

export const requireVerifiedNfc = asyncHandler(async(req,res)=>{
    const card = await NfcCard.findOne({user:req.user._id,isVerified:true})
    if(!card) throw new ApiError(403,"Please verify your NFC card first:")
    next()    
});