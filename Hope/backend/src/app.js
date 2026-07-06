const express = require('express');
const cors = require('cors');
const { createRoutes } = require('./routes');

function createApp(prisma) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', createRoutes(prisma));

  return app;
}

module.exports = {
  createApp
};