import mongoose from "mongoose";
const NfcCardSchema = new mongoose. Schema({
  cardUid:      { type: String, required: true, unique: true },   // Physical UID
 user:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  balance:      { type: Number, default: 0, min: 0 },
  cardType:     { type: String, enum: ['personal','student','senior','temporary'], default: 'personal' },
  status:{type:String, enum:["active","lost","blocked"]},
  isActive:     { type: Boolean, default: true },
  lastUsedAt:   Date,
  issuedAt:     Date,
  expiresAt:    Date,
  isVerified:{type:Boolean,defalut:false}

})
NfcCardSchema.index({ cardUid: 1 });
NfcCardSchema.index({ owner: 1 });

export const  NfcCard = new mongoose.model("NfcCard",NfcCardSchema)