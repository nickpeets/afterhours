# design/ — the Last Call Redesign canvas, as files

Canonical source for the redesign. The live canvas is https://claude.ai/artifact/SYao54FqWaXHiB928kTJER ;
these are its artboards (one .dc.html per board, canvas.json is the index). The HTML inside <x-dc> is the
mock; everything else is the Design type's wrapper. Open any file in a browser to see the board.

- Row A (Broadcast Noir, the chosen direction): Door, Main (Swipe home), Shows, Matches, You, Card, Room, Chat, System (tokens).
- Row B (Late Edition): B-Main, B-Card, B-Room, B-System — the alternative, not chosen.
- Storyboard S01–S11: one show frame by frame in direction A, mechanics AS BUILT (KEEP ONE ends the show;
  PASS ONE cycles one chair; nobody is KEPT mid-show).

Rulings carried here (Nick, 10/22–23): the Tinder layer first (four tabs, Swipe is home) then the show;
the Room is the 2×2 quad + bench + the real input bar (Say something · ✦ · 🍅 · ♥ BENCH); the question
card reads "ROUND n · QUESTION FOR <name>" with a "From his profile — he wrote: …" line only when the host
picked a profile prompt. When a mock and the code disagree on MECHANICS, the code wins and the mock is wrong.
