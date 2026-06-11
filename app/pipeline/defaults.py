"""Default prompts and examples copied from the workbook template.

These are intentionally plain Python constants so the deployed app has a
stable baseline even when no workbook is uploaded.
"""
from __future__ import annotations

CLEANING_EXAMPLES = [
    {
        "before": "How To Grow Your YouTube Channel Using vidIQ in 2026 (Full-Guide)",
        "after": "How To Grow Your YouTube Channel Using vidIQ",
        "notes": "year+parenthetical",
    },
    {
        "before": "How to use vidIQ to Grow Your Small Channel",
        "after": "How to use vidIQ to Grow Your Small Channel",
        "notes": "no change",
    },
    {
        "before": "How To Use VidIQ To SKYROCKET Your Views on YouTube in 2025 (VidIQ Tutorial For Beginners)",
        "after": "How To Use VidIQ To SKYROCKET Your Views on YouTube",
        "notes": "year+trailing tagline",
    },
    {
        "before": "কিভাবে vidIQ দিয়ে ইউটিউব ভিডিও SEO করবেন? YouTube SEO: How to Rank YouTube Videos With vidIQ",
        "after": "How to Rank YouTube Videos With VidIQ",
        "notes": "drop non-English prefix",
    },
    {
        "before": "How To Add VidIQ Extension To YouTube (2025) Full Guide",
        "after": "How To Add VidIQ Extension To YouTube",
        "notes": "year+suffix",
    },
    {
        "before": "How to get vidiq boost for free",
        "after": "How to get vidiq boost",
        "notes": "drop 'for free'",
    },
    {
        "before": "vidIQ Tutorial For Beginners (2026) - How To Use vidIQ To Grow Your Channel",
        "after": "How To Use vidIQ To Grow Your Channel",
        "notes": "promote secondary after dash",
    },
    {
        "before": "VIDIQ Extension For Mobile | How To install VIDIQ Extension On Android 2022 | How To Use vidiQ",
        "after": "How To install VIDIQ Extension On Android",
        "notes": "cut at pipe + year",
    },
    {
        "before": "How to Get vidIQ for Free",
        "after": "How to Get vidIQ",
        "notes": "drop 'for free'",
    },
    {
        "before": "What is the vidIQ SEO Score? (and how to get more views)",
        "after": "What is the vidIQ SEO Score",
        "notes": "drop parenthetical continuation",
    },
    {
        "before": "VIDIQ TUTORIAL FOR BEGINNERS 🚀 | How to use VidIQ for your YouTube videos",
        "after": "How to use VidIQ for your YouTube videos",
        "notes": "emoji+cut at pipe",
    },
    {
        "before": "How to Get The Pro Version VIDIQ FOR FREE 2025 (100% Legal Method )",
        "after": "How to Get The Pro Version VIDIQ",
        "notes": "drop year+parenthetical+'FOR FREE'",
    },
    {
        "before": "How To Get VidIQ Pro Free | VidIQ Boost free 2024 | VidIQ Premium free  (2025 Updated Way)",
        "after": "How To Get VidIQ Pro",
        "notes": "cut at pipe+drop 'Free'",
    },
    {
        "before": "How To Connect YouTube Channel To VidIQ- Quick Guide",
        "after": "How To Connect YouTube Channel To VidIQ",
        "notes": "drop 'Quick Guide'",
    },
    {
        "before": "How to get VidIQ SEO Score 100%",
        "after": "How to get VidIQ SEO Score 100%",
        "notes": "no change",
    },
    {
        "before": "VidIQ Tutorial 2026: How To Use VidIQ For Your YouTube Videos (Get More Views)",
        "after": "How To Use VidIQ For Your YouTube Videos",
        "notes": "promote post-colon + drop parenthetical",
    },
    {
        "before": "How To Get VidiQ Pro for Free 2022 [Live Proof]",
        "after": "How To Get VidiQ Pro",
        "notes": "drop 'for Free'+year+bracket",
    },
    {
        "before": "Microsoft Teams - How to Schedule a Meeting",
        "after": "How to Schedule a Meeting in Microsoft Teams",
        "notes": "restructure 'X - How to Y' -> 'How to Y in X'",
    },
    {
        "before": "How to add custom backgrounds into Microsoft Teams video calls",
        "after": "How to add custom backgrounds into Microsoft Teams video calls",
        "notes": "no change",
    },
    {
        "before": "How To Use Microsoft Teams - Step By Step Tutorial 2024",
        "after": "How To Use Microsoft Teams",
        "notes": "drop 'Step By Step Tutorial'+year",
    },
]

POLICY_EXAMPLES = [
    {
        "title": "How to Schedule a Meeting in Microsoft Teams",
        "status": "SAFE",
        "decision": "DO",
        "reason": "",
    },
    {
        "title": "How to Record a Teams Meeting on Mac",
        "status": "SAFE",
        "decision": "DO",
        "reason": "",
    },
    {
        "title": "What's New in Microsoft Teams 2025",
        "status": "SAFE",
        "decision": "DO",
        "reason": "",
    },
    {
        "title": "How To Use VidIQ To SKYROCKET Your Views on YouTube",
        "status": "RISKY",
        "decision": "REWRITE",
        "reason": "Sensational verb 'SKYROCKET' suggests guaranteed outcome; likely to trigger algorithmic suppression.",
    },
    {
        "title": "How to Get 10K Subscribers in 24 Hours",
        "status": "RISKY",
        "decision": "REWRITE",
        "reason": "Implied guarantee + unrealistic timeline; not applicable to every user.",
    },
    {
        "title": "Best Free Microsoft Teams Hack 2025",
        "status": "RISKY",
        "decision": "REWRITE",
        "reason": "Word 'Hack' is ambiguous and risks manual review.",
    },
    {
        "title": "How To Get VidIQ Pro For Free (Crack Version)",
        "status": "PROHIBITED",
        "decision": "AVOID",
        "reason": "Core intent is piracy / paywall circumvention.",
    },
    {
        "title": "How to Bypass YouTube Strikes",
        "status": "PROHIBITED",
        "decision": "AVOID",
        "reason": "Bypassing safeguards / enforcement systems.",
    },
    {
        "title": "How to Get Verified on YouTube Without Subscribers (Trick)",
        "status": "PROHIBITED",
        "decision": "AVOID",
        "reason": "Bypassing verification requirements.",
    },
]

POLICY_PROMPT = """You are my private YouTube Title Policy Auditor and Trust & Safety Reviewer.

Your primary responsibility is to protect my YouTube channel from:
- Copyright strikes
- Community Guideline violations
- Manual reviews and audits
- Algorithmic suppression
- Demonetization
- Channel termination risk

Channel safety ALWAYS takes priority over growth, CTR, or content volume.

You think like:
- YouTube automated enforcement systems
- YouTube manual reviewers
- Trust & Safety escalation teams

You do NOT think like a content creator.

TASK:
Review YouTube video titles I provide and decide whether each title is worth creating a video on, from a policy and compliance perspective.

You are NOT allowed to rewrite titles.

FOR EACH TITLE, YOU MUST:
1. Analyze the CORE INTENT of the title (not just wording).
2. Classify it as exactly ONE of the following:
   - SAFE
   - RISKY
   - PROHIBITED
3. Assign a final decision:
   - SAFE -> DO
   - RISKY -> REWRITE
   - PROHIBITED -> AVOID

STRICT DEFINITIONS:

SAFE:
- Educational and neutral
- Realistic outcomes (no guarantees)
- No authority or insider claims
- No copyright or policy risk
- Suitable for long-term, monetized channels

RISKY:
- Legitimate topic but risky wording or implied guarantees
- Clickbait or exaggerated phrasing
- Likely to trigger manual review or suppression
- Topic may be usable only after rewriting (but you must NOT rewrite it)

PROHIBITED:
- Core intent involves piracy, downloading paid content, or copyright circumvention
- Bypassing safeguards, verification, bans, strikes, or paywalls
- Hacking, cracking, exploits, or abuse of systems
- Impersonating YouTube, Google, or official support
- Guaranteed, instant, or permanent outcomes
- Unsafe intent that cannot be fixed by rewriting

IMPORTANT:
If the CORE INTENT itself is unsafe, the title MUST be PROHIBITED.
Do NOT attempt to sanitize or reframe PROHIBITED titles.

MANDATORY REALITY CHECK:
Before marking any title as SAFE, ask:
"Would this realistically apply to EVERY user, on EVERY account, right now?"

If NO -> it cannot be SAFE.

OUTPUT (JSON, one object per title):
{
  "original_title": "...",
  "status": "SAFE" | "RISKY" | "PROHIBITED",
  "decision": "DO" | "REWRITE" | "AVOID",
  "reason": "..."
}

Rules:
- NEVER rewrite titles.
- NEVER provide suggestions or alternatives.
- If decision = DO, reason MUST be blank.
- Use Policy_Examples as ground truth.

FINAL RULE:
If there is ANY doubt, choose the MORE CONSERVATIVE classification.
Protecting the channel is more important than content volume or speed."""

CLEANING_INSTRUCTIONS = """Clean each YouTube title using the Before -> After examples as ground truth.

Rules:
- Keep the useful searchable title.
- Remove years when they are just freshness markers, such as 2024, 2025, 2026.
- Remove low-value suffixes like full guide, quick guide, tutorial for beginners, updated way, and similar trailing taglines.
- Remove emoji, brackets, parenthetical promotional claims, and non-English prefixes when the English title is present.
- For titles like "Product - How to X", rewrite to "How to X in Product" when natural.
- Do not invent a different topic.
- Return the cleaned title and an exact list of removed words/phrases.
"""
