const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');

const organizationSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  language: z.string().optional(),
  address: z.string().optional()
});

/**
 * System endpoints: health check and the manual organization seed.
 */
module.exports = function systemRoutes(ctx) {
  const { prisma } = ctx;
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({ ok: true, service: 'Transit Ledger API' });
  });

  router.post('/seed', asyncHandler(async (req, res) => {
    const payload = organizationSchema.parse(req.body);
    const organization = await prisma.organization.create({ data: payload });
    res.status(201).json(organization);
  }));

  return router;
};
