require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Routes ──
app.use('/api/vehicles',     require('./routes/vehicles'));
app.use('/api/drivers',      require('./routes/drivers'));
app.use('/api/transporters', require('./routes/transporters'));
app.use('/api/parties',      require('./routes/parties'));
app.use('/api/routes',       require('./routes/routes'));
app.use('/api/ratecards',    require('./routes/ratecards'));
app.use('/api/trips',        require('./routes/trips'));
app.use('/api/ledger',       require('./routes/ledger'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Transport ERP backend running on port ${PORT}`));
