import mongoose from "mongoose";
const NfcCardSchema = new mongoose. Schema({
  cardUid:      { type: String, required: true, unique: true },   // Physical UID
  owner:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  balance:      { type: Number, default: 0, min: 0 },
  cardType:     { type: String, enum: ['personal','student','senior','temporary'], default: 'personal' },
  isActive:     { type: Boolean, default: true },
  lastUsedAt:   Date,
  issuedAt:     Date,
  expiresAt:    Date,
     isActive:{type:Boolean, default:true},

})
NfcCardSchema.index({ cardUid: 1 });
nfcCardSchema.index({ owner: 1 });

export const  NfcCard = new mongoose.model("NfcCard",NfcCardSchema)