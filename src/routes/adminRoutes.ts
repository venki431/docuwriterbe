import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { requireAdmin, requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth, requireAdmin);
router.get('/overview', adminController.overview);

export default router;
