import { Router } from 'express';
import { generateDocument, previewDocument } from '../controllers/documentController';
import {
  requireActiveSubscription,
  requireAuth,
  requireVerified,
} from '../middleware/auth';

const router = Router();

router.post(
  '/generate-document',
  requireAuth,
  requireVerified,
  requireActiveSubscription,
  generateDocument,
);

router.post(
  '/preview-document',
  requireAuth,
  requireVerified,
  requireActiveSubscription,
  previewDocument,
);

export default router;
