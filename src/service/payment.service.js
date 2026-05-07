import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyKhalti } from "./khalti.service.js";
import { NfcCard } from "../model/Nfc.model.js";
import { Trip } from "../model/Trip.model.js";
import { User } from "../model/user.model.js";
import ApiError from "../utils/ApiError.js";
import { Transaction } from "../model/Transaction.model.js";
// Generate a unique transaction ID
export const generateTransactionId = () => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TXN-${timestamp}-${randomStr}`;
};

// Verify Khalti Payment
export const verifyPayment = async (pidx) => {
  if (!pidx) throw new ApiError(400, "pidx is required for verification");

  // 1. Verify with Khalti API
  const khaltiRes = await verifyKhalti(pidx);
  if (khaltiRes.status !== "Completed") {
    throw new ApiError(400, "Payment not completed");
  }

  // 2. Find the transaction
let txn = await Transaction.findOne({ "khalti.pidx": pidx });
if (!txn) {
  txn = await Transaction.findOne({ pidx }); } 

  // Avoid double processing
  if (txn.status === "completed") {
    return txn;
  }

  // 3. Get the associated NFC card
  const nfcCard = await NfcCard.findById(txn.nfcCard);
  if (!nfcCard) throw new ApiError(404, "NFC card not found");

  // 4. Convert paid amount from paisa to NPR
  const paidAmount = (khaltiRes.total_amount || 0) / 100;

  // AUTO-TOPUP LOGIC (when Khalti was used to cover shortfall)
  if (txn.isAutoTopup) {
    nfcCard.balance = (nfcCard.balance || 0) + paidAmount;

    // Then deduct the full fare from NFC card
    const fareToDeduct = txn.fareAmount || txn.fare || 0;
    if (fareToDeduct > 0) {
      nfcCard.balance -= fareToDeduct;

      // Prevent negative balance (safety)
      if (nfcCard.balance < 0) {
        nfcCard.balance = 0;
      }

      // Update trip if linked
      if (txn.trip) {
        const trip = await Trip.findById(txn.trip);
        if (trip && !trip.completed) {
          trip.completed = true;
          trip.exitTime = new Date();
          await trip.save();
        }
      }

      // Update passenger status if needed
      if (txn.passenger) {
        await User.findByIdAndUpdate(txn.passenger, { onBoard: false });
      }
    }
  } else {
    nfcCard.balance = (nfcCard.balance || 0) + paidAmount;
  }

  await nfcCard.save();

  txn.status = "completed";
  txn.khalti = txn.khalti || {};
  txn.khalti.status = "completed";
  txn.khalti.transactionId = khaltiRes.transaction_id || txn.khalti.transactionId;
  txn.khalti.amount = paidAmount;

  txn.finalNfcBalance = nfcCard.balance;

  await txn.save();

  return txn;
};
