# Transport ERP

POC build for a Fleet/Transport management system. Handles Trip creation, Transporter Ledger auto-posting, and basic reporting.

## Stack
- **Backend**: Node.js + Express + Prisma ORM
- **Database**: PostgreSQL
- **Frontend**: React + Vite
- **Dev**: Docker Compose

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/5h1Vm/Transport-ERP.git
cd Transport-ERP

# 2. Copy env file
cp .env.example .env

# 3. Start everything
docker-compose up --build

# 4. In a new terminal, run migrations + seed
docker-compose exec backend npx prisma migrate dev --name init
docker-compose exec backend node src/seed.js
```

Frontend: http://localhost:5173  
Backend API: http://localhost:4000

## POC Scope (2-3 days)
- [x] Seed data: Vehicles, Drivers, Transporters, Routes, Rate Cards, Parties
- [ ] Trip creation (auto-calculates freight from Rate Card)
- [ ] Trip status: Open → Delivered → Closed
- [ ] POD file upload on trip
- [ ] Transporter Ledger auto-posting on trip close
- [ ] Ledger view: per-transporter running balance

## Modules Deferred (Phase 1.5)
- LR PDF generation
- Fleet maintenance & fuel tracking
- Compliance document vault
- WhatsApp API integration
- Multi-company / multi-org switching
