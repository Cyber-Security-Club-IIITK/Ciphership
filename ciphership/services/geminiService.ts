
import { GoogleGenAI, Type } from "@google/genai";
import { BOARD_SIZE, MAX_SHIPS, COORD_LABELS } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getAIGuidance = async (history: string[], playerCipher: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        The user is playing CIPHERSHIP (substitution cipher strategy game).
        The theme is cybersecurity: nodes, breaches, exploits, and firewalls.
        Current log history: ${history.join('\n')}.
        The player's own secret cipher is: ${playerCipher}.
        Coordinate labels are 'a' through 'e'.
        
        Provide a brief tactical recommendation or a cryptic hint about network infiltration or breaking the opponent's exploit patterns.
        Keep it under 60 words and maintain a "terminal intelligence / security specialist" persona. Avoid naval or ocean references.
      `
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Guidance Error:", error);
    return "Network protocols are scrambled. Maintain stealth.";
  }
};

export const generateAICipherAndShips = () => {
  const chars = [...COORD_LABELS];
  const cipher = [...chars].sort(() => Math.random() - 0.5).join('');
  
  const board = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(0));
  let placed = 0;
  while (placed < MAX_SHIPS) {
    const x = Math.floor(Math.random() * BOARD_SIZE);
    const y = Math.floor(Math.random() * BOARD_SIZE);
    if (board[y][x] === 0) {
      board[y][x] = 1;
      placed++;
    }
  }
  
  return { cipher, board };
};
