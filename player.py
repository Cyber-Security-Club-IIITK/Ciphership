import numpy as np

class Player:
    def __init__(self, board_size = 5, team_name = "", cipher = ""):
        # Board Data
        self.board_size = board_size
        self.my_board = np.zeros((board_size, board_size))
        self.op_board = np.zeros((board_size, board_size))

        # Algorithm Data
        self.algo_dte = {}
        self.algo_etd = {}
        self.alpha = [chr(asc) for asc in range(97, 97 + board_size)]
        self.cipher = cipher
        self.setAlgo(cipher)

        # Game Data
        self.team_name = team_name
        self.attack = None
        self.defend = None
        self.prev_def = None
        self.points = 0
        self.state = 1
        self.game_lost = False

    def setAttack(self,move):
        self.attack = move['x'], move['y']
        self.op_board[move['x']][move['y']] = 4

    def setDefend(self,move):
        if self.prev_def is not None:
            # Undo defense
            x,y,color = self.prev_def
            self.my_board[x][y] = color
        self.defend = move['x'], move['y']
        self.prev_def = move['x'], move['y'],self.my_board[move['x']][move['y']]
        self.my_board[move['x']][move['y']] = 3


    def setAlgo(self, algo_str):
        for idx in range(self.board_size):
            self.algo_dte[self.alpha[idx]] = algo_str[idx]
            self.algo_etd[algo_str[idx]] = self.alpha[idx]

    def setShip(self, ships):
        for ship in ships:
            self.my_board[ship['x']][ship['y']] = 1

    def gch(self,ch):
        return chr(ch + ord('a'))
        
    def decrypt(self, enc_coord):
        enc_x, enc_y = enc_coord
        return self.algo_etd[self.gch(enc_x)] + self.algo_etd[self.gch(enc_y)]

    def encrypt(self, dec_coord):
        dec_x, dec_y = dec_coord
        return self.algo_dte[self.gch(dec_x)] + self.algo_dte[self.gch(dec_y)]



    def updatePlayer(self, opponent):
        """Resolve the opponent's attack against this player's board.

        A hit destroys a ship unless the defender protected that exact cell
        this round. Re-attacking a destroyed cell is a wasted attack (no
        damage, marker cleared), and the loss check ALWAYS runs so a match
        can never be stranded mid-resolution.
        """
        if opponent.attack is not None:
            (att_x, att_y) = opponent.attack
            cell = int(self.my_board[att_x][att_y])
            if cell == 1 and opponent.attack != self.defend:
                # Ship destroyed
                self.my_board[att_x][att_y] = 2
                opponent.op_board[att_x][att_y] = 2
                opponent.points += 1
            else:
                # Miss, blocked by defense, or an already-destroyed cell
                opponent.op_board[att_x][att_y] = 2 if cell == 2 else 0

        val = 0
        if self.prev_def is not None:
            x,y,color = self.prev_def
            if color == 1:
                val += 1

        print("no of ships by defense : ",val)
        val += (self.my_board.flatten()==1).sum()
        print("no of ships : ",val)

        if val == 0:
            self.game_lost = True

        print(self.points)
