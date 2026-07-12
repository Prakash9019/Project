import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import { requirePlan } from '../../middleware/subscription';
import * as c from './chat.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

// Start / list conversations
router.post('/start', validate(c.startConversationSchema), asyncHandler(c.startConversation));
router.get('/', validate(c.listConversationsQuerySchema, 'query'), asyncHandler(c.listConversations));

// Saved phrases — Premium+
router.get('/phrases', requirePlan('premium', 'gold', 'platinum'), asyncHandler(c.listSavedPhrases));
router.post('/phrases', requirePlan('premium', 'gold', 'platinum'), validate(c.savedPhraseSchema), asyncHandler(c.createSavedPhrase));
router.delete('/phrases/:phraseId', requirePlan('premium', 'gold', 'platinum'), asyncHandler(c.deleteSavedPhrase));

// Message templates
router.get('/templates', asyncHandler(c.listTemplates));
router.post('/templates', validate(c.templateSchema), asyncHandler(c.createTemplate));
router.delete('/templates/:templateId', asyncHandler(c.deleteTemplate));

// Per-conversation
router.get('/:conversationId/messages', validate(c.listMessagesQuerySchema, 'query'), asyncHandler(c.listMessages));
router.post('/:conversationId/messages', validate(c.sendMessageSchema), asyncHandler(c.sendMessage));
router.post('/:conversationId/read', asyncHandler(c.markRead));
router.delete('/:conversationId', asyncHandler(c.deleteThreadHandler));
router.post('/:conversationId/dismiss', asyncHandler(c.dismissConversation));
router.post('/:conversationId/pin', asyncHandler(c.pinConversation));
router.delete('/:conversationId/pin', asyncHandler(c.unpinConversation));

// Per-message
router.patch(
  '/:conversationId/messages/:messageId',
  requirePlan('gold', 'platinum'),
  validate(c.editMessageSchema),
  asyncHandler(c.editMessage),
);
router.post('/:conversationId/messages/:messageId/unsend', asyncHandler(c.unsendMessage));
router.delete('/:conversationId/messages/:messageId', asyncHandler(c.deleteMessageHandler));
router.post('/:conversationId/messages/:messageId/view', asyncHandler(c.consumeExpiringPhoto));
router.post(
  '/:conversationId/messages/:messageId/translate',
  validate(c.translateSchema),
  asyncHandler(c.translateMessage),
);

export default router;
