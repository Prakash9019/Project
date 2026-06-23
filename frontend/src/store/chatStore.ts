import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ConversationSummary } from '../types/api';
import { listConversations, ApiError } from '../services/api';

const CACHE_KEY = 'cache_conversations_v2';

interface ChatState {
  conversations: ConversationSummary[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  fetchConversations: (folder?: 'inbox' | 'requests', refreshing?: boolean) => Promise<void>;
  /** Apply a new/updated last message + bump unread (from socket message.created). */
  applyIncomingMessage: (conversationId: string, lastMessage: string, fromSelf: boolean) => void;
  upsertConversation: (convo: ConversationSummary) => void;
  markRead: (conversationId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  loading: false,
  refreshing: false,
  error: null,

  fetchConversations: async (folder = 'inbox', refreshing = false) => {
    set(refreshing ? { refreshing: true, error: null } : { loading: true, error: null });
    try {
      const res = await listConversations(folder);
      set({ conversations: res.conversations, loading: false, refreshing: false });
      if (folder === 'inbox') AsyncStorage.setItem(CACHE_KEY, JSON.stringify(res.conversations)).catch(() => {});
    } catch (e) {
      const err = e as ApiError;
      if (get().conversations.length === 0) {
        const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
        if (cached) set({ conversations: JSON.parse(cached) as ConversationSummary[] });
      }
      set({
        loading: false,
        refreshing: false,
        error: err.message ?? 'Failed to load conversations',
      });
    }
  },

  applyIncomingMessage: (conversationId, lastMessage, fromSelf) => {
    const list = get().conversations;
    const idx = list.findIndex((c) => c.id === conversationId);
    if (idx === -1) {
      // Unknown thread — pull fresh inbox from server.
      get().fetchConversations('inbox', true).catch(() => {});
      return;
    }
    set({
      conversations: list.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              lastMessage,
              lastMessageAt: new Date().toISOString(),
              unreadCount: fromSelf ? (c.unreadCount ?? 0) : (c.unreadCount ?? 0) + 1,
            }
          : c
      ),
    });
  },

  upsertConversation: (convo) => {
    const rest = get().conversations.filter(
      (c) => c.id !== convo.id && c.peer?.id !== convo.peer?.id
    );
    set({ conversations: [convo, ...rest] });
  },

  markRead: (conversationId) => {
    set({
      conversations: get().conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
    });
  },
}));
