#!/usr/bin/env python3
"""
Morning Trends Brief for @launcodes
Runs every morning, pulls trending dev/AI/coding topics,
delivers content angle suggestions for the claudemaxxing angle.

Sources:
- KooSocial API (Twitter trending data)
- HackerNews top stories (fallback + supplement)
"""

import urllib.request
import json
import os
from datetime import datetime

# ─── CONFIG ────────────────────────────────────────────────────────────────────
KOO_API_KEY = "ks_4f504de0b636ac8f442c4bc0ab35e6763f72f16a22451abb88bebae4714fc29d"
KOO_BASE_URL = "https://api.koosocial.com"

# Keywords relevant to @launcodes (claudemaxxing angle)
RELEVANT_KEYWORDS = [
    "claude", "claude code", "cursor", "ai coding", "vibe coding",
    "llm", "gpt", "gemini", "openai", "anthropic", "copilot",
    "react", "nextjs", "typescript", "python", "rust",
    "indie hacker", "build in public", "saas", "startup",
    "ship", "launch", "dev tools", "api", "open source",
    "github", "programming", "software", "coding", "developer",
]

# ─── KOO SOCIAL TRENDING ────────────────────────────────────────────────────────
def get_koo_trending():
    """Search KooSocial for what's being talked about in dev/AI/coding Twitter right now."""
    queries = [
        "claude code OR vibe coding OR claudemaxxing",
        "AI coding OR cursor OR copilot",
        "indie hacker OR build in public OR shipped",
    ]
    tweets = []
    for query in queries:
        try:
            encoded = urllib.request.quote(query)
            url = f"{KOO_BASE_URL}/api/v1/search?query={encoded}&count=10&type=Latest"
            req = urllib.request.Request(url, headers={"x-api-key": KOO_API_KEY})
            with urllib.request.urlopen(req, timeout=10) as r:
                data = json.loads(r.read())
            instructions = data.get("result", {}).get("timeline", {}).get("instructions", [])
            entries = []
            for instr in instructions:
                entries += instr.get("entries", [])
            for entry in entries:
                content = entry.get("content", {})
                item_content = content.get("itemContent", {})
                if item_content.get("itemType") == "TimelineTweet":
                    tweet_res = item_content.get("tweet_results", {}).get("result", {})
                    legacy = tweet_res.get("legacy", {})
                    user = tweet_res.get("core", {}).get("user_results", {}).get("result", {}).get("legacy", {})
                    text = legacy.get("full_text", "")
                    if text and not text.startswith("RT @"):
                        tweets.append({
                            "handle": user.get("screen_name", "?"),
                            "followers": user.get("followers_count", 0),
                            "text": text[:200],
                            "likes": legacy.get("favorite_count", 0),
                            "retweets": legacy.get("retweet_count", 0),
                        })
        except Exception as e:
            print(f"[KooSocial error — {query[:30]}] {e}")
    # Sort by likes + retweets
    tweets.sort(key=lambda x: x["likes"] + x["retweets"] * 2, reverse=True)
    return tweets[:10]


# ─── HACKERNEWS TOP STORIES ─────────────────────────────────────────────────────
def get_hn_top_stories(limit=20):
    """Get HackerNews top story titles — free, no auth needed."""
    try:
        with urllib.request.urlopen(
            "https://hacker-news.firebaseio.com/v0/topstories.json", timeout=8
        ) as r:
            ids = json.loads(r.read())[:limit]

        titles = []
        for story_id in ids:
            try:
                with urllib.request.urlopen(
                    f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json",
                    timeout=5,
                ) as r:
                    item = json.loads(r.read())
                    title = item.get("title", "")
                    score = item.get("score", 0)
                    if title:
                        titles.append({"title": title, "score": score, "id": story_id})
            except:
                continue
        return sorted(titles, key=lambda x: x["score"], reverse=True)
    except Exception as e:
        print(f"[HN error] {e}")
        return []


# ─── RELEVANCE FILTER ───────────────────────────────────────────────────────────
def is_relevant(text):
    text_lower = text.lower()
    return any(kw in text_lower for kw in RELEVANT_KEYWORDS)


def score_relevance(text):
    text_lower = text.lower()
    return sum(1 for kw in RELEVANT_KEYWORDS if kw in text_lower)


# ─── CONTENT ANGLE GENERATOR ────────────────────────────────────────────────────
def generate_angles(topic):
    """Generate 2-3 post angle suggestions for a trending topic."""
    angles = [
        f"Take: What does '{topic}' mean if you're claudemaxxing? Your angle as a builder who actually uses Claude Code.",
        f"Build log angle: Have you built something related to '{topic}'? Share the prompt + result.",
        f"Hot take: A contrarian opinion on '{topic}' that dev Twitter will argue about.",
    ]
    return angles


# ─── MAIN BRIEF ─────────────────────────────────────────────────────────────────
def generate_brief():
    now = datetime.now().strftime("%A, %B %d %Y — %I:%M %p IST")
    print(f"\n{'='*60}")
    print(f"🌅 MORNING BRIEF FOR @launcodes")
    print(f"{'='*60}")
    print(f"📅 {now}\n")

    # ── KooSocial Trends ──
    print("📊 TRENDING ON TWITTER (via KooSocial)")
    print("-" * 40)
    koo_trends = get_koo_trending()

    if koo_trends:
        for t in koo_trends[:5]:
            engagement = t["likes"] + t["retweets"] * 2
            print(f"  @{t['handle']} ({t['followers']:,} followers | ❤️ {t['likes']} 🔁 {t['retweets']})")
            print(f"  \"{t['text'][:100]}...\"")
            print()
    else:
        print("  [No results from KooSocial this run]")

    # ── HackerNews ──
    print("\n🔥 HACKERNEWS TOP STORIES (dev signal)")
    print("-" * 40)
    hn_stories = get_hn_top_stories(limit=30)
    relevant_hn = [s for s in hn_stories if is_relevant(s["title"])]
    relevant_hn.sort(key=lambda x: score_relevance(x["title"]), reverse=True)

    if relevant_hn:
        for s in relevant_hn[:6]:
            print(f"  • [{s['score']} pts] {s['title']}")
            print(f"    https://news.ycombinator.com/item?id={s['id']}")
    else:
        print("  Nothing highly relevant today on HN.")

    # ── Post Angles ──
    print("\n✍️  TODAY'S POST ANGLES FOR @launcodes")
    print("-" * 40)

    # Combine KooSocial tweets + HN into angles
    all_topics = []
    if koo_trends:
        for t in koo_trends[:3]:
            all_topics.append(t["text"][:60] if isinstance(t, dict) else str(t)[:60])
    if relevant_hn:
        for s in relevant_hn[:2]:
            all_topics.append(s["title"][:60])

    if all_topics:
        for i, topic in enumerate(all_topics[:3], 1):
            print(f"\n🎯 Topic {i}: {topic}")
            angles = generate_angles(topic)
            for angle in angles[:2]:
                print(f"   → {angle}")
    else:
        print("  No strong trend matches today — good day for an original take or build log.")

    print(f"\n{'='*60}")
    print("💡 Remember: Post within 2 hours of a trend hitting for max reach.")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    generate_brief()
