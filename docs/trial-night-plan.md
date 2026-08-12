# LAST CALL — the trial night, designed as a measurement

**The point.** Anomalies **#1 (host roster split)**, **#2 (evaporating bench)**
and **#11 (count flapping)** have survived every rig we have for one reason:
they only exist as *disagreements between clients at the same instant*. An agent
drives windows one at a time; it can read five states, but never five states at
the same moment. **Five humans holding five phones is the first instrument that
can take that reading** — and it only works if the reading is planned before the
night, not remembered afterwards.

The whole method is one sentence: **the host says a word out loud, and everyone
screenshots.** That's it. Everything below is detail on when and who.

---

## The instrument: the SNAP

Nick, as host, says **"SNAP"** out loud. Everyone takes one screenshot of
whatever is on their screen — no cropping, no tidying, no waiting for it to look
right. **A screenshot of a wrong-looking screen is the finding.** Then back to
the show.

That's the entire ask of a guest: *hear the word, press the buttons, carry on.*
Five SNAPs across a whole night. Nobody logs anything, nobody narrates, nobody is
asked to notice or remember. The phone's own timestamp does the alignment work,
which is why a screenshot beats any running log a person could keep.

**Say it once at the top of the night, in show language:** *"Every so often I'll
say SNAP — screenshot whatever you're looking at, don't fix it, that's the whole
job."* Said like a game rule rather than an instruction and it will not feel like
a lab.

---

## The five SNAPs, and what each one scores

| # | Called at | Why there | Scores |
|---|---|---|---|
| 1 | ~20s after **GO LIVE**, everyone in the room, before any chairs fill | The roster is at its simplest and every client should agree exactly | **#1**, **#11** |
| 2 | Right after **curtain-up**, chairs filled, bench holding at least one man | The single most contested state in the app — chairs, bench and counts derived three different ways | **#1**, **#2**, **#11** |
| 3 | **T+0 / T+45 / T+95** of the lock test (below) — three SNAPs, everyone but the locked phone | The 60s freshness window falls between the second and the third | **Q60**, **#2** |
| 4 | Immediately after the **first keep/pass** resolves | Roster churn is the moment a split is most likely to open | **#1**, **#2** |
| 5 | On the **winner card**, before backstage | The end state everyone should agree on, and the photo check live | winner path, **#11** |

**Nick additionally**, and only Nick: at SNAP 2 and SNAP 4, glance at the
headcount and say the number out loud before moving on. It costs three seconds
and it gives the count-flapping anomaly a second, independent witness that isn't
a pixel.

### The lock test (SNAP 3), the only scripted bit

One guest — ask the most relaxed person, and ask them at the start so it isn't a
surprise — presses the side button and lets the phone go dark for **ninety
seconds**, then wakes it. Everyone else SNAPs at the call, again around 45s, and
again just after he's back.

- What it proves: whether a man whose phone locks **vanishes from four other
  screens** while he's still sitting there, and whether he **comes back cleanly**.
- Why 90s: `activeRows()` drops a member 60 seconds after their last beat, and
  the beat is 8s. Ninety seconds crosses the window with room to spare.
- The locked guest does nothing but unlock. His own screen at wake-up is the
  fifth reading, and it's the one that says whether *he* could tell he'd been
  gone.

---

## Afterwards, in five minutes

Everyone AirDrops or texts **their whole SNAP set** to Nick, unedited, and that's
the night's data. No forms, no debrief, no questions about how it felt — though
if anyone volunteers a "wait, what happened there?", write that sentence down
verbatim, because a stranger's confusion is a finding no gate can produce.

Five people × five moments = twenty-five simultaneous client reads. That is more
multi-client evidence than the whole harness has produced in a week, and it is
exactly the reading that has been impossible until now.

---

## THE COMPARISON — how twenty-five screenshots become DEAD or ALIVE

Screenshots are not the finding. **The disagreement between two of them taken at
the same moment is the finding.** This section is the operational test, written
before the night so that nobody gets to decide afterwards what the pictures meant.

**Line-up rule.** Group by SNAP using each phone's own timestamp. Anything more
than ~10 seconds off the others is not part of that SNAP and is not compared —
it's a person who was slow, and comparing it would manufacture a split that the
app never produced.

**The two-witness rule.** A disagreement needs **two screens at the same SNAP**.
One odd screenshot with no counterpart is not a finding, it's a phone. This is
the rule that stops the night producing five plausible bug reports and no facts.

**Insufficiency rule.** Fewer than four of five screenshots for a SNAP → that
SNAP scores **nothing**. Say so in the write-up rather than reading three.

### Per anomaly

| | Read this | **ALIVE** if | **DEAD** if |
|---|---|---|---|
| **#1 host roster split** | Host's screen vs each guest's, SNAPs 1, 2, 4: the set of occupied chairs and the set of men on the bench | The host's set differs from **any** guest's at the same SNAP — a name she has that nobody else has, or vice versa | All five agree at all three SNAPs. Three clean agreements across the night's most contested states is a real result, not an absence |
| **#2 evaporating bench** | Bench membership on all five screens, SNAPs 2, 3 (×3) and 4 | A man visible on the bench in one screen is **absent from another at the same moment**, and he did not leave between them | Bench membership is identical across every screen at every SNAP where he did not move |
| **#11 count flapping** | The displayed headcount on all five screens, plus Nick's **spoken** number at SNAPs 2 and 4 | Two screens show **different numbers at the same instant** — OR a single screen's number contradicts the roster **on that same screen** (the count confound, reproduced in the wild rather than in the double) | Every screen's number agrees with every other and with what Nick said out loud |
| **Q60, the 60s window** | The locked man's presence on the other four screens at **T+45** (inside the window) vs **T+95** (past it) | He is present at T+45 and **gone from at least one screen at T+95**, then returns after unlock. That is the window doing exactly what it is specified to do — and it means a locked phone empties a chair in front of everyone | He is still present on all four at T+95. Then 60s is survivable on real phones and Q60 closes as a tuning question with an answer |

### The one extra reading, and why it is here

At SNAP 3, also compare **the locked man's position in the queue before and
after**. If he comes back *behind* men who were behind him, that is the
`line_position` re-entry consequence arriving in the wild — measured in the
harness as bench 250 → null → 251, never yet seen happen to a person. It costs
nothing to look and it is the only anomaly on this list that a guest would
experience as *unfairness* rather than as breakage.

### What a clean night means

If every row above reads DEAD, the honest sentence is **"not reproduced with five
clients at five moments"** — not "fixed". These three anomalies have never been
reproduced on demand by anybody; one clean night lowers the estimate, it does not
close the file. Write that sentence into the audit exactly, because the next
session will read whatever is written there as the state of the world.

---

## The rehearsal, before anyone is invited

**Who:** Nick, plus one person who has never seen the app. Not a guest from the
trial night — spend the fresh eyes here, where the finding is still cheap.
**How long:** one sitting, under an hour. Three things, in this order.

### 1. The first sixty seconds
The stranger gets the link and nothing else. Nick watches, says nothing, and
counts the number of times he has to explain something.

- **Proves:** whether the door works for someone who doesn't already know the
  answers — the one thing never once tested.
- **Don't book yet if:** he has to be told anything twice, or he stops at the
  zip/photo step and asks what it's for, or he hits an error string that names
  Nick. (Those two strings are on the fix list already; this is what confirms
  they're the right two.)

### 2. Denied camera, on the host's phone
Nick denies his own camera at GO LIVE and looks at what the room shows.

- **Proves:** there is *some* honest account of the host being dark. The benched
  man's version of this degrades gracefully and gate 12 holds that door; the host
  has no equivalent story and she is the one everyone is looking at.
- **Don't book yet if:** the room shows a black rectangle with no words. A silent
  black tile where the host should be is the single most alarming thing a
  stranger can see, because it reads as *broken*, not as *waiting*.

### 3. The lock, rehearsed once
Same 90-second lock as SNAP 3, with two devices instead of five.

- **Proves:** the shape of the failure before it happens in front of guests, so
  Nick can say the true sentence out loud on the night — either *"he'll pop back
  in a second"* or nothing at all.
- **Don't book yet if:** he doesn't return within about twenty seconds of
  unlocking, or he returns to a different place in the queue than he left. The
  first is a stall; the second is a man losing his turn, which is the kind of
  unfairness a room notices immediately.

---

## The rehearsal debrief — three capture rules, not a form

The rehearsal's findings are worthless if they live in Nick's head.  That is the
same disease as the thirteen anomalies, which existed only in a chat log until
yesterday.  Three rules, each a single artefact, each written **during** the
sitting rather than after:

1. **The stranger's own sentences, verbatim.**  Not a summary of his confusion —
   the words.  "Wait, why does it want my zip?" is evidence; "he was confused by
   the zip step" is an opinion about evidence.  Anything he says out loud while
   nobody is helping him gets written down as spoken, in quotes.  Count how many
   times you *wanted* to explain something and write the number down; the count
   is the result of item (a), not a feeling about it.
2. **One screenshot per named moment, from the phone that saw the problem.**  For
   the denied camera: the room as it looked with the host dark.  For the lock: his
   screen at wake-up and one other person's at the same moment.  Same rule as the
   SNAP — uncropped, taken immediately, especially if it looks wrong.
3. **The verdict sentence for each item, written before you sleep on it.**  Each
   of the three rehearsal items has a don't-book-yet condition above.  Write BOOK
   or DON'T BOOK against each one, plus the single sentence that decided it.
   Three lines total.  If an item is genuinely ambiguous, that is DON'T BOOK, and
   the sentence says why it was ambiguous.

That is the whole debrief: quotes, a handful of screenshots, three verdict lines.
It should take five minutes and it is enough for a session that was not in the
room to pick the work up cold tomorrow.

---

## What this plan deliberately does not do

- **No running logs, no timers, no note-taking.** Anything that needs sustained
  attention will be dropped by the third round, and a half-kept log is worse than
  none because it looks like data.
- **No asking guests to watch for bugs.** People who are told to look for
  problems find problems, and they stop playing the game. The SNAP captures the
  state whether or not anyone noticed anything.
- **No recording of faces or audio.** Screenshots of an app the person is
  already looking at is a different consent conversation from filming strangers
  on a date, and it should stay that way.

**The one thing that would make the night worthless:** cleaning up the
screenshots. If a guest waits for the screen to "look right" before pressing, the
disagreement — the whole measurement — is gone. Say once, early: *"press it
immediately, especially if it looks wrong."*
