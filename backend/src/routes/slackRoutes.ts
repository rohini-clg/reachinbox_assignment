import { Router } from 'express';
import {
    beginSlackOAuth,
    getSlackStatus,
    removeSlackIntegration,
    slackOAuthCallback,
} from '../controllers/slackController';
import { requireApiAuth } from '../middleware/apiAuth';

const router = Router();

router.get('/callback', slackOAuthCallback);
router.get('/status', requireApiAuth, getSlackStatus);
router.post('/connect', requireApiAuth, beginSlackOAuth);
router.delete('/', requireApiAuth, removeSlackIntegration);

export default router;
