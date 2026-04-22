import { Router } from 'express';
import * as billingController from '../controllers/billingController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/plans', billingController.listPlans);
router.post('/create-order', requireAuth, billingController.createOrder);
router.post(
  '/verification/create-order',
  requireAuth,
  billingController.createVerificationOrder,
);
router.post('/verify', requireAuth, billingController.verifyPayment);
router.get('/transactions', requireAuth, billingController.listTransactions);
router.get('/invoices/:id', requireAuth, billingController.downloadInvoice);
router.post(
  '/invoices/:id/resend-email',
  requireAuth,
  billingController.resendInvoiceEmail,
);

export default router;
