# NearMe: Complete Non-Technical Guide to Frontend AI Features
### Full Product & Technical Audit of Artificial Intelligence in the NearMe Mobile App

---

## 1. Executive Summary

In **NearMe (Proximity Social)**, Artificial Intelligence is not just a marketing gimmick—it is engineered as a core value driver for the **Platinum subscription tier** and as an active assistant to solve the most awkward, time-consuming parts of online dating:

1. **Overcoming the "Blank Screen" Paralysis:** Giving users smart, personalized ways to start conversations without cheesy pickup lines.
2. **Conversation Momentum:** Suggesting quick, natural replies during live messaging.
3. **Smart Matching:** Explaining real psychological chemistry and compatibility instead of just showing a generic distance tag.
4. **Profile Optimization:** Giving users a personal dating coach to improve their photos, bios, and prompt answers to get more matches.
5. **Safety & International Discovery:** Protecting users from toxic chat and translating foreign languages on the fly.

### The NearMe AI Golden Rule: "AI Assisted, Human Controlled"
- **Zero Automatic Sending:** The AI **never** sends messages or takes actions on behalf of the user. Tapping an AI suggestion merely loads the text into the input composer so the user can read, edit, or delete it before pressing send.
- **Strict Privacy & User Control:** Every single AI feature has an independent **On/Off switch** in the user's Settings (`Settings → AI Features`).
- **Grounded & Non-Explicit:** The AI is strictly prompt-engineered to remain polite, warm, and natural, and is forbidden from generating sexually explicit or offensive content.

---

## 2. Master Feature Status Matrix

Here is the quick-glance status of every AI feature across the frontend and backend:

| # | Feature Name | Where It Appears in App | User Experience | Current Status | Access Tier |
|---|---|---|---|---|---|
| **1** | **AI Icebreakers** | Empty 1:1 Chat Screen | 3 personalized conversation starter bubbles based on the match's profile | <span style="color:green">**✅ Fully Implemented & Live**</span> | Platinum (Opt-in) |
| **2** | **AI Reply Suggestions** | Chat Keyboard Composer | 3 smart reply chips above the keyboard matching the conversation context | <span style="color:green">**✅ Fully Implemented & Live**</span> | Platinum (Opt-in) |
| **3** | **AI Compatibility Score & Breakdown** | Public Profile Screen | 0–100% score + 2–3 bullet points explaining why you two match | <span style="color:green">**✅ Fully Implemented & Live**</span> | Platinum (Paywalled for Free) |
| **4** | **AI Daily Top 10** | Browse Grid (Top Carousel) | Daily curated row of 10 best matches nearby with "Why" connection tags | <span style="color:green">**✅ Fully Implemented & Live**</span> | Platinum (Paywalled for Free) |
| **5** | **AI Profile Optimizer** | Edit Profile Screen | In-app dating coach showing profile score (0-100) + tailored improvement tips | <span style="color:green">**✅ Fully Implemented & Live**</span> | Platinum (Paywalled for Free) |
| **6** | **In-Chat Message Translation** | Message Context Menu | Long-press any message to translate it instantly into your language | <spa n style="color:green">**✅ Fully Implemented & Live**</span> | Gold / Platinum |
| **7** | **AI User Control Panel** | Settings → AI Features | 5 independent toggle switches to enable/disable each AI tool individually | <span style="color:green">**✅ Fully Implemented & Live**</span> | All Users (Settings) |
| **8** | **AI Offensive Text Moderation** | Chat & Dating Rooms | Automatically screens outgoing text messages for toxicity, hate speech, and harassment | <span style="color:orange">**⚠️ Partially Implemented**</span> (Backend Active, Frontend UI Basic) | All Users (Safety) |
| **9** | **AI Face / Selfie Verification** | Verification Screen | Live selfie compared against photos to award a "Real Person" blue checkmark | <span style="color:red">**❌ Not Implemented / Retired**</span> (Replaced by SMS & College Email OTP) | None (Stubbed only) |
| **10** | **AI Photo Quality & NSFW Scanner** | Photo Upload Flow | Auto-detecting explicit nudity, blurry photos, or celebrity pictures | <span style="color:red">**❌ Not Implemented**</span> (Future Possibility) | Planned / Future |
| **11** | **AI Voice Note Transcription** | Chat Voice Notes | Transcribing audio clips to readable text in noisy/quiet places | <span style="color:red">**❌ Not Implemented**</span> (Future Possibility) | Planned / Future |
| **12** | **Conversational AI Matchmaker** | Inbox / Discovery | Chatbot concierge that asks what you are looking for tonight and finds matches | <span style="color:red">**❌ Not Implemented**</span> (Future Possibility) | Planned / Future |

---

## 3. Deep-Dive: Features That Are Fully Implemented & Live Today

These 6 features have complete frontend user interfaces, smooth micro-interactions, full backend API connections, and real-time Google Gemini AI integration.

---

### Feature 1: AI Icebreakers ("Try starting with...")
- **Screen Location:** Inside any 1:1 chat when no messages have been sent yet (`app/chat/[id].tsx` via `AiIcebreakers.tsx`).
- **The Problem It Solves:** Opening messages like "hey" get ignored 80% of the time, while thinking of a witty opening line takes too much mental effort.
- **What the User Sees:**
  - Above the chat composer, a clean section appears: *"Try starting with..."*
  - Three distinct, clickable bubble chips appear (e.g., *"Saw you love bouldering! Do you climb indoors or outdoors?"*, *"Your dog is adorable! What breed is it?"*).
- **How It Works:**
  - The app takes the match's name, bio, interests, looking-for intentions, and fantasy tags.
  - Google Gemini AI generates 3 warm, authentic, polite conversation starters under 120 characters.
  - Tapping a chip **copies the text directly into the input bar**. The user can edit the words or press send. It never auto-sends.
- **Fail-Safe Fallback:** If the network is slow or Gemini is unavailable, the app seamlessly provides friendly pre-written fallback questions so the user never sees a broken screen.

---

### Feature 2: AI Reply Suggestions ("Smart Quick Replies")
- **Screen Location:** Above the chat input composer during active messaging (`src/components/chat/ChatComposer.tsx` via `ReplySuggestions.tsx`).
- **The Problem It Solves:** Keeps conversations flowing smoothly when users are busy, on the move, or unsure how to react.
- **What the User Sees:**
  - When the other person sends a message, a subtle horizontal bar of 3 chips slides in above the keyboard (e.g., *"Sounds like a plan!"*, *"Tell me more about that"*, *"I'd love to join"*).
  - An "X" icon allows the user to dismiss the suggestions at any time.
- **How It Works:**
  - The system analyzes the last 5 messages in the thread to understand the context and tone.
  - Gemini generates 3 quick responses under 100 characters matching the mood of the conversation.
  - Tapping a chip fills the text composer and focuses the cursor, allowing the user to tweak before sending.

---

### Feature 3: AI Compatibility Score & Chemistry Breakdown
- **Screen Location:** Public profile screen under the "COMPATIBILITY" header (`app/profile/[id].tsx`).
- **The Problem It Solves:** Traditional dating apps only show distance and age. Users have to read through walls of text to guess if they have anything in common.
- **What the User Sees:**
  - **For Platinum Users:** A gold percentage badge (e.g., `85%`) alongside 2–3 green checkmark bullet points explaining their chemistry (e.g., *"Both looking for long-term relationships"*, *"Shared passion for electronic music and fitness"*).
  - **For Free / Gold Users:** A sleek locked card displaying *"See your compatibility — Unlock with Platinum"*. Tapping opens the subscription upgrade screen.
- **How It Works:**
  - Uses a deterministic matching algorithm to calculate hard overlap on relationship status, dating intentions, and shared lifestyle tribes (0 to 100%).
  - Passes the profiles to Gemini AI to generate natural, encouraging 2-3 bullet point explanations of why the two people connect.

---

### Feature 4: AI Daily Top 10 Today
- **Screen Location:** Top of the primary Browse Grid (`app/(tabs)/index.tsx` via `Top10Tile`).
- **The Problem It Solves:** Infinite scrolling through hundreds of grid tiles causes decision fatigue. Users want curated recommendations.
- **What the User Sees:**
  - A prominent carousel header: *"✨ AI Top 10 Today — People we think you may connect with"*.
  - A horizontal row of curated profile cards, each featuring their photo, name, age, verified badge, their **compatibility score badge**, and a 1-line AI summary (e.g., *"Both love hiking & live music"*).
  - Free users see a locked teaser card inviting them to upgrade to Platinum.
- **How It Works:**
  - The server queries 50 active users nearby, calculates chemistry scores against the viewer's preferences, ranks the top 10, and generates concise connection tags.
  - The result is cached for **24 hours in Redis** so it loads instantly every time the app opens without lag or unnecessary AI costs.

---

### Feature 5: AI Profile Optimizer & Dating Coach
- **Screen Location:** Top of the Edit Profile screen (`app/settings/edit-profile.tsx` via `ProfileOptimizerSheet.tsx`).
- **The Problem It Solves:** Most people don't know why they aren't getting matches. Their bio might be empty, their prompts might be cliché, or their photo count too low.
- **What the User Sees:**
  - At the top of Edit Profile, a prominent banner reads: *"✨ Improve Your Profile — Get an AI profile score and suggestions"*.
  - Tapping opens a bottom sheet that displays:
    1. **Profile Score:** A big rating out of 100 (e.g. `72/100`).
    2. **Actionable Suggestions:** Specific improvement cards organized by section (e.g., *BIO: "Add 2 specific hobbies so matches have something easy to ask about"*; *PROMPTS: "Fill out a prompt to showcase your sense of humor"*).
    3. **Refresh Button:** To re-score after making edits.
  - If the user is on the Free tier, it displays an upgrade card to Platinum.
- **How It Works:**
  - Feeds the user's current profile completeness, photo count, bio text, and prompt answers to Gemini AI acting as a dating profile consultant.

---

### Feature 6: In-Chat Message Translation ("Chat Translate")
- **Screen Location:** Chat screen message context menu (`app/chat/[id].tsx`).
- **The Problem It Solves:** In multicultural cities or when using Travel Mode, users often match with people who speak different languages.
- **What the User Sees:**
  - Long-pressing any received message opens the action menu.
  - Tapping **"Translate"** displays the translated English text directly beneath the original message bubble with subtle italicized styling.
  - Tapping again toggles the translation off.
- **How It Works:**
  - Powered by Gemini 2.5 Flash on the backend, detecting the source language and translating it faithfully while preserving emojis and slang.
  - Gated to paid subscription tiers (Gold / Platinum).

---

### Feature 7: AI Privacy & Consent Controls (Opt-In Architecture)
- **Screen Location:** Main Settings menu (`app/settings/index.tsx` under `"AI FEATURES (PLATINUM+)"`).
- **What the User Sees:**
  - Five distinct toggle switches:
    - `AI Icebreakers` [ON/OFF]
    - `AI Reply Suggestions` [ON/OFF]
    - `AI Compatibility Score` [ON/OFF]
    - `AI Daily Top 10` [ON/OFF]
    - `AI Profile Optimizer` [ON/OFF]
- **Why It Matters:** Gives privacy-conscious users 100% control over whether their profile data is processed by AI. If a user turns off an AI feature, the app respects it immediately.

---

## 4. Features That Are Partially Implemented (Need Polish)

### Feature 8: AI Toxic & Offensive Text Moderation
- **Where It Is:** Backend messaging pipeline (`chat.service.ts` & `rooms.service.ts`); frontend toggle in `Settings → Safety`.
- **What is Working:**
  - The backend runs outgoing messages through Gemini AI text classification to catch harassment, hate speech, explicit solicitation, threats, and spam.
  - A fast rule-based blocklist acts as a secondary layer if the AI takes too long.
  - Offending messages are blocked from delivery and logged into a moderation table for safety audits.
- **What is Incomplete on the Frontend:**
  - When a message is blocked, the frontend displays a generic error toast (*"Could not send message"*) rather than a clear, respectful user warning explaining that the message violated community guidelines.
  - The Settings toggle *"Block offensive language"* exists, but it currently controls whether incoming messages from other users are filtered, rather than showing a full safety center UI.

---

## 5. Features In Product Specs That Are NOT Implemented / Retired

### Feature 9: AI Face & Video Selfie Verification
- **Initial Plan:** In the original specifications, users were supposed to take a live selfie or head-turn video. AI facial recognition (such as AWS Rekognition or FaceTec) would verify that the live face matched the profile pictures to award a blue verified badge.
- **Current State:** **RETIRED & REMOVED FROM FRONTEND**.
  - The backend code contains a stub (`backend/src/adapters/aiVerification.ts`) that was never connected to a live vision AI vendor.
  - Because of this, the frontend team explicitly removed face verification from the flow (`// Face verification was removed`).
  - Verification is now handled purely through **SMS phone verification** and **College (.edu) email OTP**, not AI vision.

### Feature 10: AI Photo Content & NSFW Moderation
- **Initial Plan:** Computer vision AI scanning uploaded photos for explicit nudity, fake celebrity photos, or copyrighted material before making them visible on the grid.
- **Current State:** **NOT IMPLEMENTED**.
  - Photos uploaded to Cloudflare R2 are stored directly without automated image analysis. Reports of inappropriate photos rely entirely on manual user reporting.

### Feature 11: AI Voice Note Transcription (Audio-to-Text)
- **Possibility:** Transcribing voice clips in chat into readable text.
- **Current State:** **NOT IMPLEMENTED**.
  - Audio messages are recorded and played back as raw audio files. No speech-to-text AI exists in the client or server.

### Feature 12: AI Matchmaker Concierge Bot
- **Possibility:** An interactive AI assistant in the inbox that asks what the user wants to do tonight and suggests nearby matches or group rooms.
- **Current State:** **NOT IMPLEMENTED**.

---

## 6. How AI Drives Business & Revenue (Monetization Strategy)

In NearMe, AI is the **primary selling proposition for the Platinum tier** (the highest recurring subscription plan):

```
┌─────────────────────────────────────────────────────────────┐
│                       SUBSCRIPTION TIERS                    │
├──────────────┬──────────────┬──────────────┬────────────────┤
│     FREE     │   PREMIUM    │     GOLD     │    PLATINUM    │
├──────────────┼──────────────┼──────────────┼────────────────┤
│ Basic Grid   │ Unlimited DMs│ Travel Mode  │ ✨ All AI Tools│
│ 25km Radius  │ Read Receipts│ Who Viewed Me│ AI Icebreakers │
│ Standard Chat│ Disappearing │ Chat Trans-  │ AI Top 10 Daily│
│              │   Messages   │   lation     │ AI Optimizer   │
│              │ Extended Rad.│ Unsend DMs   │ AI Chemistry % │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

- When a Free or Gold user views a profile, the **AI Compatibility Card** shows a gold lock icon, directly driving upgrades to Platinum.
- When an empty chat opens, AI icebreakers give Platinum users an unfair advantage in starting great conversations.
- At the top of the Browse grid, the **AI Daily Top 10** carousel gives Platinum members a daily reason to open and re-engage with the app.

---

## 7. Recommended Next Steps for the Product Team

1. **Keep the Current 5 Core Features**: The existing 5 Gemini features (Icebreakers, Reply Suggestions, Compatibility, Daily Top 10, Profile Optimizer) are fully built, beautifully designed, and working. Ensure your backend has a valid `GEMINI_API_KEY` set in its `.env` file so they run live.
2. **Improve Moderation Error Handling on Frontend**: Update the chat screen so that when a message is flagged by AI moderation, the user sees a helpful prompt (*"Message flagged: Please adhere to respectful communication guidelines"*) instead of a silent send failure.
3. **Decide on Photo Verification**: If the team wants true biometric verification, integrate a third-party KYC/Vision provider (e.g., FaceTec, AWS Rekognition, or SumSub). Otherwise, continue marketing the badge as Phone & College Verified.
4. **Add Voice-to-Text as a Future Perk**: Adding transcription for voice notes using Gemini 2.5 Flash Audio would be a low-cost, high-value addition for Platinum users.

---
*Report generated from complete code audit of `frontend/` and `backend/` repositories.*
