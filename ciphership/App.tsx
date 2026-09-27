
import React, { useState, useEffect, useCallback } from 'react';
import { GameState, CellType, Coordinate, Player, Message, PendingTurn } from './types';
import { BOARD_SIZE, MAX_SHIPS, COORD_LABELS } from './constants';
import { getAIGuidance } from './services/geminiService';

// High-Tech SVG Icons (No Emojis)
const Icons = {
  Terminal: () => (
    <svg className="w-10 h-10 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Network: () => (
    <svg className="w-12 h-12 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9s2.015-9 4.5-9m0 18c-5.035 0-9-4.03-9-9s3.965-9 9-9 9 4.03 9 9-3.965 9-9 9" />
    </svg>
  ),
  Pulse: () => (
    <svg className="w-12 h-12 text-cyan-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Crosshair: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  CPU: () => (
    <svg className="w-12 h-12 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  )
};

const Header = ({ onOpenTutorial, activeTeamName, teamColor }: { onOpenTutorial: () => void, activeTeamName?: string, teamColor?: string }) => (
  <header className={`p-4 md:p-6 border-b border-cyan-500/20 flex justify-between items-center glass transition-all duration-700 ${teamColor === 'rose' ? 'border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'shadow-[0_0_20px_rgba(6,182,212,0.1)]'}`}>
    <div className="flex items-center gap-5">
      <img 
        src="logo.png" 
        alt="CSC Logo" 
        className="h-12 w-auto drop-shadow-[0_0_10px_rgba(0,229,255,0.5)]" 
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      <div className="border-l border-white/10 pl-5">
        <h1 className="text-2xl md:text-3xl font-black italic tracking-tighter text-white leading-none terminal-glow uppercase">CIPHERSHIP</h1>
        <p className="text-[10px] text-slate-500 tracking-[0.4em] uppercase font-black mt-1">CSY CLUB x Coders' Club</p>
      </div>
    </div>
    
    <div className="flex items-center gap-6">
      {activeTeamName && (
        <div className="hidden md:flex flex-col items-end">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest leading-none mb-1">Active Tunnel</span>
          <span className={`text-xs font-black tracking-widest uppercase ${teamColor === 'rose' ? 'text-emerald-400' : 'text-cyan-400'}`}>{activeTeamName}</span>
        </div>
      )}
      <button 
        onClick={onOpenTutorial}
        className="text-[10px] font-black border border-cyan-500/30 px-4 py-2 rounded-sm hover:bg-cyan-500/10 transition-all text-cyan-400 uppercase tracking-[0.2em]"
      >
        Protocol Manual
      </button>
    </div>
  </header>
);

const TutorialModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: "CONNECTION SYNC",
      content: "One operator creates a secure network to generate a frequency ID. The peer operator joins that ID to establish a bi-directional combat tunnel.",
      icon: <Icons.Network />
    },
    {
      title: "CRYPTO MATRIX",
      content: "Each operator defines a 5-character secret key. All coordinate data is scrambled before transmission. Break the enemy key to reveal their cluster.",
      icon: <Icons.Terminal />
    },
    {
      title: "EXPLOIT CYCLE",
      content: "Submit one EXPLOIT and one FIREWALL per turn. If your exploit target is a remote Node and their firewall is not properly positioned, a Breach is recorded.",
      icon: <Icons.Shield />
    }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-4">
      <div className="max-w-2xl w-full glass border-2 border-cyan-500/30 rounded-3xl p-10 shadow-2xl relative animate-in zoom-in duration-500">
        <button onClick={onClose} className="absolute top-8 right-8 text-slate-500 hover:text-white font-black tracking-widest uppercase text-xs transition-colors">Abort</button>
        <div className="text-center space-y-8 py-4">
          <div className="flex justify-center scale-125">{steps[step].icon}</div>
          <h2 className="text-3xl font-black italic text-cyan-400 tracking-tighter uppercase terminal-glow">{steps[step].title}</h2>
          <p className="text-slate-300 leading-relaxed text-base min-h-[100px] flex items-center justify-center px-10 border-l-4 border-cyan-500/20">{steps[step].content}</p>
        </div>
        <div className="mt-12 flex justify-between items-center">
          <div className="flex gap-3">{steps.map((_, i) => <div key={i} className={`h-1.5 w-8 rounded-full transition-all duration-500 ${i === step ? 'bg-cyan-400 w-16 shadow-[0_0_10px_rgba(0,229,255,0.5)]' : 'bg-slate-800'}`}></div>)}</div>
          <button onClick={() => step < steps.length - 1 ? setStep(s => s + 1) : onClose()} className="bg-cyan-600 hover:bg-cyan-500 px-10 py-3 rounded text-[11px] font-black uppercase tracking-[0.3em] transition-all shadow-lg shadow-cyan-900/30">
            {step < steps.length - 1 ? 'Next' : 'Authorize'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Grid = ({ board, onCellClick, title, interactive = false, highlightCell = null, showShips = true, theme = 'indigo' }: any) => {
  return (
    <div className="flex flex-col items-center">
      <h3 className={`text-[11px] font-black mb-5 uppercase tracking-[0.3em] ${theme === 'rose' ? 'text-emerald-400' : 'text-cyan-400'}`}>{title}</h3>
      <div className="grid grid-cols-6 gap-2">
        <div className="w-8 h-8"></div>
        {COORD_LABELS.map(l => <div key={l} className="w-10 h-10 flex items-center justify-center text-[10px] font-black text-slate-600 uppercase mono">{l}</div>)}
        {board.map((row: number[], y: number) => (
          <React.Fragment key={y}>
            <div className="w-8 h-10 flex items-center justify-center text-[10px] font-black text-slate-600 uppercase mono">{COORD_LABELS[y]}</div>
            {row.map((cell, x) => {
              const isHighlighted = highlightCell?.x === x && highlightCell?.y === y;
              let bgColor = 'bg-slate-950/80';
              let glow = '';
              let borderColor = 'border-white/5';
              
              if (showShips && cell === CellType.SHIP) { 
                bgColor = theme === 'rose' ? 'bg-emerald-600/60' : 'bg-cyan-600/60'; 
                glow = theme === 'rose' ? 'cell-glow-green' : 'cell-glow-cyan';
                borderColor = theme === 'rose' ? 'border-emerald-500/40' : 'border-cyan-500/40';
              }
              else if (cell === CellType.HIT) { bgColor = 'bg-red-700'; glow = 'cell-glow-red'; borderColor = 'border-red-500/50'; }
              else if (cell === CellType.BLOCKED) { bgColor = 'bg-indigo-700'; glow = 'cell-glow-blue'; borderColor = 'border-indigo-500/50'; }
              else if (cell === CellType.MISS) { bgColor = 'bg-slate-800/30'; borderColor = 'border-white/5'; }
              
              if (isHighlighted) {
                bgColor = theme === 'rose' ? 'bg-emerald-400 ring-2 ring-emerald-300' : 'bg-cyan-400 ring-2 ring-cyan-300';
              }

              return (
                <div 
                  key={`${x}-${y}`} 
                  onClick={() => interactive && onCellClick?.(x, y)} 
                  className={`w-10 h-10 rounded-sm cursor-pointer transition-all duration-300 ${bgColor} ${glow} border ${borderColor} hover:border-white/30 flex items-center justify-center`}
                >
                  {cell === CellType.HIT && <div className="animate-in zoom-in"><Icons.Crosshair /></div>}
                  {cell === CellType.BLOCKED && <div className="animate-in zoom-in"><Icons.Shield /></div>}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.LOBBY_SELECT);
  const [showTutorial, setShowTutorial] = useState(false);
  const [activePlayerIndex, setActivePlayerIndex] = useState(0); 
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [players, setPlayers] = useState<Player[]>([
    { teamName: '', cipher: '', board: Array(5).fill(0).map(() => Array(5).fill(0)), opponentPerspectiveBoard: Array(5).fill(0).map(() => Array(5).fill(0)), points: 0, shipsLeft: MAX_SHIPS },
    { teamName: '', cipher: '', board: Array(5).fill(0).map(() => Array(5).fill(0)), opponentPerspectiveBoard: Array(5).fill(0).map(() => Array(5).fill(0)), points: 0, shipsLeft: MAX_SHIPS }
  ]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingTurns, setPendingTurns] = useState<PendingTurn[]>([{ attack: null, defend: null }, { attack: null, defend: null }]);
  const [guidance, setGuidance] = useState<string>("Handshake sequence initiated...");
  const [lastTurnResult, setLastTurnResult] = useState<any>(null);

  const activePlayer = players[activePlayerIndex];
  const theme = activePlayerIndex === 0 ? 'indigo' : 'rose';

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'SYNC-';
    for(let i=0; i<4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    setRoomCode(code);
    setGameState(GameState.LOBBY_HOST);
  };

  const handleJoin = () => {
    if (inputCode.trim().length > 0) {
      setGameState(GameState.REGISTRATION);
      setActivePlayerIndex(0);
      addMessage("SYSTEM", `Encrypted Channel Established: ${inputCode.toUpperCase()}`);
    }
  };

  const addMessage = (sender: string, text: string, isEncrypted: boolean = false) => {
    setMessages(prev => [{ sender, text, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), isEncrypted }, ...prev].slice(0, 50));
  };

  const encrypt = useCallback((coord: Coordinate, cipher: string) => {
    const mapping: Record<string, string> = {};
    COORD_LABELS.forEach((char, i) => mapping[char] = cipher[i]);
    return `${mapping[COORD_LABELS[coord.x]]}${mapping[COORD_LABELS[coord.y]]}`;
  }, []);

  const handleRegistration = (idx: number, name: string, cipher: string) => {
    const newPlayers = [...players];
    newPlayers[idx] = { ...newPlayers[idx], teamName: name, cipher };
    setPlayers(newPlayers);
    if (idx === 0) setActivePlayerIndex(1);
    else { setActivePlayerIndex(0); setGameState(GameState.PLACEMENT); addMessage("SYSTEM", "Synchronization complete. Define node topology."); }
  };

  const handlePlaceShip = (x: number, y: number) => {
    const newBoard = [...activePlayer.board.map(row => [...row])];
    const count = newBoard.flat().filter(c => c === CellType.SHIP).length;
    if (newBoard[y][x] === CellType.SHIP) newBoard[y][x] = CellType.EMPTY;
    else if (count < MAX_SHIPS) newBoard[y][x] = CellType.SHIP;
    const newPlayers = [...players];
    newPlayers[activePlayerIndex] = { ...activePlayer, board: newBoard, shipsLeft: newBoard.flat().filter(c => c === CellType.SHIP).length };
    setPlayers(newPlayers);
  };

  const nextPlacement = () => {
    if (activePlayerIndex === 0) setGameState(GameState.TRANSITION);
    else { setActivePlayerIndex(0); setGameState(GameState.TRANSITION); }
  };

  const startTurn = () => {
    if (gameState === GameState.PLACEMENT && activePlayerIndex === 0) { setActivePlayerIndex(1); setGameState(GameState.PLACEMENT); }
    else if (gameState === GameState.PLACEMENT && activePlayerIndex === 1) { setActivePlayerIndex(0); setGameState(GameState.PLAYER_TURN); }
    else if (gameState === GameState.TRANSITION) setGameState(GameState.PLAYER_TURN);
  };

  const submitAction = () => {
    if (activePlayerIndex === 0) { setActivePlayerIndex(1); setGameState(GameState.TRANSITION); }
    else resolveCombat();
  };

  const resolveCombat = async () => {
    const p1 = players[0]; const p2 = players[1]; const t1 = pendingTurns[0]; const t2 = pendingTurns[1];
    if (!t1.attack || !t2.attack || !t1.defend || !t2.defend) return;
    const isP2Blocked = t2.defend.x === t1.attack.x && t2.defend.y === t1.attack.y;
    const isP1Hit = !isP2Blocked && p2.board[t1.attack.y][t1.attack.x] === CellType.SHIP;
    const isP1Blocked = t1.defend.x === t2.attack.x && t1.defend.y === t2.attack.y;
    const isP2Hit = !isP1Blocked && p1.board[t2.attack.y][t2.attack.x] === CellType.SHIP;
    
    const updateBoard = (pIdx: number, targetIdx: number, attack: Coordinate, isHit: boolean, isBlocked: boolean) => {
      const newTargetBoard = [...players[targetIdx].board.map(row => [...row])];
      const newMyView = [...players[pIdx].opponentPerspectiveBoard.map(row => [...row])];
      if (isHit) { newTargetBoard[attack.y][attack.x] = CellType.HIT; newMyView[attack.y][attack.x] = CellType.HIT; }
      else if (isBlocked) newMyView[attack.y][attack.x] = CellType.BLOCKED;
      else { newMyView[attack.y][attack.x] = CellType.MISS; newTargetBoard[attack.y][attack.x] = CellType.MISS; }
      return { targetBoard: newTargetBoard, myView: newMyView };
    };

    const res1 = updateBoard(0, 1, t1.attack, isP1Hit, isP2Blocked);
    const res2 = updateBoard(1, 0, t2.attack, isP2Hit, isP1Blocked);
    
    addMessage(p1.teamName, `EXPLOIT: ${encrypt(t1.attack, p1.cipher)}`, true);
    addMessage(p2.teamName, `EXPLOIT: ${encrypt(t2.attack, p2.cipher)}`, true);

    const newPlayers = [...players];
    newPlayers[0] = { ...p1, board: res2.targetBoard, opponentPerspectiveBoard: res1.myView, points: p1.points + (isP1Hit ? 1 : 0), shipsLeft: res2.targetBoard.flat().filter(c => c === CellType.SHIP).length };
    newPlayers[1] = { ...p2, board: res1.targetBoard, opponentPerspectiveBoard: res2.myView, points: p2.points + (isP2Hit ? 1 : 0), shipsLeft: res1.targetBoard.flat().filter(c => c === CellType.SHIP).length };
    setPlayers(newPlayers);
    setLastTurnResult({ isP1Hit, isP2Hit, isP1Blocked, isP2Blocked });
    setGameState(GameState.RESOLUTION);
    if (newPlayers[0].shipsLeft === 0 || newPlayers[1].shipsLeft === 0) setGameState(GameState.GAME_OVER);
    const hint = await getAIGuidance(messages.map(m => m.text), p1.cipher);
    setGuidance(hint);
  };

  return (
    <div className="min-h-screen text-slate-100 flex flex-col overflow-hidden relative">
      <Header onOpenTutorial={() => setShowTutorial(true)} activeTeamName={gameState === GameState.PLAYER_TURN ? activePlayer.teamName : undefined} teamColor={theme} />
      <TutorialModal isOpen={showTutorial} onClose={() => setShowTutorial(false)} />

      <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col gap-8 overflow-y-auto">
        {gameState === GameState.LOBBY_SELECT && (
          <div className="max-w-5xl mx-auto w-full flex flex-col items-center mt-4 animate-in fade-in slide-in-from-top duration-1000">
            <div className="flex flex-col items-center mb-16 text-center">
              <img 
                src="logo.png" 
                alt="CSC Logo" 
                className="h-44 w-auto mb-10 drop-shadow-[0_0_40px_rgba(0,229,255,0.4)] transition-transform hover:scale-105 duration-700" 
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div className="space-y-3">
                <h2 className="text-5xl font-black italic tracking-[0.5em] text-white uppercase mb-1 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">CIPHERSHIP</h2>
                <p className="text-cyan-400 font-black tracking-[0.3em] text-sm uppercase">CSY CLUB x Coders' Club</p>
              </div>
              <div className="h-1 w-64 bg-gradient-to-r from-transparent via-cyan-500 to-transparent mt-8 animate-pulse"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full px-4">
              <div onClick={generateCode} className="glass p-12 rounded-3xl border border-cyan-500/20 hover:border-cyan-400 hover:bg-cyan-900/10 transition-all cursor-pointer text-center space-y-8 group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity"><Icons.CPU /></div>
                <div className="flex justify-center group-hover:scale-110 transition-transform"><Icons.Pulse /></div>
                <div>
                  <h2 className="text-2xl font-black italic tracking-widest text-cyan-400 uppercase mb-3">Create Game</h2>
                  <p className="text-slate-400 text-sm leading-relaxed font-medium">Initialize a private combat frequency and await a peer uplink.</p>
                </div>
                <div className="pt-6 text-[11px] font-black text-cyan-500 uppercase tracking-[0.4em] border-t border-white/5">Host Active Network</div>
              </div>
              
              <div onClick={() => setGameState(GameState.LOBBY_JOIN)} className="glass p-12 rounded-3xl border border-emerald-500/20 hover:border-emerald-400 hover:bg-emerald-900/10 transition-all cursor-pointer text-center space-y-8 group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity"><Icons.Network /></div>
                <div className="flex justify-center group-hover:scale-110 transition-transform"><Icons.Terminal /></div>
                <div>
                  <h2 className="text-2xl font-black italic tracking-widest text-emerald-400 uppercase mb-3">Join Game</h2>
                  <p className="text-slate-400 text-sm leading-relaxed font-medium">Enter the secure frequency ID to synchronize combat protocols.</p>
                </div>
                <div className="pt-6 text-[11px] font-black text-emerald-500 uppercase tracking-[0.4em] border-t border-white/5">Establish Sync</div>
              </div>
            </div>
          </div>
        )}

        {gameState === GameState.LOBBY_HOST && (
          <div className="max-w-md mx-auto w-full glass p-12 rounded-3xl text-center space-y-10 mt-12 border border-cyan-500/30 animate-in slide-in-from-bottom">
            <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em]">Broadcasting Secure ID</h2>
            <div className="p-10 bg-black/60 rounded-2xl border border-cyan-500/20 mono text-4xl font-black text-cyan-400 tracking-[0.2em] shadow-[inset_0_0_20px_rgba(6,182,212,0.1)]">
              {roomCode}
            </div>
            <div className="flex flex-col items-center gap-6 py-4">
              <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400 text-sm font-bold uppercase tracking-widest animate-pulse">Awaiting Peer Handshake...</p>
            </div>
            <button onClick={() => setGameState(GameState.REGISTRATION)} className="w-full bg-slate-800/40 py-4 rounded text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all border border-white/5">Bypass Handshake (Dev)</button>
          </div>
        )}

        {gameState === GameState.LOBBY_JOIN && (
          <div className="max-w-md mx-auto w-full glass p-12 rounded-3xl text-center space-y-10 mt-12 border border-emerald-500/30 animate-in slide-in-from-bottom">
            <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em]">Handshake Protocol In Progress</h2>
            <div className="space-y-6">
              <input 
                type="text" 
                value={inputCode} 
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="SYNC-XXXX" 
                className="w-full bg-black/60 border border-emerald-500/40 p-6 rounded-2xl mono text-center text-3xl font-black tracking-widest text-emerald-400 outline-none focus:ring-1 focus:ring-emerald-400 transition-all"
              />
              <button onClick={handleJoin} disabled={!inputCode} className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-30 py-5 rounded-xl font-black text-xs uppercase tracking-[0.3em] transition-all shadow-lg shadow-emerald-950/50">Establish Uplink</button>
            </div>
            <button onClick={() => setGameState(GameState.LOBBY_SELECT)} className="text-[11px] font-black text-slate-500 uppercase hover:text-white transition-colors tracking-widest">Abort</button>
          </div>
        )}

        {gameState === GameState.REGISTRATION && (
          <div className="max-w-md mx-auto w-full glass p-12 rounded-3xl shadow-2xl space-y-10 mt-10 border border-white/5 animate-in fade-in">
            <div className="text-center space-y-2">
              <h2 className={`text-2xl font-black italic uppercase tracking-tighter ${activePlayerIndex === 0 ? 'text-cyan-400' : 'text-emerald-400'}`}>
                Operator {activePlayerIndex === 0 ? 'Alpha' : 'Beta'} Login
              </h2>
              <div className={`h-1 w-20 mx-auto ${activePlayerIndex === 0 ? 'bg-cyan-500' : 'bg-emerald-500'}`}></div>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 uppercase font-black px-1 tracking-widest">Operator Signature</label>
                <input type="text" value={activePlayer.teamName} onChange={(e) => { const n = [...players]; n[activePlayerIndex].teamName = e.target.value; setPlayers(n); }} className="w-full bg-black/50 border border-slate-800 p-5 rounded-xl mono text-sm outline-none focus:border-cyan-500/50 transition-colors" placeholder="e.g. NET_STRIKER" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 uppercase font-black px-1 tracking-widest">Security Key (5 unique: a,b,c,d,e)</label>
                <input type="text" maxLength={5} value={activePlayer.cipher} onChange={(e) => { const n = [...players]; n[activePlayerIndex].cipher = e.target.value.toLowerCase(); setPlayers(n); }} className="w-full bg-black/50 border border-slate-800 p-5 rounded-xl mono text-base tracking-[0.6em] outline-none focus:border-cyan-500/50 text-center font-bold" placeholder="abcde" />
              </div>
              <button onClick={() => handleRegistration(activePlayerIndex, activePlayer.teamName, activePlayer.cipher)} disabled={!activePlayer.teamName || activePlayer.cipher.length !== 5 || new Set(activePlayer.cipher).size !== 5} className={`w-full py-6 rounded-xl font-black text-xs uppercase tracking-[0.4em] ${activePlayerIndex === 0 ? 'bg-cyan-700 hover:bg-cyan-600 shadow-cyan-950/50' : 'bg-emerald-700 hover:bg-emerald-600 shadow-emerald-950/50'} transition-all disabled:opacity-20 shadow-lg`}>Commit Handshake</button>
            </div>
          </div>
        )}

        {gameState === GameState.TRANSITION && (
          <div className="fixed inset-0 z-50 bg-[#020617] flex flex-col items-center justify-center p-8 text-center space-y-10 animate-in fade-in duration-500">
            <div className="w-24 h-24 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            <div>
              <h2 className="text-6xl font-black italic tracking-tighter text-white uppercase terminal-glow mb-3">Switching Operator</h2>
              <p className="text-xl text-slate-400 max-w-sm uppercase tracking-[0.2em] font-medium">Clear secure space for operator <span className="text-cyan-400 font-bold">{players[activePlayerIndex].teamName}</span>.</p>
            </div>
            <button onClick={startTurn} className="bg-cyan-700 px-20 py-6 rounded-xl font-black text-sm uppercase tracking-[0.3em] hover:bg-cyan-600 transition-all border border-cyan-400/20 shadow-xl shadow-cyan-950/50">Authorize Terminal</button>
          </div>
        )}

        {gameState === GameState.PLACEMENT && (
          <div className="flex flex-col items-center space-y-12 animate-in slide-in-from-bottom">
            <div className="text-center space-y-3">
              <h2 className={`text-4xl font-black italic uppercase tracking-tighter ${theme === 'rose' ? 'text-emerald-400' : 'text-cyan-400'}`}>Node Topology</h2>
              <div className="px-8 py-2 bg-black/60 rounded-full border border-white/5 mono text-xs font-bold">
                <span className="text-cyan-400 tracking-widest">{activePlayer.shipsLeft} / {MAX_SHIPS}</span> NODES ACTIVATED
              </div>
            </div>
            <Grid title="Internal Cluster View" board={activePlayer.board} onCellClick={handlePlaceShip} interactive={true} theme={theme} />
            <button onClick={nextPlacement} disabled={activePlayer.shipsLeft !== MAX_SHIPS} className={`px-24 py-6 rounded-xl font-black text-xs uppercase tracking-[0.4em] transition-all shadow-2xl ${theme === 'rose' ? 'bg-emerald-700 hover:bg-emerald-600 shadow-emerald-950/50' : 'bg-cyan-700 hover:bg-cyan-600 shadow-cyan-950/50'} disabled:opacity-10`}>Seal Topology</button>
          </div>
        )}

        {(gameState === GameState.PLAYER_TURN || gameState === GameState.RESOLUTION || gameState === GameState.GAME_OVER) && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 h-full">
            <div className="lg:col-span-8 space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <Grid title="Internal Grid (Firewall)" board={activePlayer.board} theme={theme} interactive={gameState === GameState.PLAYER_TURN} onCellClick={(x: number, y: number) => { const n = [...pendingTurns]; n[activePlayerIndex].defend = {x, y}; setPendingTurns(n); }} highlightCell={pendingTurns[activePlayerIndex].defend} />
                <Grid title="Remote Grid (Exploit)" board={activePlayer.opponentPerspectiveBoard} showShips={false} theme={theme} interactive={gameState === GameState.PLAYER_TURN} onCellClick={(x: number, y: number) => { const n = [...pendingTurns]; n[activePlayerIndex].attack = {x, y}; setPendingTurns(n); }} highlightCell={pendingTurns[activePlayerIndex].attack} />
              </div>
              
              <div className="glass p-10 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-8 border border-white/5">
                <div className="text-center md:text-left">
                  <span className="text-[10px] text-slate-500 uppercase font-black block mb-2 tracking-[0.4em]">Op Queue</span>
                  <span className={`text-xl font-black italic tracking-widest uppercase terminal-glow ${theme === 'rose' ? 'text-emerald-400' : 'text-cyan-400'}`}>
                    {!pendingTurns[activePlayerIndex].attack ? "Map Exploit Target" : !pendingTurns[activePlayerIndex].defend ? "Lock Firewall Node" : "Awaiting Authorization"}
                  </span>
                </div>
                <button onClick={submitAction} disabled={!pendingTurns[activePlayerIndex].attack || !pendingTurns[activePlayerIndex].defend} className={`px-16 py-5 rounded-xl font-black text-xs uppercase tracking-[0.3em] ${theme === 'rose' ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-cyan-700 hover:bg-cyan-600'} disabled:opacity-10 transition-all border border-white/10 shadow-xl`}>
                  Execute Command
                </button>
              </div>

              {gameState === GameState.RESOLUTION && lastTurnResult && (
                <div className="glass border-t-4 border-cyan-500 p-10 rounded-2xl animate-in fade-in duration-500 shadow-2xl">
                  <h4 className="text-center font-black text-cyan-400 uppercase mb-8 text-[11px] tracking-[0.5em]">Synchronized Breach Report</h4>
                  <div className="grid grid-cols-2 gap-8 text-center">
                    <div className="p-8 bg-black/60 rounded-xl border border-white/5 space-y-2">
                      <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest">Sector Alpha</p>
                      <p className={`text-xl font-black tracking-tighter uppercase ${lastTurnResult.isP1Hit ? 'text-emerald-400 terminal-glow' : 'text-slate-700'}`}>{lastTurnResult.isP1Hit ? 'Breach Success' : lastTurnResult.isP2Blocked ? 'Node Deflected' : 'Exploit Failed'}</p>
                    </div>
                    <div className="p-8 bg-black/60 rounded-xl border border-white/5 space-y-2">
                      <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest">Sector Beta</p>
                      <p className={`text-xl font-black tracking-tighter uppercase ${lastTurnResult.isP2Hit ? 'text-emerald-400 terminal-glow' : 'text-slate-700'}`}>{lastTurnResult.isP2Hit ? 'Breach Success' : lastTurnResult.isP1Blocked ? 'Node Deflected' : 'Exploit Failed'}</p>
                    </div>
                  </div>
                  <button onClick={() => { setPendingTurns([{attack:null, defend:null}, {attack:null, defend:null}]); setGameState(GameState.TRANSITION); setActivePlayerIndex(0); }} className="w-full mt-8 bg-slate-800 hover:bg-slate-700 py-5 rounded-xl font-black text-xs uppercase tracking-[0.3em] transition-all border border-white/5">Cycle Combat Phase</button>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 flex flex-col gap-8">
              <div className="glass p-8 rounded-2xl flex justify-around border border-white/5 shadow-xl">
                <div className="text-center"><p className="text-[10px] text-slate-500 font-black mb-2 tracking-widest">ALPHA</p><p className="text-4xl font-black mono text-cyan-400">{players[0].points}</p></div>
                <div className="w-px bg-slate-800"></div>
                <div className="text-center"><p className="text-[10px] text-slate-500 font-black mb-2 tracking-widest">BETA</p><p className="text-4xl font-black mono text-emerald-400">{players[1].points}</p></div>
              </div>
              
              <div className="glass p-8 rounded-2xl border border-white/5 shadow-inner">
                <h4 className="text-[11px] font-black text-cyan-400 uppercase mb-4 tracking-widest">Terminal Intelligence</h4>
                <p className="italic text-slate-400 text-sm border-l-2 border-cyan-500/50 pl-5 py-2 leading-relaxed font-medium">"{guidance}"</p>
              </div>

              <div className="glass p-8 rounded-2xl border border-white/5">
                <h4 className="text-[11px] font-black text-slate-600 uppercase mb-6 tracking-widest">Active Cipher Matrix</h4>
                <div className="flex justify-between items-center mono">
                  {COORD_LABELS.map((l, i) => (
                    <div key={l} className="flex flex-col items-center">
                      <span className="text-[10px] text-cyan-500 mb-3 uppercase font-black">{l}</span>
                      <div className={`w-10 h-10 rounded border flex items-center justify-center text-sm font-black ${theme === 'rose' ? 'border-emerald-500/30 text-emerald-300' : 'border-cyan-500/30 text-cyan-300'} bg-black/40`}>
                        {activePlayer.cipher[i]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass p-6 rounded-2xl flex-1 flex flex-col overflow-hidden border border-white/5">
                <h4 className="text-[11px] font-black text-slate-600 uppercase mb-5 tracking-widest px-2">Network Logs</h4>
                <div className="flex-1 overflow-y-auto space-y-5 px-2 custom-scrollbar">
                  {messages.map((m, i) => (
                    <div key={i} className="text-[11px] space-y-2 animate-in fade-in slide-in-from-left duration-500">
                      <div className="flex justify-between text-[10px] text-slate-600 font-black uppercase tracking-widest"><span>{m.sender}</span><span>{m.timestamp}</span></div>
                      <p className={`${m.isEncrypted ? 'mono text-cyan-400 bg-cyan-950/20 p-3 rounded-lg border border-cyan-500/10' : 'text-slate-500 font-medium'}`}>{m.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {gameState === GameState.GAME_OVER && (
          <div className="fixed inset-0 z-50 bg-[#020617]/98 flex items-center justify-center p-4">
            <div className="max-lg w-full glass border-2 border-cyan-500/50 p-16 rounded-[2.5rem] text-center space-y-12 animate-in zoom-in shadow-2xl shadow-cyan-950/50">
              <h1 className="text-7xl font-black italic tracking-tighter text-white uppercase terminal-glow">Target Compromised</h1>
              <div className="space-y-6">
                <p className="text-4xl font-black text-cyan-400 uppercase tracking-widest">{players[0].shipsLeft === 0 ? players[1].teamName : players[0].teamName} VICTORIOUS</p>
                <div className="text-2xl mono text-slate-600 font-black tracking-widest">{players[0].points} - {players[1].points} BREACHES RECORDED</div>
              </div>
              <button onClick={() => window.location.reload()} className="w-full bg-cyan-700 py-6 rounded-2xl font-black uppercase tracking-[0.4em] hover:scale-105 transition-all border border-cyan-400/20 shadow-2xl">Re-Initiate Protocol</button>
            </div>
          </div>
        )}
      </main>
      <footer className="p-6 text-center text-[10px] text-slate-600 uppercase tracking-[0.5em] glass mt-auto border-t border-white/5 font-black">CSY CLUB x Coders' Club // IIIT Kottayam</footer>
    </div>
  );
}
