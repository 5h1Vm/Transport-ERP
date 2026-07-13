const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');
const { parseLimit, parseOffset } = require('../utils/pagination');

const vehicleSchema = z.object({
  vehicleNumber: z.string().min(3),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.coerce.number().int().optional(),
  ownershipStatus: z.enum(['OWNED', 'ATTACHED', 'RENTED', 'LEASED', 'PARTNERSHIP']).default('OWNED'),
  chassisNumber: z.string().optional(),
  engineNumber: z.string().optional(),
  vehicleSourceId: z.string().cuid().optional(),
  currentDriverId: z.string().cuid().optional(),
  notes: z.string().optional()
});

// Stub function for WhatsApp notification - to be replaced with real implementation when provider is selected
const notifyDriverOfVehicleDocuments = async (prisma, vehicleId, newDriverId) => {
  // Fetch the vehicle with its document expiry dates
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      insuranceExpiry: true,
      pucExpiry: true,
      fitnessExpiry: true,
      permitExpiry: true,
      nationalPermitExpiry: true,
      vehicleNumber: true,
      make: true,
      model: true
    }
  });

  if (!vehicle || !newDriverId) {
    return;
  }

  // Fetch the driver details
  const driver = await prisma.driver.findUnique({
    where: { id: newDriverId },
    select: { name: true, phone: true }
  });

  if (!driver) {
    return;
  }

  // Format the message that would be sent via WhatsApp
  const message = `Vehicle Document Update\n\n` +
    `Vehicle: ${vehicle.vehicleNumber} ${vehicle.make || ''} ${vehicle.model || ''}\n` +
    `Document Expiry Dates:\n` +
    `  Insurance: ${vehicle.insuranceExpiry ? vehicle.insuranceExpiry.toISOString().split('T')[0] : 'Not set'}\n` +
    `  PUC: ${vehicle.pucExpiry ? vehicle.pucExpiry.toISOString().split('T')[0] : 'Not set'}\n` +
    `  Fitness: ${vehicle.fitnessExpiry ? vehicle.fitnessExpiry.toISOString().split('T')[0] : 'Not set'}\n` +
    `  Permit: ${vehicle.permitExpiry ? vehicle.permitExpiry.toISOString().split('T')[0] : 'Not set'}\n` +
    `  National Permit: ${vehicle.nationalPermitExpiry ? vehicle.nationalPermitExpiry.toISOString().split('T')[0] : 'Not set'}\n\n` +
    `Please ensure all documents are valid and renew if expired.`;

  // For now, just log what would be sent
  // TODO: Replace with actual WhatsApp API call when provider is selected
  console.log(`[WHATSAPP STUB] Sending to driver ${driver.name} (${driver.phone}):`);
  console.log(message);
  
  // Optional: Create a notification log entry if we had a NotificationLog model
  // await prisma.notificationLog.create({
  //   data: {
  //     vehicleId: vehicle.id,
  //     driverId: driver.id,
  //     message: message,
  //     status: 'SENT',
  //     sentAt: new Date()
  //   }
  // });
};

module.exports = function vehicleRoutes(ctx) {
  const { prisma, getOrganization } = ctx;
  const router = express.Router();

  router.get('/vehicles', asyncHandler(async (req, res) => {
    const vehicles = await prisma.vehicle.findMany({
      orderBy: { createdAt: 'desc' },
      take: parseLimit(req.query.limit, 100, 500),
      skip: parseOffset(req.query.offset),
      include: { vehicleSource: { select: { id: true, name: true } } }
    });
    res.json(vehicles);
  }));

  router.get('/vehicles/:vehicleId', asyncHandler(async (req, res) => {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.vehicleId },
      include: { trips: { orderBy: { createdAt: 'desc' }, take: 3 } }
    });

    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    res.json(vehicle);
  }));

  router.put('/vehicles/:vehicleId', asyncHandler(async (req, res) => {
    const payload = vehicleSchema.parse(req.body);
    
    // Get the current vehicle to check if currentDriverId is changing
    const currentVehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.vehicleId },
      select: { currentDriverId: true }
    });
    
    const vehicle = await prisma.vehicle.update({
      where: { id: req.params.vehicleId },
      data: payload
    });
    
    // If currentDriverId changed, trigger the notification
    if (payload.currentDriverId !== undefined && 
        payload.currentDriverId !== currentVehicle.currentDriverId) {
      await notifyDriverOfVehicleDocuments(prisma, req.params.vehicleId, payload.currentDriverId);
    }
    
    res.json(vehicle);
  }));

  router.post('/vehicles', asyncHandler(async (req, res) => {
    const payload = vehicleSchema.parse(req.body);
    const organization = await getOrganization();
    const vehicle = await prisma.vehicle.create({ data: { organizationId: organization.id, ...payload } });
    res.status(201).json(vehicle);
  }));

  router.delete('/vehicles/:vehicleId', asyncHandler(async (req, res) => {
    const vehicleId = req.params.vehicleId;
    const tripCount = await prisma.trip.count({ where: { vehicleId } });

    if (tripCount) {
      return res.status(400).json({ message: 'Delete linked trips first.' });
    }

    await prisma.vehicle.delete({ where: { id: vehicleId } });
    res.status(204).send();
  }));

  return router;
};
