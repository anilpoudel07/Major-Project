import { NfcCard } from "../model/Nfc.model.js";
import { User } from "../model/user.model.js";
import { Bus } from "../model/vechile.model.js";
import { Trip } from "../model/Trip.model.js";
import { Transcation } from "../model/Transcation.model.js";
import ApiError from "../utils/ApiError.js";
import { calculateDistance, calculateFare } from "../utils/distance.utils.js";
import mongoose from "mongoose";

/**
 * Process NFC tap event (Entry or Exit)
 */
export const processTapEvent = async (rfid, busId, latitude, longitude) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate and find NFC card
    const nfcCard = await NfcCard.findOne({ cardUid: rfid }).session(session);
    if (!nfcCard) {
      throw new ApiError(404, "NFC card not found");
    }
    console.log(`nfcCard:${nfcCard}`);

    // console.log(`nfcCard:  ${nfcCard}`);

    // if (!nfcCard.isActive) {
    //   throw new ApiError(400, "NFC card is not active");
    // }
    // if (!nfcCard.isVerified) {
    //   throw new ApiError(400, "NFC card is not verified");
    // }

    // Find passenger/user
    const passenger = await User.findById(nfcCard.user).session(session);
    if (!passenger) {
      throw new ApiError(404, "Passenger not found");
    }
    console.log(`passenger:${passenger}`);

    // Validate bus
    const bus = await Bus.findById(busId).session(session);
    if (!bus) {
      throw new ApiError(404, "Bus not found");
    }
    console.log(`bus:${bus}`);

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    console.log(`lat:${lat}`);

    // Check if passenger is currently onboard
    if (!passenger.onBoard) {
      // ENTRY EVENT
      return await handleEntry(
        session,
        passenger,
        nfcCard,
        bus,
        busId,
        lat,
        lon
      );
    } else {
      // EXIT EVENT
      return await handleExit(
        session,
        passenger,
        nfcCard,
        bus,
        busId,
        lat,
        lon
      );
    }
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Handle entry tap event
 */
const handleEntry = async (
  session,
  passenger,
  nfcCard,
  bus,
  busId,
  lat,
  lon
) => {
  // Create trip entry
  const trip = await Trip.create(
    [
      {
        passengerId: passenger._id,
        busId: busId,
        entryLocation: { lat, lon },
        entryTime: new Date(),
        exitLocation: null,
        exitTime: null,
        fare: null,
        completed: false,
      },
    ],
    { session }
  );

  const createdTrip = trip[0];

  // Update passenger onboard status
  await User.findByIdAndUpdate(
    passenger._id,
    { $set: { onBoard: true } },
    { session, new: true }
  );

  // Update NFC card last used timestamp
  await NfcCard.findByIdAndUpdate(
    nfcCard._id,
    { $set: { lastUsedAt: new Date() } },
    { session }
  );

  await session.commitTransaction();

  return {
    status: "entry",
    message: "Entry recorded successfully",
    tripId: createdTrip._id,
    entryTime: createdTrip.entryTime,
    entryLocation: createdTrip.entryLocation,
  };
};

/**
 * Handle exit tap event
 */
const handleExit = async (
  session,
  passenger,
  nfcCard,
  bus,
  busId,
  lat,
  lon
) => {
  // Find the last incomplete trip for this passenger on this bus
  const activeTrip = await Trip.findOne({
    passengerId: passenger._id,
    busId: busId,
    completed: false,
  })
    .sort({ entryTime: -1 })
    .session(session);

  if (!activeTrip) {
    // Check if there's an incomplete trip on a different bus
    const anyActiveTrip = await Trip.findOne({
      passengerId: passenger._id,
      completed: false,
    })
      .sort({ entryTime: -1 })
      .session(session);

    if (anyActiveTrip) {
      throw new ApiError(
        400,
        `Cannot exit on this bus. Please exit on the bus you entered (Bus ID: ${anyActiveTrip.busId})`
      );
    }
    throw new ApiError(404, "No active trip found for exit");
  }

  // Calculate distance and fare
  const distanceKm = calculateDistance(
    activeTrip.entryLocation.lat,
    activeTrip.entryLocation.lon,
    lat,
    lon
  );

  const fare = calculateFare(distanceKm);

  // Check if passenger has sufficient balance
  if (nfcCard.balance < fare) {
    throw new ApiError(
      400,
      `Insufficient balance. Required: ${fare} NPR, Available: ${nfcCard.balance} NPR`
    );
  }

  // Update trip with exit details
  activeTrip.exitLocation = { lat, lon };
  activeTrip.exitTime = new Date();
  activeTrip.fare = fare;
  activeTrip.completed = true;
  await activeTrip.save({ session });

  // Deduct fare from NFC card balance
  nfcCard.balance = nfcCard.balance - fare;
  await nfcCard.save({ session });

  // Update passenger onboard status
  await User.findByIdAndUpdate(
    passenger._id,
    { $set: { onBoard: false } },
    { session, new: true }
  );

  // Create transaction log
  const txnId = generateTransactionId();
  await Transcation.create(
    [
      {
        txnId: txnId,
        nfcCard: nfcCard._id,
        passenger: passenger._id,
        trip: activeTrip._id,
        tapIn: {
          time: activeTrip.entryTime,
          location: [
            activeTrip.entryLocation.lon,
            activeTrip.entryLocation.lat,
          ],
        },
        tapOut: {
          time: activeTrip.exitTime,
          location: [lon, lat],
        },
        fare: fare,
        status: "completed",
      },
    ],
    { session }
  );

  await session.commitTransaction();

  return {
    status: "exit",
    message: "Exit recorded successfully",
    fare: fare,
    distance: distanceKm,
    remainingBalance: nfcCard.balance,
    tripId: activeTrip._id,
    exitTime: activeTrip.exitTime,
  };
};

/**
 * Generate unique transaction ID
 * @returns {string} Transaction ID
 */
const generateTransactionId = () => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TXN-${timestamp}-${randomStr}`;
};
