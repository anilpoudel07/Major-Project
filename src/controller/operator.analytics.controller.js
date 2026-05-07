import { asyncHandler } from "../utils/asyncHandler.js";
import { Operator } from "../model/operator.model.js";
import { Bus } from "../model/vechile.model.js";
import { Driver } from "../model/driver.model.js";
import { Trip } from "../model/Trip.model.js";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import mongoose from "mongoose";

// PRIVATE HELPER
const getOperatorDoc = async (userId) => {
  const operatorDoc = await Operator.findOne({ owner: userId });
  if (!operatorDoc)
    throw new ApiError(403, "No operator profile found for your account");
  return operatorDoc;
};

/**
 * Build a date range object from a period query param.
 *
 * ?period=day   → last 24 hours, grouped by hour
 * ?period=week  → last 7 days,   grouped by day
 * ?period=month → last 30 days,  grouped by day
 * ?period=year  → last 12 months,grouped by month
 *
 * Caller can also override with ?from=ISO&to=ISO for a custom range.
 */
const buildDateRange = (query) => {
  const { period = "month", from, to } = query;

  if (from && to) {
    return {
      start: new Date(from),
      end: new Date(to),
      groupFormat: "%Y-%m-%d",
      groupLabel: "day",
    };
  }

  const now = new Date();
  const start = new Date(now);

  switch (period) {
    case "day":
      start.setHours(start.getHours() - 24);
      return { start, end: now, groupFormat: "%Y-%m-%dT%H:00", groupLabel: "hour" };
    case "week":
      start.setDate(start.getDate() - 7);
      return { start, end: now, groupFormat: "%Y-%m-%d", groupLabel: "day" };
    case "year":
      start.setMonth(start.getMonth() - 12);
      return { start, end: now, groupFormat: "%Y-%m", groupLabel: "month" };
    case "month":
    default:
      start.setDate(start.getDate() - 30);
      return { start, end: now, groupFormat: "%Y-%m-%d", groupLabel: "day" };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. OPERATOR OVERVIEW DASHBOARD
//
// GET /api/v1/operator/analytics/overview
//
// Returns a single snapshot card of the operator's entire fleet:
//   - fleet counts (total/active/maintenance buses)
//   - driver counts (total/on_duty/available)
//   - revenue and trips (all-time + period)
//   - top performing bus and driver
// ─────────────────────────────────────────────────────────────────────────────
export const getOperatorOverview = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);
  const operatorId  = operatorDoc._id;
  const { start, end } = buildDateRange(req.query);

  // ── Fleet counts from Bus collection ──
  const [fleetStats] = await Bus.aggregate([
    { $match: { operator: operatorId } },
    {
      $group: {
        _id: null,
        totalBuses:       { $sum: 1 },
        activeBuses:      { $sum: { $cond: [{ $eq: ["$status", "running"] },     1, 0] } },
        idleBuses:        { $sum: { $cond: [{ $eq: ["$status", "idle"] },         1, 0] } },
        maintenanceBuses: { $sum: { $cond: [{ $eq: ["$status", "maintenance"] },  1, 0] } },
        inactiveBuses:    { $sum: { $cond: [{ $eq: ["$status", "inactive"] },     1, 0] } },
        totalCapacity:    { $sum: "$maxCapacity" },
        allTimeRevenue:   { $sum: "$totalRevenue" },
        allTimeTrips:     { $sum: "$totalTrips" },
      },
    },
  ]);

  // ── Driver counts from Driver collection ──
  const [driverStats] = await Driver.aggregate([
    { $match: { operator: operatorId } },
    {
      $group: {
        _id: null,
        totalDrivers:    { $sum: 1 },
        onDutyDrivers:   { $sum: { $cond: [{ $eq: ["$status", "on_duty"] },    1, 0] } },
        availDrivers:    { $sum: { $cond: [{ $eq: ["$status", "available"] },  1, 0] } },
        suspendedDrivers:{ $sum: { $cond: [{ $eq: ["$status", "suspended"] },  1, 0] } },
      },
    },
  ]);

  // ── Period revenue + trips from Trip collection ──
  const [periodStats] = await Trip.aggregate([
    {
      $match: {
        operator:  operatorId,
        completed: true,
        exitTime:  { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id:            null,
        periodRevenue:  { $sum: "$fare" },
        periodTrips:    { $sum: 1 },
        uniquePassengers:{ $addToSet: "$passengerId" },
      },
    },
    {
      $project: {
        periodRevenue:    1,
        periodTrips:      1,
        uniquePassengers: { $size: "$uniquePassengers" },
      },
    },
  ]);

  // ── Top bus by revenue (all-time) ──
  const [topBus] = await Bus.find({ operator: operatorId })
    .sort({ totalRevenue: -1 })
    .limit(1)
    .select("plateNumber busType totalRevenue totalTrips status");

  // ── Top driver by trips (all-time) ──
  const [topDriver] = await Driver.find({ operator: operatorId })
    .sort({ totalTrips: -1 })
    .limit(1)
    .populate("user", "FirstName email")
    .select("licenseNumber totalTrips totalRevenue averageRating status");

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        period: req.query.period || "month",
        periodRange: { from: start, to: end },
        fleet: {
          ...(fleetStats || {
            totalBuses: 0, activeBuses: 0, idleBuses: 0,
            maintenanceBuses: 0, inactiveBuses: 0,
            totalCapacity: 0, allTimeRevenue: 0, allTimeTrips: 0,
          }),
        },
        drivers: {
          ...(driverStats || {
            totalDrivers: 0, onDutyDrivers: 0,
            availDrivers: 0, suspendedDrivers: 0,
          }),
        },
        period: {
          revenue:          periodStats?.periodRevenue    || 0,
          trips:            periodStats?.periodTrips      || 0,
          uniquePassengers: periodStats?.uniquePassengers || 0,
        },
        topBus:    topBus    || null,
        topDriver: topDriver || null,
      },
      "Operator overview fetched"
    )
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. REVENUE & TRIP TREND
//
// GET /api/v1/operator/analytics/revenue?period=month
//
// Returns time-series data suitable for a line/bar chart:
//   [ { label: "2025-04-01", revenue: 4200, trips: 38 }, ... ]
// ─────────────────────────────────────────────────────────────────────────────
export const getRevenueTrend = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);
  const { start, end, groupFormat, groupLabel } = buildDateRange(req.query);

  const trend = await Trip.aggregate([
    {
      $match: {
        operator:  operatorDoc._id,
        completed: true,
        exitTime:  { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id:     { $dateToString: { format: groupFormat, date: "$exitTime" } },
        revenue: { $sum: "$fare" },
        trips:   { $sum: 1 },
        passengers: { $addToSet: "$passengerId" },
      },
    },
    {
      $project: {
        _id: 0,
        label:            "$_id",
        revenue:          1,
        trips:            1,
        uniquePassengers: { $size: "$passengers" },
      },
    },
    { $sort: { label: 1 } },
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        period:     req.query.period || "month",
        groupBy:    groupLabel,
        periodRange:{ from: start, to: end },
        trend,
      },
      "Revenue trend fetched"
    )
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PER-BUS ANALYTICS
//
// GET /api/v1/operator/analytics/buses?period=month
//
// Returns each bus with its revenue, trips, avg fare, and occupancy
// for the selected period — useful for a sortable table.
// ─────────────────────────────────────────────────────────────────────────────
export const getBusAnalytics = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);
  const { start, end } = buildDateRange(req.query);

  // Aggregate trips grouped by busId for this period
  const tripsByBus = await Trip.aggregate([
    {
      $match: {
        operator:  operatorDoc._id,
        completed: true,
        exitTime:  { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id:      "$busId",
        revenue:  { $sum: "$fare" },
        trips:    { $sum: 1 },
        avgFare:  { $avg: "$fare" },
        passengers: { $addToSet: "$passengerId" },
      },
    },
    {
      $project: {
        busId:            "$_id",
        _id:              0,
        revenue:          { $round: ["$revenue", 2] },
        trips:            1,
        avgFare:          { $round: ["$avgFare", 2] },
        uniquePassengers: { $size: "$passengers" },
      },
    },
  ]);

  // Build a lookup map for O(1) merge
  const tripMap = Object.fromEntries(tripsByBus.map((t) => [String(t.busId), t]));

  // Fetch all buses belonging to operator
  const buses = await Bus.find({ operator: operatorDoc._id })
    .populate("driver", "licenseNumber status")
    .select("plateNumber busType status maxCapacity totalRevenue totalTrips averageRating driver lastSeen");

  const result = buses.map((bus) => {
    const periodData = tripMap[String(bus._id)] || {
      revenue: 0, trips: 0, avgFare: 0, uniquePassengers: 0,
    };
    return {
      busId:          bus._id,
      plateNumber:    bus.plateNumber,
      busType:        bus.busType,
      status:         bus.status,
      maxCapacity:    bus.maxCapacity,
      lastSeen:       bus.lastSeen,
      driver:         bus.driver,
      allTime: {
        revenue: bus.totalRevenue,
        trips:   bus.totalTrips,
        rating:  bus.averageRating,
      },
      period: periodData,
    };
  });

  // Sort by period revenue descending
  result.sort((a, b) => b.period.revenue - a.period.revenue);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        period:      req.query.period || "month",
        periodRange: { from: start, to: end },
        totalBuses:  buses.length,
        buses:       result,
      },
      "Bus analytics fetched"
    )
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PER-DRIVER ANALYTICS
//
// GET /api/v1/operator/analytics/drivers?period=month
//
// Returns each driver with trips, revenue, avg fare for the period.
// ─────────────────────────────────────────────────────────────────────────────
export const getDriverAnalytics = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);
  const { start, end } = buildDateRange(req.query);

  // Aggregate trips grouped by driver for this period
  const tripsByDriver = await Trip.aggregate([
    {
      $match: {
        operator:  operatorDoc._id,
        completed: true,
        driver:    { $ne: null },
        exitTime:  { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id:      "$driver",
        revenue:  { $sum: "$fare" },
        trips:    { $sum: 1 },
        avgFare:  { $avg: "$fare" },
        passengers: { $addToSet: "$passengerId" },
      },
    },
    {
      $project: {
        driverId:         "$_id",
        _id:              0,
        revenue:          { $round: ["$revenue", 2] },
        trips:            1,
        avgFare:          { $round: ["$avgFare", 2] },
        uniquePassengers: { $size: "$passengers" },
      },
    },
  ]);

  const tripMap = Object.fromEntries(
    tripsByDriver.map((t) => [String(t.driverId), t])
  );

  const drivers = await Driver.find({ operator: operatorDoc._id })
    .populate("user", "FirstName email phone")
    .populate("assignedBus", "plateNumber busType")
    .select("licenseNumber licenseExpiry status totalTrips totalRevenue averageRating assignedBus");

  const result = drivers.map((driver) => {
    const periodData = tripMap[String(driver._id)] || {
      revenue: 0, trips: 0, avgFare: 0, uniquePassengers: 0,
    };
    return {
      driverId:      driver._id,
      name:          driver.user?.FirstName,
      email:         driver.user?.email,
      phone:         driver.user?.phone,
      licenseNumber: driver.licenseNumber,
      licenseExpiry: driver.licenseExpiry,
      status:        driver.status,
      assignedBus:   driver.assignedBus,
      allTime: {
        revenue: driver.totalRevenue,
        trips:   driver.totalTrips,
        rating:  driver.averageRating,
      },
      period: periodData,
    };
  });

  // Sort by period trips descending
  result.sort((a, b) => b.period.trips - a.period.trips);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        period:       req.query.period || "month",
        periodRange:  { from: start, to: end },
        totalDrivers: drivers.length,
        drivers:      result,
      },
      "Driver analytics fetched"
    )
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SINGLE BUS DETAIL ANALYTICS
//
// GET /api/v1/operator/analytics/buses/:busId?period=month
//
// Deep dive on one bus: hourly/daily trip trend, passenger count,
// revenue timeline, and its driver history for the period.
// ─────────────────────────────────────────────────────────────────────────────
export const getBusDetailAnalytics = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);
  const { start, end, groupFormat, groupLabel } = buildDateRange(req.query);

  const bus = await Bus.findById(req.params.busId)
    .populate("driver", "licenseNumber status user");

  if (!bus) throw new ApiError(404, "Bus not found");
  if (String(bus.operator) !== String(operatorDoc._id))
    throw new ApiError(403, "This bus does not belong to your operator account");

  // Revenue/trips trend for this bus
  const trend = await Trip.aggregate([
    {
      $match: {
        busId:     bus._id,
        completed: true,
        exitTime:  { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id:        { $dateToString: { format: groupFormat, date: "$exitTime" } },
        revenue:    { $sum: "$fare" },
        trips:      { $sum: 1 },
        avgFare:    { $avg: "$fare" },
        passengers: { $addToSet: "$passengerId" },
      },
    },
    {
      $project: {
        _id: 0,
        label:            "$_id",
        revenue:          { $round: ["$revenue", 2] },
        trips:            1,
        avgFare:          { $round: ["$avgFare", 2] },
        uniquePassengers: { $size: "$passengers" },
      },
    },
    { $sort: { label: 1 } },
  ]);

  // Period summary
  const [summary] = await Trip.aggregate([
    {
      $match: {
        busId:     bus._id,
        completed: true,
        exitTime:  { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id:        null,
        revenue:    { $sum: "$fare" },
        trips:      { $sum: 1 },
        avgFare:    { $avg: "$fare" },
        passengers: { $addToSet: "$passengerId" },
      },
    },
    {
      $project: {
        _id: 0,
        revenue:          { $round: ["$revenue", 2] },
        trips:            1,
        avgFare:          { $round: ["$avgFare", 2] },
        uniquePassengers: { $size: "$passengers" },
      },
    },
  ]);

  // Drivers who drove this bus in this period
  const driversThisPeriod = await Trip.aggregate([
    {
      $match: {
        busId:     bus._id,
        completed: true,
        driver:    { $ne: null },
        exitTime:  { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id:     "$driver",
        trips:   { $sum: 1 },
        revenue: { $sum: "$fare" },
      },
    },
    {
      $lookup: {
        from:         "drivers",
        localField:   "_id",
        foreignField: "_id",
        as:           "driverDoc",
      },
    },
    { $unwind: { path: "$driverDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from:         "users",
        localField:   "driverDoc.user",
        foreignField: "_id",
        as:           "userDoc",
      },
    },
    { $unwind: { path: "$userDoc", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id:           0,
        driverId:      "$_id",
        name:          "$userDoc.FirstName",
        licenseNumber: "$driverDoc.licenseNumber",
        trips:         1,
        revenue:       { $round: ["$revenue", 2] },
      },
    },
    { $sort: { trips: -1 } },
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        bus: {
          _id:          bus._id,
          plateNumber:  bus.plateNumber,
          busType:      bus.busType,
          status:       bus.status,
          maxCapacity:  bus.maxCapacity,
          currentDriver:bus.driver,
          lastSeen:     bus.lastSeen,
          allTime: {
            revenue: bus.totalRevenue,
            trips:   bus.totalTrips,
            rating:  bus.averageRating,
          },
        },
        period:      req.query.period || "month",
        groupBy:     groupLabel,
        periodRange: { from: start, to: end },
        summary:     summary || { revenue: 0, trips: 0, avgFare: 0, uniquePassengers: 0 },
        trend,
        driversThisPeriod,
      },
      "Bus detail analytics fetched"
    )
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SINGLE DRIVER DETAIL ANALYTICS
//
// GET /api/v1/operator/analytics/drivers/:driverId?period=month
//
// Deep dive on one driver: trips over time, revenue, buses driven.
// ─────────────────────────────────────────────────────────────────────────────
export const getDriverDetailAnalytics = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);
  const { start, end, groupFormat, groupLabel } = buildDateRange(req.query);

  const driver = await Driver.findById(req.params.driverId)
    .populate("user", "FirstName email phone")
    .populate("assignedBus", "plateNumber busType status");

  if (!driver) throw new ApiError(404, "Driver not found");
  if (String(driver.operator) !== String(operatorDoc._id))
    throw new ApiError(403, "This driver does not belong to your operator account");

  // Trip trend for this driver
  const trend = await Trip.aggregate([
    {
      $match: {
        driver:    driver._id,
        completed: true,
        exitTime:  { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id:        { $dateToString: { format: groupFormat, date: "$exitTime" } },
        revenue:    { $sum: "$fare" },
        trips:      { $sum: 1 },
        avgFare:    { $avg: "$fare" },
        passengers: { $addToSet: "$passengerId" },
      },
    },
    {
      $project: {
        _id: 0,
        label:            "$_id",
        revenue:          { $round: ["$revenue", 2] },
        trips:            1,
        avgFare:          { $round: ["$avgFare", 2] },
        uniquePassengers: { $size: "$passengers" },
      },
    },
    { $sort: { label: 1 } },
  ]);

  // Period summary
  const [summary] = await Trip.aggregate([
    {
      $match: {
        driver:    driver._id,
        completed: true,
        exitTime:  { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id:        null,
        revenue:    { $sum: "$fare" },
        trips:      { $sum: 1 },
        avgFare:    { $avg: "$fare" },
        passengers: { $addToSet: "$passengerId" },
      },
    },
    {
      $project: {
        _id: 0,
        revenue:          { $round: ["$revenue", 2] },
        trips:            1,
        avgFare:          { $round: ["$avgFare", 2] },
        uniquePassengers: { $size: "$passengers" },
      },
    },
  ]);

  // Buses this driver drove in this period
  const busesThisPeriod = await Trip.aggregate([
    {
      $match: {
        driver:    driver._id,
        completed: true,
        exitTime:  { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id:     "$busId",
        trips:   { $sum: 1 },
        revenue: { $sum: "$fare" },
      },
    },
    {
      $lookup: {
        from:         "buses",
        localField:   "_id",
        foreignField: "_id",
        as:           "busDoc",
      },
    },
    { $unwind: { path: "$busDoc", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id:         0,
        busId:       "$_id",
        plateNumber: "$busDoc.plateNumber",
        busType:     "$busDoc.busType",
        trips:       1,
        revenue:     { $round: ["$revenue", 2] },
      },
    },
    { $sort: { trips: -1 } },
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        driver: {
          _id:           driver._id,
          name:          driver.user?.FirstName,
          email:         driver.user?.email,
          phone:         driver.user?.phone,
          licenseNumber: driver.licenseNumber,
          licenseExpiry: driver.licenseExpiry,
          status:        driver.status,
          assignedBus:   driver.assignedBus,
          allTime: {
            revenue: driver.totalRevenue,
            trips:   driver.totalTrips,
            rating:  driver.averageRating,
          },
        },
        period:      req.query.period || "month",
        groupBy:     groupLabel,
        periodRange: { from: start, to: end },
        summary:     summary || { revenue: 0, trips: 0, avgFare: 0, uniquePassengers: 0 },
        trend,
        busesThisPeriod,
      },
      "Driver detail analytics fetched"
    )
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. FLEET COMPARISON
//
// GET /api/v1/operator/analytics/fleet-comparison?period=month
//
// Side-by-side comparison of all buses ranked by revenue for the period.
// Great for a bar chart showing which bus earns the most.
// ─────────────────────────────────────────────────────────────────────────────
export const getFleetComparison = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);
  const { start, end } = buildDateRange(req.query);

  const comparison = await Trip.aggregate([
    {
      $match: {
        operator:  operatorDoc._id,
        completed: true,
        exitTime:  { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id:        "$busId",
        revenue:    { $sum: "$fare" },
        trips:      { $sum: 1 },
        passengers: { $addToSet: "$passengerId" },
      },
    },
    {
      $lookup: {
        from:         "buses",
        localField:   "_id",
        foreignField: "_id",
        as:           "bus",
      },
    },
    { $unwind: "$bus" },
    {
      $project: {
        _id:              0,
        busId:            "$_id",
        plateNumber:      "$bus.plateNumber",
        busType:          "$bus.busType",
        status:           "$bus.status",
        revenue:          { $round: ["$revenue", 2] },
        trips:            1,
        uniquePassengers: { $size: "$passengers" },
        revenuePerTrip:   { $round: [{ $divide: ["$revenue", "$trips"] }, 2] },
      },
    },
    { $sort: { revenue: -1 } },
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        period:      req.query.period || "month",
        periodRange: { from: start, to: end },
        comparison,
      },
      "Fleet comparison fetched"
    )
  );
});
