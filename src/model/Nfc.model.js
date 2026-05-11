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

  // FIX: default was 0 but min was 100 — Mongoose would reject any save on a
  // freshly-created card. Default is now 0 (card starts empty). The business
  // rule of "minimum 100 to be usable" is enforced in tap.service.js by
  // checking nfcCard.balance >= fare before deducting, NOT in the schema.
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

  lastUsedAt: Date,

  requestedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for fast tap lookups (the hot path hit on every NFC scan)
nfcCardSchema.index({ cardUid: 1 });
nfcCardSchema.index({ user: 1 });

export const NfcCard = mongoose.model("NfcCard", nfcCardSchema);
