export interface ConvoCallState {
  userAId: string;
  userBId: string;
  aHasReplied: boolean;
  bHasReplied: boolean;
}

export interface CallFlags {
  audioCallEnabled: boolean;
  videoCallEnabled: boolean;
}

/**
 * Compute call-enabled flags from the requesting user's perspective.
 * Calls are enabled when the OTHER party has sent at least one reply.
 * Both audio and video unlock at the same time.
 */
export function callFlags(convo: ConvoCallState, userId: string): CallFlags {
  const isA = convo.userAId === userId;
  const enabled = isA ? convo.bHasReplied : convo.aHasReplied;
  return { audioCallEnabled: enabled, videoCallEnabled: enabled };
}
