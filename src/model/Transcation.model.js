import mongoose, { Schema } from "mongoose";

const transactionSchema = new Schema(
  {
    txnId: { type: String, required: true, unique: true }, // e.g. TXN-20251229-001A
    nfcCard: { type: Schema.Types.ObjectId, ref: "NfcCard", required: true },
    passenger: { type: Schema.Types.ObjectId, ref: "User" },
    trip: { type: Schema.Types.ObjectId, ref: "Trip" },
    busId: {
      type: Schema.Types.ObjectId,
      ref: "Bus"
    },
    khalti: {
      pidx: String,
      transactionId: String,           
      amount: Number,
      status: {
        type: String,
        enum: ["initiated", "completed", "failed", "refunded", "cancelled"], // ← added "cancelled" (common & useful)
      }
    },
    
    isAutoTopup:{
      type:Boolean,
      default:false
    },
    topupAmount:{
      type:Number,
      default:0
    },
    operatorId: {
      type: Schema.Types.ObjectId,
      ref: "Operator"
    },

    tapIn: {
      time: { type: Date, required: false, default: Date.now() },
      stop: { type: Schema.Types.ObjectId, ref: "Stop" },
      location: { type: [Number], index: "2dsphere" }, // [lng, lat]
    },
    tapOut: {
      time: Date,
      stop: { type: Schema.Types.ObjectId, ref: "Stop" },
      location: { type: [Number], index: "2dsphere" },
    },
    requiredTopup: {
      type: Number,
    },

    fare: { type: Number },// calculated on tap-out
   status: {
      type: String,
      enum: [
        "pending_exit",
        "payment_initiated",       // ← added this
        "completed",
        "no_tap_out",
        "failed",
        "refunded",
        "payment_required",
        // Optional additions you might want later:
        // "payment_pending",      // after initiation but awaiting confirmation
        // "cancelled",
      ],
      default: "pending_exit",
    }, 

   
    offline: { type: Boolean, default: false }, // generated on driver tablet
  },
  { timestamps: true }
);
transactionSchema.index({ nfcCard: 1, status: 1 });
transactionSchema.index({ trip: 1 });

export const Transcation = new mongoose.model("Transcation", transactionSchema);
