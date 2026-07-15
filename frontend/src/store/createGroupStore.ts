import { create } from 'zustand';

/** A contact picked in the Create Group flow (subset of UserCard we need downstream). */
export interface PickedUser {
  id: string;
  firstName: string | null;
  profilePhoto: string | null;
  age: number | null;
  /** Directly addable when true; otherwise an invite is sent. */
  groupsAvailable: boolean;
}

interface CreateGroupState {
  selected: PickedUser[];
  setSelected: (selected: PickedUser[]) => void;
  clear: () => void;
}

/**
 * Ephemeral hand-off between the Create Group member picker and the details
 * screen — avoids serializing avatars/names through router query params.
 */
export const useCreateGroupStore = create<CreateGroupState>((set) => ({
  selected: [],
  setSelected: (selected) => set({ selected }),
  clear: () => set({ selected: [] }),
}));
