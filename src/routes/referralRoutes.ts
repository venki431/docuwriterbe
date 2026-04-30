import { Router } from 'express';
import * as referralController from '../controllers/referralController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);
router.get('/link', referralController.link);
router.get('/status', referralController.status);
router.post('/apply', referralController.apply);

export default router;
