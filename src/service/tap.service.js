import { NfcCard } from "../model/Nfc.model.js";
import { User } from "../model/user.model.js";
import { Bus } from "../model/vechile.model.js";
import { Trip } from "../model/Trip.model.js";
import { Transcation } from "../model/Transcation.model.js";
import ApiError from "../utils/ApiError.js";
import { calculateFare } from "../utils/distance.utils.js";
import { calculateDistance } from "../utils/dist.js";
import mongoose from "mongoose";


export const processTapEvent = async (rfid, busId, latitude, longitude) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const nfcCard = await NfcCard.findOne({ cardUid: rfid }).session(session);
    if (!nfcCard) throw new ApiError(404, "NFC card not found");

    if (!nfcCard.isActive) throw new ApiError(400, "NFC card is not active");
    if (!nfcCard.isVerified) throw new ApiError(400, "NFC card is not verified");

    const passenger = await User.findById(nfcCard.user).session(session);
    if (!passenger) throw new ApiError(404, "Passenger not found");

    const bus = await Bus.findById(busId).session(session);
    if (!bus) throw new ApiError(404, "Bus not found");

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (!passenger.onBoard) {
      return await handleEntry(session, passenger, nfcCard, bus, busId, lat, lon);
    } else {
      return await handleExit(session, passenger, nfcCard, bus, busId, lat, lon);
    }
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/* handleEntry remains 100% unchanged */
const handleEntry = async (session, passenger, nfcCard, bus, busId, lat, lon) => {
  const trip = await Trip.create(
    [{ passengerId: passenger._id, busId, entryLocation: { lat, lon }, entryTime: new Date(), completed: false }],
    { session }
  );
  const createdTrip = trip[0];

  await User.findByIdAndUpdate(passenger._id, { onBoard: true }, { session, new: true });
  await NfcCard.findByIdAndUpdate(nfcCard._id, { lastUsedAt: new Date() }, { session });

  await session.commitTransaction();

  return {
    status: "entry",
    message: "Entry recorded successfully",
    tripId: createdTrip._id,
    entryTime: createdTrip.entryTime,
    entryLocation: createdTrip.entryLocation,
  };
};


const handleExit = async (session, passenger, nfcCard, bus, busId, lat, lon) => {
  const activeTrip = await Trip.findOne({
    passengerId: passenger._id,
    busId: busId,
    completed: false,
  })
    .sort({ entryTime: -1 })
    .session(session);

  if (!activeTrip) {
    const anyActiveTrip = await Trip.findOne({ passengerId: passenger._id, completed: false })
      .sort({ entryTime: -1 })
      .session(session);

    if (anyActiveTrip) {
      throw new ApiError(400, `Cannot exit on this bus. Please exit on Bus ID: ${anyActiveTrip.busId}`);
    }
    throw new ApiError(404, "No active trip found for exit");
  }

  const distanceKm = calculateDistance(
    activeTrip.entryLocation.lat,
    activeTrip.entryLocation.lon,
    lat,
    lon
  );
  const fare = calculateFare(distanceKm);

   // INSUFFICIENT BALANCE → Create pending payment transaction
  
  if (nfcCard.balance < fare) {
    const requiredTopup = fare - nfcCard.balance; // you can add +10 buffer if you want

    // Record exit details but keep trip incomplete
    activeTrip.exitLocation = { lat, lon };
    activeTrip.exitTime = new Date();
    activeTrip.fare = fare;
    activeTrip.completed = false;
    await activeTrip.save({ session });

    // Create payment_required transaction
    const txnId = generateTransactionId();
    await Transcation.create(
      [
        {
          txnId,
          nfcCard: nfcCard._id,
          passenger: passenger._id,
          trip: activeTrip._id,
          tapIn: {
            time: activeTrip.entryTime,
            location: [activeTrip.entryLocation.lon, activeTrip.entryLocation.lat],
          },
          tapOut: {
            time: activeTrip.exitTime,
            location: [lon, lat],
          },
          fare,
          requiredTopup,          
          status: "payment_required",
        },
      ],
      { session }
    );

    // Allow physical exit
    await User.findByIdAndUpdate(
      passenger._id,
      { onBoard: false },
      { session, new: true }
    );

    await session.commitTransaction();

    return {
      status: "exit_pending_payment",
      message: "Exit recorded successfully. Please complete payment.",
      txnId,
      requiredTopup,
      fare,
      distance: distanceKm,
      remainingBalance: nfcCard.balance, // still old value
      tripId: activeTrip._id,
    };
  }


  activeTrip.exitLocation = { lat, lon };
  activeTrip.exitTime = new Date();
  activeTrip.fare = fare;
  activeTrip.completed = true;
  await activeTrip.save({ session });

  nfcCard.balance -= fare;
  await nfcCard.save({ session });

  await User.findByIdAndUpdate(passenger._id, { onBoard: false }, { session, new: true });

  const txnId = generateTransactionId();
  await Transcation.create(
    [
      {
        txnId,
        nfcCard: nfcCard._id,
        passenger: passenger._id,
        trip: activeTrip._id,
        tapIn: { time: activeTrip.entryTime, location: [activeTrip.entryLocation.lon, activeTrip.entryLocation.lat] },
        tapOut: { time: activeTrip.exitTime, location: [lon, lat] },
        fare,
        status: "completed",
      },
    ],
    { session }
  );

  await session.commitTransaction();

  return {
    status: "exit",
    message: "Exit recorded successfully",
    fare,
    distance: distanceKm,
    remainingBalance: nfcCard.balance,
    tripId: activeTrip._id,
    exitTime: activeTrip.exitTime,
  };
};

const generateTransactionId = () => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TXN-${timestamp}-${randomStr}`;
};
