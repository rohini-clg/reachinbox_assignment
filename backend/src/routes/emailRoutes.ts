import { Router } from 'express';
import { getEmailById, getEmailSearch, getQueueOverview, getScheduledEmails, getSentEmails, scheduleEmails } from '../controllers/emailController';

const router = Router();

router.post('/schedule', scheduleEmails);
router.get('/scheduled', getScheduledEmails);
router.get('/sent', getSentEmails);
router.get('/search', getEmailSearch);
router.get('/queue', getQueueOverview);
router.get('/:id', getEmailById);

export default router;
