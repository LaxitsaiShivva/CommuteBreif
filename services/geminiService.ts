
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { VoiceName, Tone, Language, SummaryLength } from "../types.ts";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export type InputMode = 'text' | 'url' | 'search';

function cleanAndParseJSON(text: string) {
  try {
    let cleaned = text.trim();
    if (cleaned.includes('```')) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) cleaned = match[0];
    }
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Gemini JSON Parse Error. Raw text:", text);
    const secondMatch = text.match(/\{[\s\S]*\}/);
    if (secondMatch) {
      try { return JSON.parse(secondMatch[0]); } catch (e2) {}
    }
    throw new Error("Formatting error. Please try a simpler request.");
  }
}

export async function generateSummary(
  input: string, 
  tone: Tone = Tone.Professional,
  mode: InputMode = 'text',
  language: Language = Language.English,
  length: SummaryLength = SummaryLength.Medium
): Promise<{ title: string; summary: string; category: string; sources?: { uri: string; title: string }[] }> {
  
  const toneInstruction = {
    [Tone.Professional]: "Professional news anchor style.",
    [Tone.Casual]: "Friendly storytelling style.",
    [Tone.Dramatic]: "Intense breaking news style."
  };

  const lengthInstruction = {
    [SummaryLength.Short]: "Concise (120 words).",
    [SummaryLength.Medium]: "Standard (400 words).",
    [SummaryLength.Long]: "Detailed (800 words)."
  };

  const systemInstruction = `You are a high-speed news summarizer. 
ABSOLUTE RULE: Title and Summary MUST be in ${language} script.
Style: ${toneInstruction[tone]}
Detail: ${lengthInstruction[length]}`;

  const config: any = {
    systemInstruction,
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: `Headline in ${language} script.` },
        summary: { type: Type.STRING, description: `Audio script in ${language} script.` },
        category: { type: Type.STRING, enum: ["Tech", "Politics", "Finance", "Sports", "World", "General"] }
      },
      required: ["title", "summary", "category"]
    }
  };

  if (mode === 'url' || mode === 'search') {
    config.tools = [{ googleSearch: {} }];
  }

  const modelName = 'gemini-3-flash-preview';
  let userPrompt = "";

  if (mode === 'url') {
    userPrompt = `Summary & translation for ${input} in ${language}. Level: ${length}`;
  } else if (mode === 'search') {
    userPrompt = `Search news for ${input}, summary & translate to ${language}. Level: ${length}`;
  } else {
    userPrompt = `Summarize & translate to ${language}: "${input}". Level: ${length}`;
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: userPrompt,
    config
  });

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  const sources = groundingChunks?.map((chunk: any) => ({
    uri: chunk.web?.uri,
    title: chunk.web?.title
  })).filter((s: any) => s.uri) || [];

  const data = cleanAndParseJSON(response.text || "{}");
  return { ...data, sources };
}

export async function generateAudio(text: string, voice: VoiceName = VoiceName.Kore, language: Language = Language.English): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Language: ${language}. Read this with native accent: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Voice unavailable.");
  return base64Audio;
}

export async function decodeAudioPCM(base64: string, ctx: AudioContext): Promise<AudioBuffer> {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const dataInt16 = new Int16Array(bytes.buffer);
  const sampleRate = 24000;
  const frameCount = dataInt16.length;
  const buffer = ctx.createBuffer(1, frameCount, sampleRate);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

export function pcmToWavBlob(base64: string): Blob {
  const binaryString = atob(base64);
  const pcmData = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    pcmData[i] = binaryString.charCodeAt(i);
  }
  const sampleRate = 24000;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + pcmData.length, true);
  view.setUint32(8, 0x57415645, false);
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, pcmData.length, true);
  return new Blob([header, pcmData], { type: 'audio/wav' });
}
