import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import { premiumFeature } from '../common/premium';
import * as c from './chat.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

// Start / list conversations
router.post('/start', validate(c.startConversationSchema), asyncHandler(c.startConversation));
router.get('/', validate(c.listConversationsQuerySchema, 'query'), asyncHandler(c.listConversations));

// Saved phrases (premium)
router.get('/phrases', premiumFeature('saved_phrases'), asyncHandler(c.listSavedPhrases));
router.post('/phrases', premiumFeature('saved_phrases'), validate(c.savedPhraseSchema), asyncHandler(c.createSavedPhrase));
router.delete('/phrases/:phraseId', premiumFeature('saved_phrases'), asyncHandler(c.deleteSavedPhrase));

// Per-conversation
router.get('/:conversationId/messages', validate(c.listMessagesQuerySchema, 'query'), asyncHandler(c.listMessages));
router.post('/:conversationId/messages', validate(c.sendMessageSchema), asyncHandler(c.sendMessage));
router.post('/:conversationId/read', asyncHandler(c.markRead));
router.delete('/:conversationId', asyncHandler(c.deleteThreadHandler));
router.post('/:conversationId/dismiss', asyncHandler(c.dismissConversation));

// Per-message
router.post('/:conversationId/messages/:messageId/unsend', premiumFeature('unsend'), asyncHandler(c.unsendMessage));
router.delete('/:conversationId/messages/:messageId', asyncHandler(c.deleteMessageHandler));
router.post('/:conversationId/messages/:messageId/view', asyncHandler(c.consumeExpiringPhoto));
router.post('/:conversationId/messages/:messageId/translate', premiumFeature('chat_translate'), validate(c.translateSchema), asyncHandler(c.translateMessage));

export default router;
