import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { requireAdmin, requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth, requireAdmin);
router.get('/overview', adminController.overview);
router.get('/users', adminController.users);
router.get('/users/:id', adminController.userDetail);
router.get('/transactions', adminController.transactions);

export default router;
