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

  balance: {
    type: Number,
    default: 0,
    min: 0,
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

  isActive: {
    type: Boolean,
    default: true,
  },

  verifiedAt: Date,

  requestedAt: {
    type: Date,
    default: Date.now,
  },
});

export const NfcCard = mongoose.model("NfcCard", nfcCardSchema);

