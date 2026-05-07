import { asyncHandler } from "../utils/asyncHandler.js";
import { initiateKhalti, verifyKhalti } from "../service/khalti.service.js";
import { verifyPayment } from "../service/payment.service.js";
import { Transaction } from "../model/Transaction.model.js";
import { NfcCard } from "../model/Nfc.model.js";
import { generateTransactionId } from "../service/payment.service.js";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// Initiate a payment

export const initiatePayment = async (req, res) => {
  const { txnId } = req.body;
  const txn = await Transaction.findOne({ txnId, status: "payment_required" });
  if (!txn) throw new ApiError(404, "Transaction not found");

  const amountNPR = txn.requiredTopup || txn.fare || 0;

  // DYNAMICALLY HANDLE KHALTI LIMIT INSTEAD OF THROWING ERROR
  // If the required topup is less than Rs. 10, charge Rs. 10. 
  // The excess will remain on the user's NFC card.
  const topupAmount = Math.max(amountNPR, 10);

  const payload = {
    return_url: process.env.KHALTI_RETURN_URL,
    website_url: process.env.WEBSITE_URL,
    amount: Math.round(topupAmount * 100), // ensure integer paisa
    purchase_order_id: txn.txnId,
    purchase_order_name: "NFC Card Top-up / Fare",
    customer_info: {
      name: req.user?.fullName || "User",
      email: req.user?.email || "user@example.com",
      phone: req.user?.phone || "9800000001",
    },
  };

  try {
    const khaltiRes = await initiateKhalti(payload);

    if (!khaltiRes?.pidx || !khaltiRes?.payment_url) {
      throw new ApiError(500, "Invalid response from Khalti - missing pidx or payment_url");
    }

    // Update transaction
    txn.khalti = {
      pidx: khaltiRes.pidx,
      amount: topupAmount, // Save the actual amount being charged
      status: "initiated",
      payment_url: khaltiRes.payment_url,
    };
    txn.status = "payment_initiated";
    await txn.save();

    res.json(
      new ApiResponse(200, {
        payment_url: khaltiRes.payment_url,
        txnId: txn.txnId,
        pidx: khaltiRes.pidx,
      }, "Payment initiated successfully")
    );

  }catch (error) {
    console.error("Khalti initiation failed:", error.response?.data || error.message);

    if (error.response?.status === 503 || error.message.includes("503")) {
      return res.status(503).json({
        success: false,
        message: "Khalti service is temporarily unavailable. Please try again in a few minutes."
      });
    }

    throw error;
  }
};




export const checkPaymentStatus = async (req, res) => {
  const { pidx, txnId } = req.query;

  let txn = null;
  if (txnId) {
    txn = await Transaction.findOne({ txnId });
  }

  const lookupPidx = pidx || txn?.khalti?.pidx;
  if (!lookupPidx) {
    throw new ApiError(400, "pidx or txnId with initiated payment is required");
  }

  const khaltiRes = await verifyKhalti(lookupPidx);

  // Auto-complete transaction if payment is successful
  if (khaltiRes.status === "Completed" && txn && txn.status !== "completed") {
    await verifyPayment(lookupPidx);
  }

  res.json(
    new ApiResponse(200, {
      status: khaltiRes.status,
      total_amount: khaltiRes.total_amount / 100,
      transaction_id: khaltiRes.transaction_id,
      pidx: lookupPidx,
    }, "Payment status retrieved")
  );
};

// Replace your existing khaltiCallback in payment.controller.js with this:

export const khaltiCallback = async (req, res) => {
  const { pidx, status, ...query } = req.query;

  console.log("[KHALTI CALLBACK] Received:", { pidx, status });

  if (!pidx) {
    return res.status(400).send(`
      <h2>Invalid Callback</h2>
      <p>Missing pidx parameter.</p>
    `);
  }

  try {
    console.log("[KHALTI CALLBACK] Verifying and Updating DB for pidx:", pidx);
    
    // FIX: Calling verifyPayment updates the NFC balance AND completes the trip
    const updatedTxn = await verifyPayment(pidx);

    return res.send(`
      <h2>Payment Successful</h2>
      <p>Status: ${status || 'Completed'}</p>
      <p>Amount processed successfully. Your NFC card balance is now Rs. ${updatedTxn.finalNfcBalance}.</p>
      <p>You can safely close this window.</p>
    `);
  } catch (err) {
    console.error("[KHALTI CALLBACK] Verification failed:", err.message);
    return res.status(400).send(`
      <h2>Payment Processing Failed</h2>
      <p>${err.message || "Payment verification failed on our side."}</p>
      <p>Please contact support or try again later.</p>
    `);
  }
};

// Verify payment controller (if still needed separately)
export const verifyPaymentController = async (req, res) => {
  const { pidx } = req.body;
  if (!pidx) throw new ApiError(400, "pidx is required");

  const txn = await verifyPayment(pidx);

  res.json(new ApiResponse(200, txn, "Payment verified successfully"));
};


export const paymentTransaction = asyncHandler(async (req, res) => {
  const { fare } = req.body;
  if (!fare || fare <= 0) throw new ApiError(400, "Valid fare amount is required");

  const passenger = req.user;
  const nfcCard = await NfcCard.findOne({ user: passenger._id });
  if (!nfcCard) throw new ApiError(404, "NFC card not found");

  const currentBalance = nfcCard.balance || 0;

  if (currentBalance >= fare) {
    nfcCard.balance -= fare;
    await nfcCard.save();

    const txnId = generateTransactionId();
    await Transaction.create({
      txnId,
      nfcCard: nfcCard._id,
      passenger: passenger._id,
      fare,
      status: "completed",
      paymentMethod: "nfc_card",
      description: "Fare deducted from NFC balance"
    });

    return res.json(new ApiResponse(200, { deductedFrom: "nfc" }, "Fare deducted successfully"));
  } 
  const shortfall = fare - currentBalance;

  const payload = {
    return_url: process.env.KHALTI_RETURN_URL,
    website_url: process.env.WEBSITE_URL,
    amount: Math.round(shortfall * 100),
    purchase_order_id: `fare_auto_${Date.now()}`,
    purchase_order_name: "Auto Top-up for Fare Payment",   // ← shows nicely in Khalti dashboard
    customer_info: {
      name: passenger.fullName || "Passenger",
      email: passenger.email || "user@example.com",
      phone: passenger.phone || "9800000001",
    }
  };

  const khaltiRes = await initiateKhalti(payload);
  if (!khaltiRes?.pidx || !khaltiRes?.payment_url) {
    throw new ApiError(500, "Failed to initiate Khalti payment");
  }

  const txnId = generateTransactionId();

  const txn = await Transaction.create({
    txnId,
    nfcCard: nfcCard._id,
    passenger: passenger._id,
    fareAmount: fare,
    topupAmount: shortfall,
    amount: shortfall,
    status: "payment_initiated",
    isAutoTopup: true,
    paymentMethod: "khalti_auto",
    description: "Auto top-up for insufficient NFC balance",
    khalti: {
      pidx: khaltiRes.pidx,
      amount: shortfall,
      status: "initiated",
      payment_url: khaltiRes.payment_url,
    }
  });

  return res.json(new ApiResponse(200, {
    payment_url: khaltiRes.payment_url,
    pidx: khaltiRes.pidx,
    txnId,
    shortfall,
    message: "Insufficient NFC balance. Complete payment with Khalti."
  }, "Khalti payment initiated for auto top-up"));
});
