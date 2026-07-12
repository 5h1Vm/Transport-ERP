const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');
const { parseLimit, parseOffset } = require('../utils/pagination');

// Add money utility once Part B is implemented
const { money, add, sub, toRupees } = require('../utils/money');

const ledgerAccountSchema = z.object({
  kind: z.enum(['FINANCIER', 'VEHICLE_SUPPLIER', 'VENDOR', 'PARTNER']),
  name: z.string().min(2).max(100),
  contactPerson: z.string().max(60).optional(),
  phone: z.string().regex(/^[+0-9 -]{10,20}$/, 'Enter a valid phone number (at least 10 digits)').optional().or(z.literal('')),
  notes: z.string().optional()
});

const ledgerEntrySchema = z.object({
  type: z.enum(['DEBIT', 'CREDIT']),
  amount: z.coerce.number().positive(),
  description: z.string().optional(),
  date: z.string().datetime().optional(),
  source: z.enum(['MANUAL', 'EMI_ACCRUAL']).default('MANUAL'),
  relatedType: z.string().optional(),
  relatedId: z.string().optional()
});

const vehicleLoanSchema = z.object({
  vehicleId: z.string().cuid(),
  financierAccountId: z.string().cuid(),
  principal: z.coerce.number().positive(),
  emiAmount: z.coerce.number().positive(),
  emiDueDay: z.coerce.number().int().min(1).max(31),
  tenureMonths: z.coerce.number().int().positive(),
  startDate: z.string().datetime(),
  notes: z.string().optional()
});

module.exports = function ledgerAccountRoutes(ctx) {
  const { prisma, getOrganization } = ctx;
  const router = express.Router();

  // GET /ledger-accounts - List accounts with running balance and entry count
  router.get('/ledger-accounts', asyncHandler(async (req, res) => {
    const take = parseLimit(req.query.limit, 100, 500);
    const skip = parseOffset(req.query.offset);
    const kindFilter = req.query.kind;

    const where = {
      organizationId: (await getOrganization()).id,
      ...(kindFilter && { kind: kindFilter })
    };

    // Get accounts with basic info
    const accounts = await prisma.ledgerAccount.findMany({
      where,
      include: {
        _count: {
          select: { entries: true, vehicleLoans: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip
    });

    // Compute balances using groupBy for efficiency (no N+1)
    // For detail view, we'll compute per account; for list we can do bulk
    const accountIds = accounts.map(a => a.id);

    if (accountIds.length > 0) {
      const balanceResults = await prisma.ledgerEntry.groupBy({
        by: ['accountId', 'type'],
        where: {
          accountId: { in: accountIds },
          organizationId: (await getOrganization()).id
        },
        _sum: {
          amount: true
        }
      });

      // Create a map of accountId -> { DEBIT, CREDIT } using Money
      const balanceMap = new Map();
      for (const result of balanceResults) {
        const amount = money(result._sum.amount ?? 0);
        const current = balanceMap.get(result.accountId) || { DEBIT: money(0), CREDIT: money(0) };
        if (result.type === 'DEBIT') {
          balanceMap.set(result.accountId, { DEBIT: add(current.DEBIT, amount), CREDIT: current.CREDIT });
        } else if (result.type === 'CREDIT') {
          balanceMap.set(result.accountId, { DEBIT: current.DEBIT, CREDIT: add(current.CREDIT, amount) });
        }
      }

      const result = accounts.map(account => {
        const { DEBIT: debitSum, CREDIT: creditSum } = balanceMap.get(account.id) || { DEBIT: money(0), CREDIT: money(0) };
        const balance = sub(debitSum, creditSum);
        return {
          ...account,
          entryCount: account._count.entries || 0,
          loanCount: account._count.vehicleLoans || 0,
          balance: toRupees(balance)
        };
      });
      res.json(result);
    } else {
      res.json([]);
    }
  }));

  // GET /ledger-accounts/:id - Get one account with entries and balance
  router.get('/ledger-accounts/:id', asyncHandler(async (req, res) => {
    const account = await prisma.ledgerAccount.findUnique({
      where: {
        id: req.params.id,
        organizationId: (await getOrganization()).id
      },
      include: {
        entries: {
          orderBy: { createdAt: 'desc' },
          take: 50 // Limit entries for performance
        },
        vehicleLoans: true
      }
    });

    if (!account) {
      return res.status(404).json({ message: 'Ledger account not found' });
    }

    // Compute balance for this specific account
    const entryResults = await prisma.ledgerEntry.groupBy({
      by: ['type'],
      where: {
        accountId: account.id,
        organizationId: (await getOrganization()).id
      },
      _sum: {
        amount: true
      }
    });

      // Compute balance using money.js
      let debitSum = money(0);
      let creditSum = money(0);
      for (const result of entryResults) {
        const amount = money(result._sum.amount ?? 0);
        if (result.type === "DEBIT") {
          debitSum = add(debitSum, amount);
        } else if (result.type === "CREDIT") {
          creditSum = add(creditSum, amount);
        }
      }
      const balance = sub(debitSum, creditSum);

    res.json({
      ...account,
      balance: toRupees(balance)
    });
  }));

  // POST /ledger-accounts - Create account
  router.post('/ledger-accounts', asyncHandler(async (req, res) => {
    const payload = ledgerAccountSchema.parse(req.body);
    const organization = await getOrganization();

    // Check for duplicate (organizationId, kind, name)
    const existing = await prisma.ledgerAccount.findFirst({
      where: {
        organizationId: organization.id,
        kind: payload.kind,
        name: payload.name
      }
    });

    if (existing) {
      return res.status(400).json({
        message: `A ledger account with kind '${payload.kind}' and name '${payload.name}' already exists.`
      });
    }

    const account = await prisma.ledgerAccount.create({
      data: {
        organizationId: organization.id,
        ...payload
      }
    });

    res.status(201).json(account);
  }));

  // PUT /ledger-accounts/:id - Update account (master fields only)
  router.put('/ledger-accounts/:id', asyncHandler(async (req, res) => {
    const payload = ledgerAccountSchema.partial().parse(req.body);
    const organization = await getOrganization();

    const account = await prisma.ledgerAccount.update({
      where: {
        id: req.params.id,
        organizationId: organization.id
      },
      data: payload
    });

    res.json(account);
  }));

  // DELETE /ledger-accounts/:id - Block if has entries, loans, or is vehicleSource
  router.delete('/ledger-accounts/:id', asyncHandler(async (req, res) => {
    const organization = await getOrganization();
    const accountId = req.params.id;

    // Check for dependencies
    const [entryCount, loanCount, vehicleCount] = await Promise.all([
      prisma.ledgerEntry.count({ where: { accountId, organizationId: organization.id } }),
      prisma.vehicleLoan.count({ where: { financierAccountId: accountId, organizationId: organization.id } }),
      prisma.vehicle.count({ where: { vehicleSourceId: accountId, organizationId: organization.id } })
    ]);

    if (entryCount > 0 || loanCount > 0 || vehicleCount > 0) {
      return res.status(400).json({
        message: 'Cannot delete account with existing entries, vehicle loans, or linked vehicles.'
      });
    }

    await prisma.ledgerAccount.delete({
      where: {
        id: accountId,
        organizationId: organization.id
      }
    });

    res.status(204).send();
  }));

  // GET /ledger-accounts/:id/entries - List entries for account
  router.get('/ledger-accounts/:id/entries', asyncHandler(async (req, res) => {
    const take = parseLimit(req.query.limit, 100, 500);
    const skip = parseOffset(req.query.offset);

    const organization = await getOrganization();
    const accountId = req.params.id;

    // Verify account belongs to organization
    const account = await prisma.ledgerAccount.findUnique({
      where: {
        id: accountId,
        organizationId: organization.id
      }
    });

    if (!account) {
      return res.status(404).json({ message: 'Ledger account not found' });
    }

    const entries = await prisma.ledgerEntry.findMany({
      where: {
        accountId,
        organizationId: organization.id
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip
    });

    res.json(entries);
  }));

  // POST /ledger-accounts/:id/entries - Append entry to account
  router.post('/ledger-accounts/:id/entries', asyncHandler(async (req, res) => {
    const payload = ledgerEntrySchema.parse(req.body);
    const organization = await getOrganization();
    const accountId = req.params.id;

    // Verify account belongs to organization and is active
    const account = await prisma.ledgerAccount.findUnique({
      where: {
        id: accountId,
        organizationId: organization.id,
        isActive: true
      }
    });

    if (!account) {
      return res.status(404).json({ message: 'Ledger account not found or inactive' });
    }

    // Parse date or use now
    const entryDate = payload.date ? new Date(payload.date) : new Date();

    const entry = await prisma.ledgerEntry.create({
      data: {
        organizationId: organization.id,
        accountId,
        type: payload.type,
        amount: money(payload.amount), // Will be handled as Decimal by Prisma
        description: payload.description,
        date: entryDate,
        source: payload.source,
        relatedType: payload.relatedType,
        relatedId: payload.relatedId
      }
    });

    res.status(201).json(entry);
  }));

  // POST /vehicle-loans - Create vehicle loan
  router.post('/vehicle-loans', asyncHandler(async (req, res) => {
    const payload = vehicleLoanSchema.parse(req.body);
    const organization = await getOrganization();

    // Verify vehicle belongs to organization
    const vehicle = await prisma.vehicle.findUnique({
      where: {
        id: payload.vehicleId,
        organizationId: organization.id
      }
    });

    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    // Verify financier account exists, belongs to org, and is FINANCIER kind
    const financierAccount = await prisma.ledgerAccount.findUnique({
      where: {
        id: payload.financierAccountId,
        organizationId: organization.id,
        kind: 'FINANCIER'
      }
    });

    if (!financierAccount) {
      return res.status(400).json({
        message: 'Financier account not found, does not belong to organization, or is not of kind FINANCIER'
      });
    }

    const loan = await prisma.vehicleLoan.create({
      data: {
        organizationId: organization.id,
        ...payload
      }
    });

    res.status(201).json(loan);
  }));

  // GET /vehicle-loans - List loans, optionally filtered by vehicle
  router.get('/vehicle-loans', asyncHandler(async (req, res) => {
    const take = parseLimit(req.query.limit, 100, 500);
    const skip = parseOffset(req.query.offset);
    const vehicleId = req.query.vehicleId;

    const organization = await getOrganization();
    const where = {
      organizationId: organization.id,
      ...(vehicleId && { vehicleId })
    };

    const loans = await prisma.vehicleLoan.findMany({
      where,
      include: {
        vehicle: {
          select: { id: true, vehicleNumber: true }
        },
        financierAccount: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip
    });

    res.json(loans);
  }));

  // PUT /vehicle-loans/:id - Update loan
  router.put('/vehicle-loans/:id', asyncHandler(async (req, res) => {
    const payload = vehicleLoanSchema.partial().parse(req.body);
    const organization = await getOrganization();

    // Verify loan belongs to organization
    const loan = await prisma.vehicleLoan.findUnique({
      where: {
        id: req.params.id,
        organizationId: organization.id
      }
    });

    if (!loan) {
      return res.status(404).json({ message: 'Vehicle loan not found' });
    }

    // If updating financier account, validate it's FINANCIER
    if (payload.financierAccountId) {
      const financierAccount = await prisma.ledgerAccount.findUnique({
        where: {
          id: payload.financierAccountId,
          organizationId: organization.id,
          kind: 'FINANCIER'
        }
      });

      if (!financierAccount) {
        return res.status(400).json({
          message: 'Financier account not found, does not belong to organization, or is not of kind FINANCIER'
        });
      }
    }

    const updatedLoan = await prisma.vehicleLoan.update({
      where: {
        id: req.params.id,
        organizationId: organization.id
      },
      data: payload
    });

    res.json(updatedLoan);
  }));

  return router;
};
