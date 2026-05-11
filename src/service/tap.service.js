import { NfcCard } from "../model/Nfc.model.js";
import { User } from "../model/user.model.js";
import { Bus } from "../model/vechile.model.js";
import { Trip } from "../model/Trip.model.js";
import { Transaction } from "../model/Transaction.model.js";
import { Driver } from "../model/driver.model.js";
import { Operator } from "../model/operator.model.js";
import ApiError from "../utils/ApiError.js";
import { calculateFare } from "../utils/distance.utils.js";
import { calculateDistance } from "../utils/dist.js";
import mongoose from "mongoose";

// ─────────────────────────────────────────────────────────────────────────────
// TAP COOLDOWN
// Minimum seconds between two taps on the same physical card.
// Stops the ESP8266 from firing two tap events from one card swipe.
// ─────────────────────────────────────────────────────────────────────────────
const TAP_COOLDOWN_SECONDS = 10;

export const processTapEvent = async (rfid, busId, latitude, longitude) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const nfcCard = await NfcCard.findOne({ cardUid: rfid }).session(session);
    if (!nfcCard) throw new ApiError(404, "NFC card not found");
    if (!nfcCard.isActive) throw new ApiError(400, "NFC card is not active");
    if (!nfcCard.isVerified) throw new ApiError(400, "NFC card is not verified");

    // ── GUARD 1: hardware double-tap (same physical swipe fired twice) ────────
    //
    // This is the FIRST line of defence and catches BOTH scenarios when the
    // second tap arrives quickly (within TAP_COOLDOWN_SECONDS):
    //
    //   Scenario 1 — Normal exit tapped twice fast:
    //     Tap 1 → exit processed, onBoard=false, trip completed=true
    //     Tap 2 (within 10 s) → BLOCKED HERE, never reaches handleEntry
    //
    //   Scenario 2 — Pending-payment exit tapped twice fast:
    //     Tap 1 → exit processed, onBoard=false, trip completed=false, exitLocation saved
    //     Tap 2 (within 10 s) → BLOCKED HERE, no ghost trip created
    //
    // Taps that arrive AFTER the cooldown window are handled by Guards 2 & 3.
    if (nfcCard.lastUsedAt) {
      const elapsed = (Date.now() - new Date(nfcCard.lastUsedAt).getTime()) / 1000;
      if (elapsed < TAP_COOLDOWN_SECONDS) {
        const wait = Math.ceil(TAP_COOLDOWN_SECONDS - elapsed);
        await session.abortTransaction();
        session.endSession();
        throw new ApiError(
          429,
          `Card tapped too quickly. Please wait ${wait} second(s).`
        );
      }
    }
    // ── END GUARD 1 ──────────────────────────────────────────────────────────

    const passenger = await User.findById(nfcCard.user).session(session);
    if (!passenger) throw new ApiError(404, "Passenger not found");

    const bus = await Bus.findById(busId).session(session);
    if (!bus) throw new ApiError(404, "Bus not found");
    if (!bus.operator) throw new ApiError(400, "Bus has no operator assigned");

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (!passenger.onBoard) {
      return await handleEntry(session, passenger, nfcCard, bus, busId, lat, lon);
    } else {
      return await handleExit(session, passenger, nfcCard, bus, busId, lat, lon);
    }
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    throw error;
  } finally {
    try { session.endSession(); } catch (_) {}
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY — tap on
// ─────────────────────────────────────────────────────────────────────────────
const handleEntry = async (session, passenger, nfcCard, bus, busId, lat, lon) => {

  // ── GUARD 2: unpaid fare blocks new boarding ──────────────────────────────
  //
  // This handles SCENARIO 2 when the second tap arrives AFTER the cooldown:
  //
  //   Scenario 2 — Pending-payment exit tapped twice (after cooldown):
  //     Tap 1 → exit processed, onBoard=false, trip completed=false, exitLocation saved
  //     Tap 2 (after 10 s) → onBoard=false → comes to handleEntry
  //     Without this guard: a new Trip is created on top of the unpaid debt.
  //     With this guard:    we detect the pending-payment trip and block boarding.
  //
  // How we tell a pending-payment trip apart from a normal mid-journey trip:
  //   • pending-payment → completed=false AND exitLocation.lat EXISTS
  //     (exit was physically recorded but payment failed)
  //   • mid-journey     → completed=false AND exitLocation.lat does NOT exist
  //     (passenger is still on the bus — this case never reaches handleEntry
  //      because onBoard=true routes to handleExit instead)
  //
  // SCENARIO 1 is NOT affected by this guard:
  //   Tap 1 → normal exit, trip completed=true, onBoard=false
  //   Tap 2 (after cooldown) → comes here, no incomplete trip with exitLocation
  //     exists → guard does NOT fire → passenger boards normally ✅
  //
  const pendingPaymentTrip = await Trip.findOne({
    passengerId:        passenger._id,
    completed:          false,
    "exitLocation.lat": { $exists: true, $ne: null },
  })
    .sort({ entryTime: -1 })
    .session(session);

  if (pendingPaymentTrip) {
    throw new ApiError(
      402,
      "You have an unpaid fare from your last trip. " +
      "Please complete payment before boarding again. " +
      `Outstanding trip ID: ${pendingPaymentTrip._id}`
    );
  }
  // ── END GUARD 2 ──────────────────────────────────────────────────────────

  // All clear — create the entry trip
  const [createdTrip] = await Trip.create(
    [
      {
        passengerId:   passenger._id,
        busId,
        operator:      bus.operator,
        driver:        bus.driver,
        entryLocation: { lat, lon },
        entryTime:     new Date(),
        completed:     false,
      },
    ],
    { session }
  );

  await User.findByIdAndUpdate(
    passenger._id,
    { onBoard: true },
    { session, new: true }
  );

  // Stamp lastUsedAt so Guard 1 works on the next tap
  await NfcCard.findByIdAndUpdate(
    nfcCard._id,
    { lastUsedAt: new Date() },
    { session }
  );

  await session.commitTransaction();

  return {
    status:        "entry",
    message:       "Entry recorded successfully",
    tripId:        createdTrip._id,
    entryTime:     createdTrip.entryTime,
    entryLocation: createdTrip.entryLocation,
    operator:      createdTrip.operator,
    driver:        createdTrip.driver,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// EXIT — tap off
// ─────────────────────────────────────────────────────────────────────────────
const handleExit = async (session, passenger, nfcCard, bus, busId, lat, lon) => {

  const activeTrip = await Trip.findOne({
    passengerId: passenger._id,
    busId,
    completed:   false,
  })
    .sort({ entryTime: -1 })
    .session(session);

  if (!activeTrip) {
    const anyActiveTrip = await Trip.findOne({
      passengerId: passenger._id,
      completed:   false,
    })
      .sort({ entryTime: -1 })
      .session(session);

    if (anyActiveTrip) {
      throw new ApiError(
        400,
        `Cannot exit on this bus. Please exit on Bus ID: ${anyActiveTrip.busId}`
      );
    }
    throw new ApiError(404, "No active trip found for exit");
  }

  // ── GUARD 3: exit already recorded on this trip ───────────────────────────
  //
  // This is a safety net for SCENARIO 2 in a race-condition edge case:
  //
  //   The passenger's second tap arrives so fast that:
  //     • onBoard is still true (the first tap's DB write hasn't committed yet
  //       in a concurrent request), OR
  //     • the same trip document is fetched again before the session commits.
  //
  //   In either case, exitLocation.lat being already set tells us the exit
  //   was already processed for this specific trip — refuse to process it again.
  //
  //   Without this guard: fare would be recalculated and a second Transaction
  //   document created for the same trip, double-charging the passenger.
  //
  if (activeTrip.exitLocation?.lat !== undefined && activeTrip.exitLocation.lat !== null) {
    throw new ApiError(
      400,
      "Exit already recorded for this trip. " +
      "Please complete your pending payment before tapping again."
    );
  }
  // ── END GUARD 3 ──────────────────────────────────────────────────────────

  const distanceKm = calculateDistance(
    activeTrip.entryLocation.lat,
    activeTrip.entryLocation.lon,
    lat,
    lon
  );
  const fare = calculateFare(distanceKm);

  // Stamp lastUsedAt on every exit path so Guard 1 kicks in for fast retaps
  await NfcCard.findByIdAndUpdate(
    nfcCard._id,
    { lastUsedAt: new Date() },
    { session }
  );

  // ── INSUFFICIENT BALANCE → pending payment ───────────────────────────────
  if (nfcCard.balance < fare) {
    const requiredTopup = fare - nfcCard.balance;

    // Saving exitLocation here is what Guard 2 and Guard 3 look for.
    // Once this is written, any subsequent tap (entry or exit) will be blocked
    // until payment is cleared.
    activeTrip.exitLocation = { lat, lon };
    activeTrip.exitTime     = new Date();
    activeTrip.fare         = fare;
    activeTrip.completed    = false;     // stays false until payment clears
    await activeTrip.save({ session });

    const txnId = generateTransactionId();
    await Transaction.create(
      [
        {
          txnId,
          nfcCard:   nfcCard._id,
          passenger: passenger._id,
          trip:      activeTrip._id,
          operator:  activeTrip.operator,
          driver:    activeTrip.driver,
          tapIn: {
            time:     activeTrip.entryTime,
            location: [activeTrip.entryLocation.lon, activeTrip.entryLocation.lat],
          },
          tapOut: {
            time:     activeTrip.exitTime,
            location: [lon, lat],
          },
          fare,
          requiredTopup,
          status:      "payment_required",
          isAutoTopup: true,
        },
      ],
      { session }
    );

    await User.findByIdAndUpdate(
      passenger._id,
      { onBoard: false },
      { session, new: true }
    );

    await session.commitTransaction();

    return {
      status:           "exit_pending_payment",
      message:          "Exit recorded. Please complete payment before your next trip.",
      txnId,
      requiredTopup,
      fare,
      distance:         distanceKm,
      remainingBalance: nfcCard.balance,
      tripId:           activeTrip._id,
    };
  }

  // ── SUFFICIENT BALANCE → complete immediately ────────────────────────────
  activeTrip.exitLocation = { lat, lon };
  activeTrip.exitTime     = new Date();
  activeTrip.fare         = fare;
  activeTrip.completed    = true;
  await activeTrip.save({ session });

  nfcCard.balance -= fare;
  await nfcCard.save({ session });

  await User.findByIdAndUpdate(
    passenger._id,
    { onBoard: false },
    { session, new: true }
  );

  const txnId = generateTransactionId();
  await Transaction.create(
    [
      {
        txnId,
        nfcCard:   nfcCard._id,
        passenger: passenger._id,
        trip:      activeTrip._id,
        operator:  activeTrip.operator,
        driver:    activeTrip.driver,
        tapIn: {
          time:     activeTrip.entryTime,
          location: [activeTrip.entryLocation.lon, activeTrip.entryLocation.lat],
        },
        tapOut: {
          time:     activeTrip.exitTime,
          location: [lon, lat],
        },
        fare,
        status: "completed",
      },
    ],
    { session }
  );

  const counterUpdates = [
    Bus.findByIdAndUpdate(
      busId,
      { $inc: { totalTrips: 1, totalRevenue: fare } },
      { session }
    ),
    Operator.findByIdAndUpdate(
      activeTrip.operator,
      { $inc: { totalRevenue: fare } },
      { session }
    ),
  ];

  if (activeTrip.driver) {
    counterUpdates.push(
      Driver.findByIdAndUpdate(
        activeTrip.driver,
        { $inc: { totalTrips: 1, totalRevenue: fare } },
        { session }
      )
    );
  }

  await Promise.all(counterUpdates);
  await session.commitTransaction();

  return {
    status:           "exit",
    message:          "Exit recorded successfully",
    fare,
    distance:         distanceKm,
    remainingBalance: nfcCard.balance,
    tripId:           activeTrip._id,
    exitTime:         activeTrip.exitTime,
    operator:         activeTrip.operator,
    driver:           activeTrip.driver,
  };
};

const generateTransactionId = () => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TXN-${timestamp}-${randomStr}`;
};




/*

import { NfcCard } from "../model/Nfc.model.js";
import { User } from "../model/user.model.js";
import { Bus } from "../model/vechile.model.js";
import { Trip } from "../model/Trip.model.js";
import { Transaction } from "../model/Transaction.model.js";
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

    // ── Fetch bus with operator and driver already on the document ──
    const bus = await Bus.findById(busId).session(session);
    if (!bus) throw new ApiError(404, "Bus not found");

    // ── Guard: bus must belong to an operator ──
    if (!bus.operator) throw new ApiError(400, "Bus has no operator assigned");

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

// ─────────────────────────────────────────────────────────────
// ENTRY — tap on
// Captures operator and driver from the bus document at this
// exact moment so the trip always reflects who was driving.
// ─────────────────────────────────────────────────────────────
const handleEntry = async (session, passenger, nfcCard, bus, busId, lat, lon) => {
  const trip = await Trip.create(
    [
      {
        passengerId: passenger._id,
        busId,

        // ── KEY CHANGE: copy operator + driver from bus ──
        operator: bus.operator,   // always present (guarded above)
        driver:   bus.driver,     // null if no driver assigned yet

        entryLocation: { lat, lon },
        entryTime: new Date(),
        completed: false,
      },
    ],
    { session }
  );
  const createdTrip = trip[0];

  await User.findByIdAndUpdate(
    passenger._id,
    { onBoard: true },
    { session, new: true }
  );
  await NfcCard.findByIdAndUpdate(
    nfcCard._id,
    { lastUsedAt: new Date() },
    { session }
  );

  await session.commitTransaction();

  return {
    status: "entry",
    message: "Entry recorded successfully",
    tripId:        createdTrip._id,
    entryTime:     createdTrip.entryTime,
    entryLocation: createdTrip.entryLocation,
    operator:      createdTrip.operator,   // useful for frontend display
    driver:        createdTrip.driver,
  };
};

// ─────────────────────────────────────────────────────────────
// EXIT — tap off
// operator/driver were already saved at entry — no change needed
// here. Just complete the trip and deduct fare as before.
// ─────────────────────────────────────────────────────────────
const handleExit = async (session, passenger, nfcCard, bus, busId, lat, lon) => {
  const activeTrip = await Trip.findOne({
    passengerId: passenger._id,
    busId: busId,
    completed: false,
  })
    .sort({ entryTime: -1 })
    .session(session);

  if (!activeTrip) {
    const anyActiveTrip = await Trip.findOne({
      passengerId: passenger._id,
      completed: false,
    })
      .sort({ entryTime: -1 })
      .session(session);

    if (anyActiveTrip) {
      throw new ApiError(
        400,
        `Cannot exit on this bus. Please exit on Bus ID: ${anyActiveTrip.busId}`
      );
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

  // ── INSUFFICIENT BALANCE → pending payment ──
  if (nfcCard.balance < fare) {
    const requiredTopup = fare - nfcCard.balance;

    activeTrip.exitLocation = { lat, lon };
    activeTrip.exitTime     = new Date();
    activeTrip.fare         = fare;
    activeTrip.completed    = false;   // still pending until paid
    await activeTrip.save({ session });

    const txnId = generateTransactionId();
    await Transaction.create(
      [
        {
          txnId,
          nfcCard:   nfcCard._id,
          passenger: passenger._id,
          trip:      activeTrip._id,

          // ── operator/driver for operator dashboard queries ──
          operator: activeTrip.operator,
          driver:   activeTrip.driver,

          tapIn: {
            time:     activeTrip.entryTime,
            location: [activeTrip.entryLocation.lon, activeTrip.entryLocation.lat],
          },
          tapOut: {
            time:     activeTrip.exitTime,
            location: [lon, lat],
          },
          fare,
          requiredTopup,
          status:      "payment_required",
          isAutoTopup: true,
        },
      ],
      { session }
    );

    await User.findByIdAndUpdate(
      passenger._id,
      { onBoard: false },
      { session, new: true }
    );

    await session.commitTransaction();

    return {
      status:           "exit_pending_payment",
      message:          "Exit recorded successfully. Please complete payment.",
      txnId,
      requiredTopup,
      fare,
      distance:         distanceKm,
      remainingBalance: nfcCard.balance,
      tripId:           activeTrip._id,
    };
  }

  // ── SUFFICIENT BALANCE → complete immediately ──
  activeTrip.exitLocation = { lat, lon };
  activeTrip.exitTime     = new Date();
  activeTrip.fare         = fare;
  activeTrip.completed    = true;
  await activeTrip.save({ session });

  nfcCard.balance -= fare;
  await nfcCard.save({ session });

  await User.findByIdAndUpdate(
    passenger._id,
    { onBoard: false },
    { session, new: true }
  );

  const txnId = generateTransactionId();
  await Transaction.create(
    [
      {
        txnId,
        nfcCard:   nfcCard._id,
        passenger: passenger._id,
        trip:      activeTrip._id,

        // ── operator/driver for operator dashboard queries ──
        operator: activeTrip.operator,
        driver:   activeTrip.driver,

        tapIn: {
          time:     activeTrip.entryTime,
          location: [activeTrip.entryLocation.lon, activeTrip.entryLocation.lat],
        },
        tapOut: {
          time:     activeTrip.exitTime,
          location: [lon, lat],
        },
        fare,
        status: "completed",
      },
    ],
    { session }
  );

  // ── Update revenue/trip counters on Bus, Driver, Operator ──
  await Promise.all([
    Bus.findByIdAndUpdate(
      busId,
      { $inc: { totalTrips: 1, totalRevenue: fare } },
      { session }
    ),
    activeTrip.driver &&
      import("../model/driver.model.js").then(({ Driver }) =>
        Driver.findByIdAndUpdate(
          activeTrip.driver,
          { $inc: { totalTrips: 1, totalRevenue: fare } },
          { session }
        )
      ),
    import("../model/operator.model.js").then(({ Operator }) =>
      Operator.findByIdAndUpdate(
        activeTrip.operator,
        { $inc: { totalRevenue: fare } },
        { session }
      )
    ),
  ]);

  await session.commitTransaction();

  return {
    status:           "exit",
    message:          "Exit recorded successfully",
    fare,
    distance:         distanceKm,
    remainingBalance: nfcCard.balance,
    tripId:           activeTrip._id,
    exitTime:         activeTrip.exitTime,
    operator:         activeTrip.operator,
    driver:           activeTrip.driver,
  };
};

const generateTransactionId = () => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TXN-${timestamp}-${randomStr}`;
};


*/





/*
import { NfcCard } from "../model/Nfc.model.js";
import { User } from "../model/user.model.js";
import { Bus } from "../model/vechile.model.js";
import { Trip } from "../model/Trip.model.js";
import { Transaction } from "../model/Transaction.model.js";
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

// handleEntry remains 100% unchanged 
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
const MIN_BALANCE = 100;

   // INSUFFICIENT BALANCE → Create pending payment transaction
if (nfcCard.balance<fare) {
    const requiredTopup = fare - nfcCard.balance; 

    activeTrip.exitLocation = { lat, lon };
    activeTrip.exitTime = new Date();
    activeTrip.fare = fare;
    activeTrip.completed = false;
    await activeTrip.save({ session });

    const txnId = generateTransactionId();
    await Transaction.create(
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
          isAutoTopup: true, // <--- ADD THIS LINE
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
  await Transaction.create(
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
*/
