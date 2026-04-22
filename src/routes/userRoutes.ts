import { Router } from 'express';
import * as userController from '../controllers/userController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/me', requireAuth, userController.me);
router.patch('/me', requireAuth, userController.updateMe);

export default router;
