import './types/auth'; // register Express augmentation
import cors from 'cors';
import express from 'express';
import { config, assertProductionSecrets } from './config';
import { errorHandler, notFound } from './middleware/errorHandler';
import { requireAuth } from './middleware/auth';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import billingRoutes from './routes/billingRoutes';
import adminRoutes from './routes/adminRoutes';
import documentRoutes from './routes/documentRoutes';
import { webhook as billingWebhook } from './controllers/billingController';
import { closeBrowser } from './services/pdfService';

assertProductionSecrets();

const app = express();
// Honour X-Forwarded-For from a single trusted proxy (nginx / Cloudflare / Fly /
// Cloud Run). In dev this is a no-op; prod operators should adjust per infra.
app.set('trust proxy', 1);

app.use(cors({ origin: config.clientOrigin, credentials: true }));

// Razorpay webhook MUST be registered before express.json so we can verify the
// HMAC signature against the raw body.
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  billingWebhook,
);

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'docuwriter', env: config.nodeEnv });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', documentRoutes);

// Convenience alias used by the subscription-status poll on the client.
app.get('/api/subscription', requireAuth, (req, res) => {
  res.json(req.subscription);
});

app.use(notFound);
app.use(errorHandler);

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`DocGen API listening on http://localhost:${config.port}`);
});

async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\nReceived ${signal}, closing...`);
  await closeBrowser();
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
