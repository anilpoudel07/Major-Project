// src/model/Nfc.model.js
import mongoose from "mongoose";

const nfcCardSchema = new mongoose.Schema({
  cardUid: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  cardType: {
    type: String,
    enum: ["personal", "student", "senior", "temporary"],
    default: "personal",
  },
  isVerified: {
    type: Boolean,
    default: false,   
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  verifiedAt: Date,
  requestedAt: {
    type: Date,
    default: Date.now,
  },
});

export const NfcCard = mongoose.model("NfcCard", nfcCardSchema);