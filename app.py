"""Ciphership — a cryptic Battleship variant with concurrent matches.

The organizer creates matches (POST /create-match, or the dashboard at /).
Both teams join a match via /match/<matchId>, pick a cipher (a permutation of
abcde) and place 10 ships on a 5x5 board, then play simultaneous rounds: every
round both teams submit one attack and one defense coordinate. Moves are
published to the match's public feed encrypted with each team's own cipher, so
cracking the opponent's cipher from the feed is part of the game.

Any number of matches can run in parallel — each has its own boards, feed,
state machine and lock, so games never interfere.

Run:            flask run --host=0.0.0.0        (or: python app.py)
Organizer:      open /  — create matches, watch progress, close finished ones
Results:        every finished match is appended to tournament_results.jsonl
"""

import hmac
import json
import os
import re
import threading
from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from flask import Flask, jsonify, render_template, request

from player import Player

# ---------------------------------------------------------------- config ---
BOARD_SIZE = 5
MAX_PLAYER_COUNT = 2
SHIP_COUNT = 10             # must match templates/ship.html
MAX_ROUNDS = 20             # cap: a stalemated match ends, higher score wins
DEFAULT_MATCH_DURATION_MINUTES = 12  # default match duration in minutes
MAX_MESSAGES = 200          # per-match feed capped to most recent entries
MAX_PARALLEL_MATCHES = 1000  # effectively unlimited for practical purposes
RESULTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "tournament_results.jsonl")
TEAM_NAME_RE = re.compile(r"^[A-Za-z0-9 ._-]{1,32}$")

# Organizer password for the admin endpoints (create/close/reset + match
# listing). Set via CIPHERSHIP_ADMIN_PASSWORD; if unset, admin endpoints fail
# closed (503) while player routes keep working.
ADMIN_PASSWORD = os.environ.get("CIPHERSHIP_ADMIN_PASSWORD", "")

app = Flask(__name__)


class State(Enum):
    SELECT_ALGO_STATE = 0
    SELECT_SHIP_STATE = 1
    WAIT_FOR_START = 2
    ATTACK_STATE = 3
    WAIT_FOR_ATTACK = 4
    DEFEND_STATE = 5
    WAIT_FOR_DEFEND = 6
    WIN_STATE = 7   # transient checkpoint: both defends are in, resolve round
    LOSE_STATE = 8
    DRAW_STATE = 9


CELL_STATES = ["water", "ship", "attacked", "defended", "attacking"]


@app.after_request
def no_store_html(response):
    """Always serve fresh HTML — a stale cached desk page mid-tournament
    (old JS hitting auth-gated endpoints silently) is worse than the
    bandwidth cost."""
    if response.mimetype == "text/html":
        response.headers["Cache-Control"] = "no-store"
    return response


# ------------------------------------------------------------------ match ---
class Match:
    """One independent 2-team match: own boards, feed, state machine, lock.

    All field mutations happen while holding self.lock (check the callers).
    """

    def __init__(self, match_id, label="", duration_minutes=None, max_rounds=None):
        self.id = match_id
        self.label = label
        self.lock = threading.Lock()
        self.players = []          # 0..2 Player objects
        self.player_index = {}     # player uuid -> 0 | 1
        self.waiting = 0           # submissions received in the current phase
        self.round_number = 0      # completed rounds
        self.messages = []         # this match's public feed
        self.status = "waiting"    # waiting -> playing -> finished
        # Match configuration
        self.duration_minutes = duration_minutes if duration_minutes is not None else DEFAULT_MATCH_DURATION_MINUTES
        self.max_rounds = max_rounds if max_rounds is not None else MAX_ROUNDS
        # Timer fields (set when match starts)
        self.started_at = None     # datetime when match actually started
        self.ends_at = None        # datetime when match should end

    def has_expired(self):
        """Check if the match duration has expired."""
        if self.ends_at is None:
            return False
        return datetime.now(timezone.utc) >= self.ends_at

    def start_timer(self):
        """Start the match timer. Call with self.lock held."""
        if self.started_at is not None:
            return  # already started
        self.started_at = datetime.now(timezone.utc)
        self.ends_at = datetime.fromtimestamp(
            self.started_at.timestamp() + self.duration_minutes * 60,
            tz=timezone.utc
        )

    def find_player(self, uuid):
        idx = self.player_index.get(uuid)
        return self.players[idx] if idx is not None else None

    def append_message(self, username, text):
        self.messages.append({"username": username, "text": text})
        if len(self.messages) > MAX_MESSAGES:
            del self.messages[:len(self.messages) - MAX_MESSAGES]

    def finish_match(self, result):
        """Set terminal states and record the result. Call with self.lock."""
        states = {"p0": (State.WIN_STATE.value, State.LOSE_STATE.value),
                  "p1": (State.LOSE_STATE.value, State.WIN_STATE.value),
                  "draw": (State.DRAW_STATE.value, State.DRAW_STATE.value)}[result]
        self.players[0].state, self.players[1].state = states
        self.status = "finished"
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "matchId": self.id,
            "label": self.label,
            "teams": [p.team_name for p in self.players],
            "points": [p.points for p in self.players],
            "rounds": self.round_number,
            "result": {"p0": "team0_win", "p1": "team1_win",
                       "draw": "draw"}[result],
        }
        try:
            with open(RESULTS_FILE, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(entry) + "\n")
        except OSError:
            pass  # bookkeeping must never crash the match
        print(f"Match finished: {entry}")

    def check_wait(self):
        """Advance the state machine once both teams submitted the phase.

        Call with self.lock held, right after incrementing self.waiting.
        """
        if self.waiting < MAX_PLAYER_COUNT:
            return
        self.waiting = 0
        
        # Start timer when both players have placed ships and match is about to begin
        if self.started_at is None and self.status == "playing":
            self.start_timer()
            print(f"[{self.id}] Match timer started: {self.duration_minutes} minutes, ends at {self.ends_at.isoformat()}")
        
        self.append_message("Admiral", "Next Move")

        for p in self.players:
            p.state += 1

        # Check for timeout before processing round resolution
        if self.has_expired():
            self._finish_by_timeout()
            return

        # Both states hit the transient resolve checkpoint: the defend phase
        # of a round just completed, so resolve both attacks, start a new
        # round, and check whether the match is over.
        if any(p.state == State.WIN_STATE.value for p in self.players):
            for i in range(MAX_PLAYER_COUNT):
                self.players[i].updatePlayer(
                    self.players[(i + 1) % MAX_PLAYER_COUNT])
                self.players[i].state = State.ATTACK_STATE.value
            for p in self.players:
                p.attack = None
                p.defend = None
            self.round_number += 1
            p0, p1 = self.players
            print(f"[{self.id}] Round {self.round_number} resolved")

            # Check for timeout after round increment
            if self.has_expired():
                self._finish_by_timeout()
                return

            if p0.game_lost and p1.game_lost:
                self.finish_match("draw")
            elif p0.game_lost:
                self.finish_match("p1")
            elif p1.game_lost:
                self.finish_match("p0")
            elif self.round_number >= self.max_rounds:
                # Nobody eliminated: score the match by ships destroyed.
                if p0.points != p1.points:
                    self.finish_match("p0" if p0.points > p1.points else "p1")
                else:
                    self.finish_match("draw")

    def _finish_by_timeout(self):
        """End match due to time expiration. Call with self.lock held."""
        if self.status == "finished":
            return  # already finished, avoid double-finish
        self.status = "finished"
        p0, p1 = self.players
        if p0.points != p1.points:
            winner = "p0" if p0.points > p1.points else "p1"
        else:
            winner = "draw"
        self.finish_match(winner)


# --------------------------------------------------------------- registry ---
# MATCHES / PLAYER_MATCH are only ever mutated while holding registry_lock.
# Lock ordering is always registry_lock -> match.lock, never the reverse.
MATCHES = {}       # match_id -> Match
PLAYER_MATCH = {}  # player uuid -> match_id
registry_lock = threading.Lock()


def resolve_match(uuid):
    """Return the Match a player UUID belongs to, or None."""
    if not isinstance(uuid, str):
        return None
    with registry_lock:
        match_id = PLAYER_MATCH.get(uuid)
        return MATCHES.get(match_id) if match_id is not None else None


# ---------------------------------------------------------------- helpers ---


def bad_request(message):
    return jsonify({"message": message}), 400


def require_admin():
    """401 unless the request carries the organizer password; 503 if none set."""
    if not ADMIN_PASSWORD:
        return jsonify({"message":
                        "Admin endpoints are disabled — set "
                        "CIPHERSHIP_ADMIN_PASSWORD on the server"}), 503
    auth = request.headers.get("Authorization", "")
    if not hmac.compare_digest(auth, "Bearer " + ADMIN_PASSWORD):
        return jsonify({"message": "Admin password required"}), 401
    return None


def valid_cipher(cipher):
    if not isinstance(cipher, str):
        return False

    cipher = cipher.lower()

    return len(cipher) == BOARD_SIZE and sorted(cipher) == sorted("abcde")


def valid_cell(cell):
    """True if cell is a {"x": int, "y": int} strictly inside the board."""
    if not isinstance(cell, dict):
        return False
    x, y = cell.get("x"), cell.get("y")
    return (isinstance(x, int) and not isinstance(x, bool)
            and isinstance(y, int) and not isinstance(y, bool)
            and 0 <= x < BOARD_SIZE and 0 <= y < BOARD_SIZE)


def valid_single_move(moves):
    """Return the one cell of a 1-element move list, or None."""
    if isinstance(moves, list) and len(moves) == 1 and valid_cell(moves[0]):
        return moves[0]
    return None


# ----------------------------------------------------------------- routes ---


@app.route("/")
def index():
    return render_template("organizer.html")


@app.route("/match/<match_id>")
def match_page(match_id):
    with registry_lock:
        match = MATCHES.get(match_id)
        if match is None:
            return jsonify({"message": "Unknown match"}), 404
        label = match.label
    return render_template("index.html", match_id=match_id, match_label=label)


@app.route("/create-match", methods=["POST"])
def create_match():
    denied = require_admin()
    if denied is not None:
        return denied
    data = request.get_json(silent=True)
    label = ""
    duration_minutes = DEFAULT_MATCH_DURATION_MINUTES
    max_rounds = MAX_ROUNDS
    if isinstance(data, dict):
        if data.get("label") is not None:
            if not isinstance(data["label"], str) or len(data["label"]) > 40:
                return bad_request("Label must be a string of at most 40 characters")
            label = data["label"].strip()
        # Validate duration_minutes
        if data.get("duration_minutes") is not None:
            try:
                duration_minutes = int(data["duration_minutes"])
                if duration_minutes <= 0:
                    return bad_request("Duration must be a positive integer")
            except (ValueError, TypeError):
                return bad_request("Duration must be a positive integer")
        # Validate max_rounds
        if data.get("max_rounds") is not None:
            try:
                max_rounds = int(data["max_rounds"])
                if max_rounds <= 0:
                    return bad_request("Max rounds must be a positive integer")
            except (ValueError, TypeError):
                return bad_request("Max rounds must be a positive integer")

    with registry_lock:
        match_id = uuid4().hex[:8]
        MATCHES[match_id] = Match(match_id, label, duration_minutes, max_rounds)

    print(f"Match created: {match_id} ({label}) duration={duration_minutes}min max_rounds={max_rounds}")
    return jsonify({"matchId": match_id, "joinUrl": f"/match/{match_id}"}), 200


@app.route("/matches")
def list_matches():
    denied = require_admin()
    if denied is not None:
        return denied
    with registry_lock:
        matches = list(MATCHES.values())
    out = []
    for m in matches:
        with m.lock:
            out.append({
                "matchId": m.id,
                "label": m.label,
                "status": m.status,
                "teams": [p.team_name for p in m.players],
                "points": [p.points for p in m.players],
                "round": m.round_number,
                "maxRounds": m.max_rounds,
                "duration_minutes": m.duration_minutes,
                "started_at": m.started_at.isoformat() if m.started_at else None,
                "ends_at": m.ends_at.isoformat() if m.ends_at else None,
                "server_time": datetime.now(timezone.utc).isoformat(),
                "joinUrl": f"/match/{m.id}",
            })
    return jsonify(out)


@app.route("/close-match/<match_id>", methods=["POST"])
def close_match(match_id):
    denied = require_admin()
    if denied is not None:
        return denied
    with registry_lock:
        match = MATCHES.pop(match_id, None)
        if match is None:
            return jsonify({"message": "Unknown match"}), 404
        for player_uuid in match.player_index:
            PLAYER_MATCH.pop(player_uuid, None)
    print(f"Match closed: {match_id}")
    return jsonify({"message": "Match closed", "matchId": match_id}), 200


@app.route("/reset", methods=["POST"])
def reset():
    """Organizer endpoint: wipe every match and start over."""
    denied = require_admin()
    if denied is not None:
        return denied
    with registry_lock:
        MATCHES.clear()
        PLAYER_MATCH.clear()
    print("All matches cleared")
    return jsonify({"message": "All matches cleared."}), 200


@app.route("/submit-team-info", methods=["POST"])
def submit_team_info():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return bad_request("Invalid team request")
    team_name = data.get("teamName")
    cipher = data.get("cipher")
    if not isinstance(team_name, str) or not TEAM_NAME_RE.match(team_name.strip()):
        return bad_request("Team name must be 1-32 characters "
                           "(letters, digits, space, . _ -)")
    team_name = team_name.strip()
    if not valid_cipher(cipher):
        return bad_request("Cipher must be a permutation of abcde, e.g. aecbd")

    cipher = cipher.lower()

    match_id = data.get("matchId")
    if not isinstance(match_id, str):
        return bad_request("Missing matchId — open the join link from the "
                           "organizer (/match/<matchId>)")

    with registry_lock:
        match = MATCHES.get(match_id)
        if match is None:
            return bad_request("Unknown match — use the join link from the "
                               "organizer")
        with match.lock:
            if match.status == "finished":
                return bad_request("This match is already finished — ask the "
                                   "organizer for a new one")
            if len(match.players) >= MAX_PLAYER_COUNT:
                return jsonify({"message":
                                "Match full — ask the organizer for a new "
                                "match"}), 502
            team_uuid = uuid4().hex
            match.player_index[team_uuid] = len(match.players)
            PLAYER_MATCH[team_uuid] = match_id
            match.players.append(Player(BOARD_SIZE, team_name, cipher))
            match.append_message("Admiral", f"{team_name} joined the match")
            if len(match.players) == MAX_PLAYER_COUNT:
                match.status = "playing"

    print(f"[{match_id}] Team registered: {team_name}")
    return jsonify({"message": "Team info received successfully!",
                    "teamName": team_name, "teamUUID": team_uuid,
                    "cipher": cipher}), 200


@app.route("/submit-ships", methods=["POST"])
def submit_ships():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return bad_request("Invalid ship request")
    ships = data.get("ships")
    if not isinstance(ships, list) or len(ships) != SHIP_COUNT:
        return bad_request(f"Exactly {SHIP_COUNT} ships are required")
    if not all(valid_cell(c) for c in ships):
        return bad_request("Every ship needs integer coordinates in 0-4")
    if len({(c["x"], c["y"]) for c in ships}) != SHIP_COUNT:
        return bad_request("Ships must occupy distinct cells")

    match = resolve_match(data.get("uuid"))
    if match is None:
        return jsonify({"message": "Enter valid UUID"}), 502
    with match.lock:
        player = match.find_player(data.get("uuid"))
        if player is None:
            return jsonify({"message": "Enter valid UUID"}), 502
        if match.has_expired():
            return jsonify({"message": "Match time expired"}), 410
        if player.state != State.SELECT_SHIP_STATE.value:
            return jsonify({"message":
                            "Ships already locked in for this match"}), 409
        player.setShip(ships)
        player.state = State.WAIT_FOR_START.value
        match.waiting += 1
        match.check_wait()

    print(f"[{match.id}] {player.team_name} placed {SHIP_COUNT} ships")
    return jsonify({"message": "Ship layout received!", "ships": ships}), 200


@app.route("/submit-attack", methods=["POST"])
def submit_attack():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return bad_request("Invalid attack request")
    attack = valid_single_move(data.get("attack"))
    if attack is None:
        return bad_request("Attack must be exactly one cell {x, y} "
                           "with coordinates 0-4")

    match = resolve_match(data.get("uuid"))
    if match is None:
        return jsonify({"message": "Enter valid UUID"}), 502
    with match.lock:
        player = match.find_player(data.get("uuid"))
        if player is None:
            return jsonify({"message": "Enter valid UUID"}), 502
        if match.has_expired():
            return jsonify({"message": "Match time expired"}), 410
        if player.state != State.ATTACK_STATE.value:
            return jsonify({"message":
                            "Not in attack phase (or move already "
                            "submitted)"}), 409
        # Input is fully validated: only now commit the turn.
        player.state = State.WAIT_FOR_ATTACK.value
        player.setAttack(attack)
        match.append_message(player.team_name,
                             "Attacked on " + player.encrypt((attack["x"],
                                                              attack["y"])))
        match.waiting += 1
        match.check_wait()

    print(f"[{match.id}] {player.team_name} attacked {attack}")
    return jsonify({"message": "Attack received!", "attack": attack}), 200


@app.route("/submit-defend", methods=["POST"])
def submit_defend():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return bad_request("Invalid defend request")
    defend = valid_single_move(data.get("defend"))
    if defend is None:
        return bad_request("Defense must be exactly one cell {x, y} "
                           "with coordinates 0-4")

    match = resolve_match(data.get("uuid"))
    if match is None:
        return jsonify({"message": "Enter valid UUID"}), 502
    with match.lock:
        player = match.find_player(data.get("uuid"))
        if player is None:
            return jsonify({"message": "Enter valid UUID"}), 502
        if match.has_expired():
            return jsonify({"message": "Match time expired"}), 410
        if player.state != State.DEFEND_STATE.value:
            return jsonify({"message":
                            "Not in defend phase (or move already "
                            "submitted)"}), 409
        # Input is fully validated: only now commit the turn.
        player.state = State.WAIT_FOR_DEFEND.value
        player.setDefend(defend)
        match.append_message(player.team_name,
                             "Defended on " + player.encrypt((defend["x"],
                                                              defend["y"])))
        match.waiting += 1
        match.check_wait()

    print(f"[{match.id}] {player.team_name} defended {defend}")
    return jsonify({"message": "Defense received!", "defense": defend}), 200


@app.route("/get-all-messages/<uuid>")
def get_moves(uuid):
    match = resolve_match(uuid)
    if match is None:
        return jsonify({"message": "Enter valid UUID"}), 502
    with match.lock:
        return jsonify(list(match.messages))


@app.route("/get-tables/<uuid>")
def get_tables(uuid):
    match = resolve_match(uuid)
    if match is None:
        return jsonify({"message": "Enter valid UUID"}), 502
    with match.lock:
        player = match.find_player(uuid)
        if player is None:
            return jsonify({"message": "Enter valid UUID"}), 502
        # Check for timeout - if expired, match should be finished
        if match.has_expired() and match.status == "playing":
            match._finish_by_timeout()
        user_table = []
        opponent_table = []
        for x in range(BOARD_SIZE):
            for y in range(BOARD_SIZE):
                user_table.append({
                    "x": x, "y": y,
                    "color": CELL_STATES[int(player.my_board[x][y])]
                })
                opponent_table.append({
                    "x": x, "y": y,
                    "color": CELL_STATES[int(player.op_board[x][y])]
                })
        return jsonify({
            "table_data": [user_table, opponent_table],
            "score": player.points,
            "cipher": player.cipher,
            "round": match.round_number,
            "max_rounds": match.max_rounds,
            "duration_minutes": match.duration_minutes,
            "started_at": match.started_at.isoformat() if match.started_at else None,
            "ends_at": match.ends_at.isoformat() if match.ends_at else None,
            "match_status": match.status,
            "server_time": datetime.now(timezone.utc).isoformat(),
        })


@app.route("/get-score/<uuid>")
def get_score(uuid):
    match = resolve_match(uuid)
    if match is None:
        return jsonify({"message": "Enter valid UUID"}), 502
    with match.lock:
        player = match.find_player(uuid)
        if player is None:
            return jsonify({"message": "Enter valid UUID"}), 502
        return jsonify({"score": player.points, "cipher": player.cipher})


@app.route("/play/<uuid>")
def play(uuid):
    match = resolve_match(uuid)
    if match is None:
        return jsonify({"message": "Enter valid UUID"}), 502
    with match.lock:
        player = match.find_player(uuid)
        if player is None:
            return jsonify({"message": "Enter valid UUID"}), 502
        cur_state = player.state

    if cur_state == State.SELECT_SHIP_STATE.value:
        return render_template("ship.html")
    elif cur_state == State.ATTACK_STATE.value:
        return render_template("attack.html")
    elif cur_state == State.DEFEND_STATE.value:
        return render_template("defend.html")
    elif cur_state in (State.WAIT_FOR_ATTACK.value,
                       State.WAIT_FOR_DEFEND.value):
        return render_template("wait_move.html")
    elif cur_state == State.WIN_STATE.value:
        return render_template("win.html")
    elif cur_state == State.LOSE_STATE.value:
        return render_template("lose.html")
    elif cur_state == State.DRAW_STATE.value:
        return render_template("draw.html")
    else:
        return render_template("wait_start.html")


if __name__ == "__main__":
    # debug=False: the Werkzeug interactive debugger on 0.0.0.0 is an
    # RCE-grade risk at a live event.
    app.run(debug=False)
