import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const MODEL_NAME = 'gemini-2.5-flash';

const SYSTEM_INSTRUCTION = `
You are "Rack-O-Bot", a competitive, slightly snarky, but fair robot billiards player. 
You are playing a game of 8-ball pool against a human.
Your goal is to provide short, witty commentary based on the game events provided to you.
Keep your responses under 20 words. Be conversational.
If the player does well, give a backhanded compliment or genuine praise.
If the player messes up (scratches, misses), roast them gently.
If it's your turn, announce your intent or confidence level.
`;

export const generateCommentary = async (eventDescription: string): Promise<string> => {
  if (!apiKey) return "Beep boop. (Add API Key for real talk)";

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: eventDescription,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        maxOutputTokens: 50,
        temperature: 0.8,
      },
    });
    return response.text || "...";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Testing my circuits...";
  }
};
