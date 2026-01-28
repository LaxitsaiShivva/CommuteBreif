
export interface BriefItem {
  id: string;
  title: string;
  originalText: string;
  summary: string;
  audioBase64?: string;
  timestamp: number;
  category: string;
  tone: Tone;
  length: SummaryLength;
  language?: Language;
  sources?: { uri: string; title: string }[];
}

export enum Tone {
  Professional = 'Professional',
  Casual = 'Casual',
  Dramatic = 'Dramatic'
}

export enum SummaryLength {
  Short = 'Short',
  Medium = 'Medium',
  Long = 'Long'
}

export enum Language {
  English = 'English',
  Hindi = 'Hindi (हिन्दी)',
  Bengali = 'Bengali (বাংলা)',
  Marathi = 'Marathi (मराठी)',
  Telugu = 'Telugu (తెలుగు)',
  Tamil = 'Tamil (தமிழ்)',
  Gujarati = 'Gujarati (ગુજરાતી)',
  Kannada = 'Kannada (ಕನ್ನಡ)',
  Malayalam = 'Malayalam (മലയാളം)',
  Punjabi = 'Punjabi (ਪੰਜਾਬੀ)'
}

export enum VoiceName {
  Kore = 'Kore',
  Puck = 'Puck',
  Charon = 'Charon',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr'
}

export const VoiceDescriptions: Record<VoiceName, string> = {
  [VoiceName.Kore]: 'Energetic & Bright',
  [VoiceName.Puck]: 'Friendly & Narrative',
  [VoiceName.Charon]: 'Deep & Serious',
  [VoiceName.Fenrir]: 'Warm & Professional',
  [VoiceName.Zephyr]: 'Soft & Clear'
};

export const CategoryColors: Record<string, string> = {
  Tech: 'bg-blue-50 text-blue-700 border-blue-100',
  Politics: 'bg-rose-50 text-rose-700 border-rose-100',
  Finance: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Sports: 'bg-amber-50 text-amber-700 border-amber-100',
  World: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  General: 'bg-slate-50 text-slate-700 border-slate-100'
};
