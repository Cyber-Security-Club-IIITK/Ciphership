# Ciphership
A fun and cryptic variant of the famous game Battleship

Two teams pick a cipher (a permutation of `abcde`), place 10 ships on a 5x5
board, then play simultaneous rounds: each round both teams submit one attack
and one defense coordinate. Moves are published to a public feed encrypted with
each team's own cipher — cracking your opponent's cipher from the feed is part
of the game.

# How to play
- Exact commands may vary for you
- ```git clone``` this repository.
- Run the game with ```flask run --host=0.0.0.0``` (deps: flask, numpy — on
  NixOS just ```nix-shell``` with the included ```shell.nix```).
- Open the ```IP:Port``` provided in your browser.

# Running a tournament
- Open `/` — the **organizer desk**. It is locked: paste the admin password once
  per browser tab to unlock create/close/list operations.
- The password comes from the `CIPHERSHIP_ADMIN_PASSWORD` environment variable.
  If the server has no password set, admin endpoints fail closed (`503`) while
  team play keeps working — so a misconfigured deploy is never an open desk.
- On the production box the password lives in `/etc/ciphership/ciphership.env`
  (root-only, loaded by systemd via EnvironmentFile).
- Any number of matches run in parallel — each has its own boards and feed.
- A match is capped at 20 rounds — if nobody's fleet is eliminated by then,
  the higher score (ships destroyed) wins.
- Every finished match is appended to ```tournament_results.jsonl```.
- Close finished matches from the desk (or wipe everything with
  ```curl -X POST -H "Authorization: Bearer $PASSWORD" http://<host>:<port>/reset```).

# Interface
- No CSS framework: the dark "cyber operations" look is one hand-written
  stylesheet (`static/style.css`) ported from a Google Stitch design pass,
  with Space Grotesk / JetBrains Mono via Google Fonts and full system
  fallbacks if the venue network is captive.
- Win / lose / draw / wait-start pages are intentionally full-bleed GIFs
  with zero text — they load instantly and need no state of their own.
- `STITCH_SPEC.md` documents the exact UI contract (verbatim copy, routes,
  game states) the design was built against.
