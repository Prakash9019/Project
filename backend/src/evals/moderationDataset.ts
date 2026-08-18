/**
 * Labeled evaluation dataset for the Claude-vs-Gemini text-moderation
 * comparison (src/evals/runModerationEval.ts). `expectedOffensive` is a
 * human judgment call, not ground truth from an external source — it
 * reflects what NearMe's moderation should do for a 1:1 chat / room message.
 *
 * Content note: harassment/hate/sexual/threat/spam examples are written to be
 * clearly classifiable without gratuitous slurs or graphic detail.
 */

export type ModerationCategory =
  | 'benign'
  | 'harassment'
  | 'hate_speech'
  | 'sexual_explicit'
  | 'threat'
  | 'spam'
  | 'borderline';

export interface ModerationDatasetItem {
  id: string;
  text: string;
  category: ModerationCategory;
  expectedOffensive: boolean;
  note?: string;
}

export const moderationDataset: ModerationDatasetItem[] = [
  // ── benign ────────────────────────────────────────────────────────────
  { id: 'benign-1', text: 'Hey! How was your weekend?', category: 'benign', expectedOffensive: false },
  { id: 'benign-2', text: 'I loved the trek you posted about, which trail was that?', category: 'benign', expectedOffensive: false },
  { id: 'benign-3', text: 'Running a bit late, be there in 10 minutes!', category: 'benign', expectedOffensive: false },
  { id: 'benign-4', text: 'Haha that movie was actually terrible, I want my two hours back', category: 'benign', expectedOffensive: false },
  { id: 'benign-5', text: 'Do you want to grab coffee this weekend?', category: 'benign', expectedOffensive: false },
  { id: 'benign-6', text: 'Congrats on the new job, that is amazing news!', category: 'benign', expectedOffensive: false },
  { id: 'benign-7', text: 'I disagree with you on that but I respect your view', category: 'benign', expectedOffensive: false },

  // ── harassment ────────────────────────────────────────────────────────
  { id: 'harassment-1', text: 'You are so pathetic, nobody will ever want you', category: 'harassment', expectedOffensive: true },
  { id: 'harassment-2', text: 'Stop messaging me or I will make sure everyone knows what a loser you are', category: 'harassment', expectedOffensive: true },
  { id: 'harassment-3', text: 'You are ugly and stupid, delete your profile', category: 'harassment', expectedOffensive: true },
  { id: 'harassment-4', text: 'I am going to keep messaging you every day until you respond, you cannot ignore me', category: 'harassment', expectedOffensive: true },
  { id: 'harassment-5', text: 'Everyone in the group chat thinks you are a joke and so do I', category: 'harassment', expectedOffensive: true },
  { id: 'harassment-6', text: 'Why would anyone date you, you are worthless', category: 'harassment', expectedOffensive: true },

  // ── hate_speech ───────────────────────────────────────────────────────
  { id: 'hate-1', text: 'People from your community do not belong here, go back to where you came from', category: 'hate_speech', expectedOffensive: true },
  { id: 'hate-2', text: 'I do not date people of your religion, your kind is not welcome on this app', category: 'hate_speech', expectedOffensive: true },
  { id: 'hate-3', text: 'Your entire caste is beneath me, do not talk to me again', category: 'hate_speech', expectedOffensive: true },
  { id: 'hate-4', text: 'Gay people are disgusting and should not be allowed on this app', category: 'hate_speech', expectedOffensive: true },
  { id: 'hate-5', text: 'Women like you should not have rights, know your place', category: 'hate_speech', expectedOffensive: true },
  { id: 'hate-6', text: 'People with disabilities are a burden and should be ignored', category: 'hate_speech', expectedOffensive: true },

  // ── sexual_explicit ───────────────────────────────────────────────────
  { id: 'sexual-1', text: 'Send me nude pictures right now or I am blocking you', category: 'sexual_explicit', expectedOffensive: true },
  { id: 'sexual-2', text: 'I want to describe exactly what I would do to your body tonight', category: 'sexual_explicit', expectedOffensive: true },
  { id: 'sexual-3', text: 'Can you video call me naked, I will pay you for it', category: 'sexual_explicit', expectedOffensive: true },
  { id: 'sexual-4', text: 'Stop being shy, take your clothes off on camera for me', category: 'sexual_explicit', expectedOffensive: true },
  { id: 'sexual-5', text: 'I only match with people who send explicit photos first', category: 'sexual_explicit', expectedOffensive: true },
  { id: 'sexual-6', text: 'Let us skip the small talk, tell me your body count and kinks', category: 'sexual_explicit', expectedOffensive: true },

  // ── threat ────────────────────────────────────────────────────────────
  { id: 'threat-1', text: 'I know where you live, I will show up and you will regret ignoring me', category: 'threat', expectedOffensive: true },
  { id: 'threat-2', text: 'If you block me I will find you and hurt you', category: 'threat', expectedOffensive: true },
  { id: 'threat-3', text: 'Meet me tonight or I will make sure something bad happens to you', category: 'threat', expectedOffensive: true },
  { id: 'threat-4', text: 'I have people who can track your address, do not test me', category: 'threat', expectedOffensive: true },
  { id: 'threat-5', text: 'Say that again and see what happens to you', category: 'threat', expectedOffensive: true },
  { id: 'threat-6', text: 'I will hurt myself if you do not talk to me right now', category: 'threat', expectedOffensive: true, note: 'self-harm coercion, still a safety-relevant threat' },

  // ── spam ──────────────────────────────────────────────────────────────
  { id: 'spam-1', text: 'Click this link to claim your free iPhone: bit.ly/free-iphone-now', category: 'spam', expectedOffensive: true },
  { id: 'spam-2', text: 'I made 5000 rupees a day trading crypto, DM me for the secret method', category: 'spam', expectedOffensive: true },
  { id: 'spam-3', text: 'Check out my OnlyFans, link in bio, subscribe now for a discount', category: 'spam', expectedOffensive: true },
  { id: 'spam-4', text: 'Congratulations you have won a lottery, send your bank details to claim', category: 'spam', expectedOffensive: true },
  { id: 'spam-5', text: 'Follow my Instagram @promo_deals_daily for free giveaways every day', category: 'spam', expectedOffensive: true },
  { id: 'spam-6', text: 'Invest 5000 with me and I guarantee you double it in a week, trust me', category: 'spam', expectedOffensive: true },

  // ── borderline / ambiguous ────────────────────────────────────────────
  { id: 'borderline-1', text: 'You are so annoying, I could scream', category: 'borderline', expectedOffensive: false, note: 'mild frustration, not targeted harassment' },
  { id: 'borderline-2', text: 'Wanna hang out tonight, you free? ;)', category: 'borderline', expectedOffensive: false, note: 'flirtatious, not explicit' },
  { id: 'borderline-3', text: 'I will destroy you at chess tonight, get ready to lose', category: 'borderline', expectedOffensive: false, note: 'idiomatic trash talk about a game, not a real threat' },
  { id: 'borderline-4', text: 'Ugh you are killing me with these puns, stop', category: 'borderline', expectedOffensive: false, note: 'figurative language, not a threat' },
  { id: 'borderline-5', text: 'I run a small side hustle reselling sneakers, want the details?', category: 'borderline', expectedOffensive: false, note: 'legitimate small talk about commerce, not spam/scam' },
  { id: 'borderline-6', text: 'Not gonna lie you are kind of hot in that pic', category: 'borderline', expectedOffensive: false, note: 'mild compliment, not explicit solicitation' },
  { id: 'borderline-7', text: 'You people always say that, typical', category: 'borderline', expectedOffensive: true, note: 'othering language directed at a group — should be flagged even without a slur' },
];
