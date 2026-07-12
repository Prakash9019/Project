/** Plan + add-on catalog — values mirror backend-spec.json exactly. */
import type { Plan, BillingCycle, AddOnType } from '../types/api';

export interface PlanInfo {
  plan: Plan;
  name: string;
  priceInr: Record<BillingCycle, number>;
  perks: string[];
}

export const PLANS: PlanInfo[] = [
  {
    plan: 'free',
    name: 'Free',
    priceInr: { monthly: 0, three_month: 0, six_month: 0, annual: 0 },
    perks: ['20 unique people (lifetime)', '150-char bio', '5 min audio / 2 min video daily', '100 grid profiles', '1 Album (10 photos)'],
  },
  {
    plan: 'premium',
    name: 'Premium',
    priceInr: { monthly: 399, three_month: 999, six_month: 1799, annual: 2999 },
    perks: ['Unlimited people', '400-char bio', 'Voice & video clips', '600 grid profiles', 'Read receipts', '3 Albums (30 photos each)'],
  },
  {
    plan: 'gold',
    name: 'Gold',
    priceInr: { monthly: 799, three_month: 1999, six_month: 3499, annual: 5999 },
    perks: ['Everything in Premium', '600-char bio', 'Incognito mode', 'Travel mode', 'Who viewed me', 'Verified badge', '5 Albums (50 photos each)'],
  },
  {
    plan: 'platinum',
    name: 'Platinum',
    priceInr: { monthly: 1499, three_month: 3799, six_month: 6799, annual: 11499 },
    perks: ['Everything in Gold', 'AI features', '5× algorithm boost', 'Unlimited Albums (100 photos each)', '10 pinned chats'],
  },
];

export const BILLING_CYCLES: { value: BillingCycle; label: string; tag?: 'Most Popular' | 'Best Value' }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'three_month', label: '3 Month', tag: 'Most Popular' },
  { value: 'six_month', label: '6 Month' },
  { value: 'annual', label: 'Annual', tag: 'Best Value' },
];

/** % saved vs. paying the monthly price every month for the cycle's duration. */
export function calcSavings(monthlyPrice: number, totalPrice: number, months: number): number {
  if (monthlyPrice <= 0 || months <= 0) return 0;
  const fullPrice = monthlyPrice * months;
  return Math.round(((fullPrice - totalPrice) / fullPrice) * 100);
}

const CYCLE_MONTHS: Record<BillingCycle, number> = {
  monthly: 1,
  three_month: 3,
  six_month: 6,
  annual: 12,
};

/** Savings % for a plan's given billing cycle vs. its monthly price. 0 for monthly itself. */
export function planCycleSavings(plan: PlanInfo, cycle: BillingCycle): number {
  if (cycle === 'monthly') return 0;
  return calcSavings(plan.priceInr.monthly, plan.priceInr[cycle], CYCLE_MONTHS[cycle]);
}

export interface AddOnInfo {
  id: AddOnType;
  priceInr: number;
  description: string;
  meta: string;
}

export const ADD_ONS: AddOnInfo[] = [
  { id: 'boost_local', priceInr: 49, description: 'Top of nearby grid for 30 min', meta: '30 min' },
  { id: 'boost_extended', priceInr: 99, description: 'Top of grid with expanded radius', meta: '30 min' },
  { id: 'boost_city_wide', priceInr: 199, description: 'Top of entire city grid for 30 min', meta: '30 min' },
  { id: 'mega_boost', priceInr: 499, description: 'City-wide top placement for 1 hour', meta: '1 hour' },
  { id: 'spotlight', priceInr: 199, description: 'Featured Nearby carousel on home grid', meta: '24 hours' },
  { id: 'chat_pack_s', priceInr: 79, description: '5 extra interaction slots', meta: '+5 slots' },
  { id: 'chat_pack_m', priceInr: 149, description: '15 extra interaction slots', meta: '+15 slots' },
  { id: 'chat_pack_l', priceInr: 249, description: '35 extra interaction slots', meta: '+35 slots' },
  { id: 'travel_pass', priceInr: 99, description: 'Travel mode for 24h', meta: '24 hours' },
  { id: 'travel_pass_week', priceInr: 299, description: 'Travel mode for 7 days', meta: '7 days' },
  { id: 'verified_badge', priceInr: 199, description: 'Blue verified tick', meta: 'Permanent' },
  { id: 'audio_call_topup', priceInr: 49, description: '30 extra audio minutes (free tier)', meta: '+30 min' },
  { id: 'video_call_topup', priceInr: 79, description: '30 extra video minutes (free tier)', meta: '+30 min' },
];
