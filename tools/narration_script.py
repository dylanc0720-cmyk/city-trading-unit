"""Narrator lines for the City Trading Unit: a jolly, old-money tycoon. Short and punchy.

Rule for anything spoken while an auction is running: never say a number other
than the current top bid, so the speech listener can't mistake the narrator for
a bidder.
"""

# Keys ending in _<n> are variants of one moment; the app picks one at random.
LINES = {
    # ---- New game ----
    "intro_1": "Good evening, tycoons!",
    "intro_2": "Welcome, welcome! The bank is open.",
    "reg_prompt": "Names, please!",
    "reg_ok_1": "Splendid!",
    "reg_ok_2": "Capital!",
    "reg_ok_3": "Welcome aboard!",
    "reg_ok_4": "Jolly good!",
    "reg_retry": "Once more, please!",
    "rollcall": "Tonight's tycoons:",
    "and": "and",
    "start_1": "Let's get rich!",
    "start_2": "Let the deals begin!",
    "start_3": "Ho ho! Let's build!",

    # ---- Build ----
    "spin_1": "Let's see!",
    "spin_2": "Permit, please!",
    "b1_1": "One block.",
    "b1_2": "Just one!",
    "b1_3": "One block. Steady!",
    "b2_1": "Two blocks!",
    "b2_2": "Two! Splendid!",
    "b2_3": "Two blocks. Capital!",
    "b3_1": "Three blocks! Capital!",
    "b3_2": "Ho ho! Three!",
    "b3_3": "Three! Build, build, build!",
    "bS_1": "Station! All aboard!",
    "bS_2": "A station! No blocks.",
    "bS_3": "Choo choo! Station!",

    # ---- Auction ----
    "a_open_1": "Auction! Who'll bid?",
    "a_open_2": "Up for auction!",
    "a_open_3": "Bids, please!",
    "i_have": "I have",
    "bid_is": "Now",
    "from": "from",
    "more_1": "Any more?",
    "more_2": "Do I hear more?",
    "more_3": "Come on!",
    "war_1": "Bidding war!",
    "war_2": "Ho ho! It's heating up!",
    "jump_1": "Whoa!",
    "jump_2": "Big money!",
    "jump_3": "Ho ho!",
    "warn_1": "Five seconds!",
    "warn_2": "Last call!",
    "once": "Going once!",
    "twice": "Going twice!",
    "sold_to": "Sold to",
    "for": "for",
    "sold_for": "Sold for",
    "tail_1": "Capital!",
    "tail_2": "Splendid!",
    "tail_3": "Pay the bank!",
    "tail_4": "Ka-ching!",
    "nobid_1": "No bids? The bank keeps it.",
    "nobid_2": "No takers!",
    "cancel_1": "Withdrawn!",
    "cancel_2": "Never mind!",

    # ---- Secret bids from phones ----
    "sealed_1": "Secret bids, please!",
    "sealed_2": "Bids in your phones!",
    "allin": "All bids are in!",
    "envelope": "The envelope, please...",
    "tie": "A tie! First bid wins.",

    # ---- Turns ----
    "turn_1": "your move!",
    "turn_2": "you're up!",
    "turn_3": "your turn!",

    # ---- Deal timer ----
    "d_open_1": "Let's make a deal!",
    "d_open_2": "Deal time!",
    "d_warn": "Five seconds!",
    "d_done_1": "It's a deal!",
    "d_done_2": "Deal! Splendid!",
    "d_time_1": "Time's up! No deal.",
    "d_time_2": "No deal!",
}

COLOURS = ["Red", "Blue", "Green", "Yellow", "Purple", "Orange"]
for i, c in enumerate(COLOURS):
    LINES[f"col_{i}"] = c
for i, w in enumerate(["one", "two", "three", "four", "five", "six"]):
    LINES[f"pl_{i}"] = f"player {w}"

ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def under100(n):
    if n < 20:
        return ONES[n]
    t, o = divmod(n, 10)
    return TENS[t] + (f"-{ONES[o]}" if o else "")


def auction_words(n):
    """Auction-speak for 10..999: 60 -> sixty, 150 -> one fifty, 200 -> two hundred, 305 -> three oh five."""
    if n < 100:
        return under100(n)
    h, r = divmod(n, 100)
    if r == 0:
        return f"{ONES[h]} hundred"
    if r < 10:
        return f"{ONES[h]} oh {ONES[r]}"
    return f"{ONES[h]} {under100(r)}"


# Amounts in thousands ("K"): 10K..995K in steps of 5K, and whole millions.
for k in range(10, 1000, 5):
    LINES[f"amt_{k}"] = f"{auction_words(k)} K"
for m in range(1, 10):
    LINES[f"mil_{m}"] = f"{ONES[m]} million"
