
import React, { useState, useEffect, useMemo } from 'react';
import { BriefItem, VoiceName, Tone, Language, SummaryLength } from './types.ts';
import { generateSummary, generateAudio, InputMode, pcmToWavBlob } from './services/geminiService.ts';
import AudioPlayer from './components/AudioPlayer.tsx';
import { supabase } from './supabase.ts';

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [history, setHistory] = useState<BriefItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeBrief, setActiveBrief] = useState<BriefItem | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Kore);
  const [selectedTone, setSelectedTone] = useState<Tone>(Tone.Professional);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(Language.English);
  const [selectedLength, setSelectedLength] = useState<SummaryLength>(SummaryLength.Medium);
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [toast, setToast] = useState<{ message: string; visible: boolean; type: 'success' | 'error' | 'info' }>({ message: '', visible: false, type: 'info' });

  useEffect(() => {
    const saved = localStorage.getItem('commute_brief_local_history');
    if (saved && !user) setHistory(JSON.parse(saved));
  }, [user]);

  useEffect(() => {
    if (isGuest || !user) {
      localStorage.setItem('commute_brief_local_history', JSON.stringify(history));
    }
  }, [history, isGuest, user]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) setUser(session.user);
      } catch (err) {
        console.error("Auth init failed:", err);
      } finally {
        setIsInitialLoading(false);
      }
    };
    initAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) fetchHistory();
  }, [user]);

  const fetchHistory = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('briefings')
        .select('*')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      if (data) {
        const localData = JSON.parse(localStorage.getItem('commute_brief_local_history') || '[]');
        setHistory(data.map((item: any) => {
          const localMatch = localData.find((l: any) => l.id === item.id);
          return {
            id: item.id,
            title: item.title,
            originalText: item.original_text,
            summary: item.summary,
            audioBase64: item.audio_base_64 || item.audio_base64 || localMatch?.audioBase64, 
            timestamp: item.timestamp,
            category: item.category,
            tone: (item.tone as Tone) || localMatch?.tone || Tone.Professional,
            length: localMatch?.length || SummaryLength.Medium,
            language: localMatch?.language || Language.English 
          };
        }));
      }
    } catch (err) {
      console.error("Cloud Sync Error:", err);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    try {
      const { data, error } = authMode === 'login' 
        ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
        : await supabase.auth.signUp({ email: authEmail, password: authPassword });
      if (error) throw error;
      if (data?.user) {
        setUser(data.user);
        setIsGuest(false);
      }
      showToast("Identity Verified", 'success');
    } catch (err: any) {
      showToast(err.message || "Auth Error", 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGuestEntry = () => {
    setIsGuest(true);
    setUser(null);
    showToast("Guest Session Started", 'info');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsGuest(false);
    setActiveBrief(null);
    setHistory([]);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, visible: true, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3500);
  };

  const handleGenerateBrief = async () => {
    if (!input.trim()) {
      showToast("Please enter content", "error");
      return;
    }
    setIsProcessing(true);
    showToast(`Turbo-generating ${selectedLength} briefing...`, "info");
    
    try {
      const { title, summary, category, sources } = await generateSummary(
        input, 
        selectedTone, 
        inputMode, 
        selectedLanguage, 
        selectedLength
      );
      showToast("Syncing narration...", "info");
      const audioBase64 = await generateAudio(summary, selectedVoice, selectedLanguage);
      
      const newId = crypto.randomUUID();
      const newItem: BriefItem = {
        id: newId,
        title,
        originalText: input,
        summary,
        audioBase64,
        timestamp: Date.now(),
        category,
        tone: selectedTone,
        length: selectedLength,
        language: selectedLanguage,
        sources
      };

      setHistory(prev => [newItem, ...prev]);
      setActiveBrief(newItem);
      setInput('');

      if (user) {
        try {
          const { error } = await supabase.from('briefings').insert([{
            id: newId,
            user_id: user.id,
            title: newItem.title,
            original_text: newItem.originalText,
            summary: newItem.summary,
            timestamp: newItem.timestamp,
            category: newItem.category,
            tone: newItem.tone
          }]);
          if (error) console.warn("DB Sync issue (local backup used).", error);
          else showToast("Cloud Synced", 'success');
        } catch (dbErr) {
          console.error("Database sync issue:", dbErr);
        }
      } else {
        showToast("Briefing Ready", 'success');
      }
    } catch (error: any) {
      console.error("Process Error:", error);
      showToast(error.message || "Synthesis failed", 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteBrief = async (id: string) => {
    if (!confirm("Delete permanently?")) return;
    setHistory(prev => prev.filter(item => item.id !== id));
    if (activeBrief?.id === id) setActiveBrief(null);
    try {
      if (user) await supabase.from('briefings').delete().eq('id', id).eq('user_id', user.id);
      showToast("Removed", 'success');
    } catch (err) {
      console.error("Delete sync error:", err);
    }
  };

  const downloadBrief = (item: BriefItem) => {
    if (!item.audioBase64) return;
    const blob = pcmToWavBlob(item.audioBase64);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CommuteBrief_${item.title.substring(0, 10)}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const q = searchQuery.toLowerCase();
    return history.filter(item => 
      item.title.toLowerCase().includes(q) || 
      item.category.toLowerCase().includes(q)
    );
  }, [history, searchQuery]);

  if (isInitialLoading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!user && !isGuest) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-12">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-6">
               <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center text-white text-4xl shadow-2xl shadow-slate-900/40 logo-fast">
                <i className="fa-solid fa-bolt-lightning"></i>
              </div>
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter italic">CommuteBrief</h1>
            <p className="text-slate-400 font-bold text-[10px] mt-4 uppercase tracking-[0.4em]">Personal News Narration</p>
          </div>
          <div className="flex bg-slate-50 p-1 rounded-2xl mb-8">
            <button onClick={() => setAuthMode('login')} className={`flex-1 py-3.5 text-xs font-black rounded-xl transition-all ${authMode === 'login' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-300'}`}>LOGIN</button>
            <button onClick={() => setAuthMode('signup')} className={`flex-1 py-3.5 text-xs font-black rounded-xl transition-all ${authMode === 'signup' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-300'}`}>SIGN UP</button>
          </div>
          <form onSubmit={handleAuth} className="space-y-4 mb-8">
            <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="w-full px-6 py-4 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-slate-900 outline-none text-sm font-semibold transition-all" placeholder="Email Address" required />
            <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full px-6 py-4 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-slate-900 outline-none text-sm font-semibold transition-all" placeholder="Password" required />
            <button type="submit" disabled={isAuthLoading} className="w-full py-5 bg-slate-900 text-white font-black rounded-xl shadow-xl transition-all active:scale-95 disabled:opacity-50 text-[11px] uppercase tracking-widest">
              {isAuthLoading ? 'Authenticating...' : 'Enter Dashboard'}
            </button>
          </form>
          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase font-black text-slate-300"><span className="bg-white px-4 tracking-widest">Speed First</span></div>
          </div>
          <button onClick={handleGuestEntry} className="w-full py-5 bg-white border-2 border-slate-900 text-slate-900 font-black rounded-xl hover:bg-slate-900 hover:text-white transition-all text-[11px] uppercase tracking-widest active:scale-95">
            Continue as Guest
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans selection:bg-slate-900 selection:text-white">
      {toast.visible && (
        <div className={`fixed top-8 right-8 z-[100] px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-6 ${toast.type === 'success' ? 'bg-slate-900 text-white' : toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-900'}`}>
          <div className="w-2 h-2 rounded-full bg-current animate-pulse"></div>
          <span className="font-bold text-[11px] uppercase tracking-widest">{toast.message}</span>
        </div>
      )}

      <nav className="bg-white/95 backdrop-blur-2xl border-b border-slate-50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-8 py-6 flex justify-between items-center">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white text-xl shadow-2xl logo-fast">
              <i className="fa-solid fa-bolt-lightning"></i>
            </div>
            <div>
              <span className="text-3xl font-black tracking-tighter text-slate-900 italic block leading-none">CommuteBrief</span>
              <span className="text-[9px] font-black text-slate-400 tracking-[0.2em] uppercase mt-1">
                {isGuest ? 'Turbo Mode • Guest' : 'Turbo Mode • Pro'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-8">
            {!isGuest && user && <span className="hidden md:inline text-[10px] font-bold text-slate-400 uppercase tracking-widest">{user.email}</span>}
            <button onClick={handleLogout} className="text-slate-400 hover:text-rose-600 transition-colors text-[10px] font-black uppercase tracking-widest">Log Out</button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto w-full px-8 py-12 flex-grow">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          <div className="lg:col-span-8 space-y-12">
            <div className="bg-[#fafafa] rounded-[2.5rem] p-10 border border-slate-100 shadow-sm">
              <div className="flex gap-4 mb-10">
                {(['text', 'url', 'search'] as InputMode[]).map(mode => (
                  <button key={mode} onClick={() => setInputMode(mode)} className={`px-6 py-3 rounded-xl text-[10px] font-black tracking-widest transition-all ${inputMode === mode ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 bg-white border border-slate-100 hover:border-slate-300'}`}>
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={inputMode === 'text' ? "Paste English news text here..." : inputMode === 'url' ? "URL to translate..." : "Search for news topics..."}
                className="w-full h-72 bg-white text-slate-900 font-medium border-none rounded-3xl p-8 text-2xl focus:ring-2 focus:ring-slate-900 outline-none transition-all placeholder:text-slate-200 mb-10 resize-none shadow-sm"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 px-1">Language</label>
                  <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value as Language)} className="w-full py-4 px-5 rounded-xl bg-white border border-slate-100 text-[11px] font-bold text-slate-800 outline-none shadow-sm transition-all hover:border-slate-300">
                    {Object.values(Language).map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 px-1">Voice</label>
                  <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value as VoiceName)} className="w-full py-4 px-5 rounded-xl bg-white border border-slate-100 text-[11px] font-bold text-slate-800 outline-none shadow-sm transition-all hover:border-slate-300">
                    {Object.values(VoiceName).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 px-1">Tone</label>
                  <select value={selectedTone} onChange={(e) => setSelectedTone(e.target.value as Tone)} className="w-full py-4 px-5 rounded-xl bg-white border border-slate-100 text-[11px] font-bold text-slate-800 outline-none shadow-sm transition-all hover:border-slate-300">
                    {Object.values(Tone).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 px-1">Detail</label>
                  <select value={selectedLength} onChange={(e) => setSelectedLength(e.target.value as SummaryLength)} className="w-full py-4 px-5 rounded-xl bg-white border border-slate-100 text-[11px] font-bold text-slate-800 outline-none shadow-sm transition-all hover:border-slate-300">
                    {Object.values(SummaryLength).map(sl => <option key={sl} value={sl}>{sl}</option>)}
                  </select>
                </div>
              </div>

              <button
                onClick={handleGenerateBrief}
                disabled={isProcessing}
                className="w-full py-6 bg-slate-900 hover:bg-black text-white font-black text-xs uppercase tracking-[0.3em] rounded-2xl shadow-2xl transition-all disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-4"
              >
                {isProcessing ? (
                  <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> TURBO PROCESSING...</>
                ) : `Generate ${selectedLanguage} Briefing`}
              </button>
            </div>

            {activeBrief && (
              <div className="bg-slate-900 rounded-[3rem] p-12 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-500 border border-white/5">
                <div className="flex gap-3 mb-4">
                  <span className="px-3 py-1 bg-white/10 text-white text-[9px] font-black uppercase tracking-widest rounded-lg border border-white/10">
                    {activeBrief.category}
                  </span>
                  <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-emerald-500/10">
                    {activeBrief.language}
                  </span>
                  <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-indigo-500/10">
                    {activeBrief.length}
                  </span>
                </div>
                <AudioPlayer audioBase64={activeBrief.audioBase64!} title={activeBrief.title} />
                {activeBrief.sources && activeBrief.sources.length > 0 && (
                  <div className="mt-16 pt-10 border-t border-white/5">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-8">Verified Sources</p>
                    <div className="flex flex-wrap gap-4">
                      {activeBrief.sources.map((src, idx) => (
                        <a key={idx} href={src.uri} target="_blank" rel="noopener noreferrer" className="text-[11px] text-slate-400 hover:text-white flex items-center gap-4 bg-white/5 px-8 py-4 rounded-2xl border border-white/5 transition-all hover:bg-white/10">
                          <i className="fa-solid fa-link text-[10px]"></i>
                          {src.title || 'Source'}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 flex flex-col">
            <div className="mb-10">
              <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.5em] mb-8">Recent Archives</h2>
              <div className="relative">
                <i className="fa-solid fa-search absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></i>
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by headline..."
                  className="w-full pl-16 pr-8 py-5 bg-slate-50 border border-slate-100 rounded-2xl text-[13px] outline-none focus:bg-white focus:border-slate-200 transition-all font-bold placeholder:text-slate-300 shadow-sm"
                />
              </div>
            </div>
            
            <div className="space-y-6 max-h-[85vh] overflow-y-auto pr-4 custom-scrollbar pb-10">
              {filteredHistory.length === 0 ? (
                <div className="p-20 border-2 border-dashed border-slate-100 rounded-[2.5rem] text-center bg-slate-50/20">
                  <p className="text-slate-300 font-black uppercase tracking-widest text-[11px]">Archive Empty</p>
                </div>
              ) : (
                filteredHistory.map(item => (
                  <div 
                    key={item.id} 
                    onClick={() => setActiveBrief(item)}
                    className={`p-8 rounded-[2rem] border transition-all cursor-pointer group ${activeBrief?.id === item.id ? 'bg-white border-slate-900 shadow-2xl ring-2 ring-slate-900/5' : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'}`}
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex gap-2">
                        <span className="px-2 py-0.5 bg-slate-50 text-slate-400 text-[8px] font-black uppercase tracking-widest rounded border border-slate-100">
                          {item.category}
                        </span>
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase tracking-widest rounded border border-emerald-100">
                          {item.language?.split(' ')[0] || 'EN'}
                        </span>
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[8px] font-black uppercase tracking-widest rounded border border-indigo-100">
                          {item.length}
                        </span>
                      </div>
                      <div className="flex gap-5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); downloadBrief(item); }} className="text-slate-200 hover:text-slate-900 transition-colors">
                          <i className="fa-solid fa-download text-sm"></i>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteBrief(item.id); }} className="text-slate-200 hover:text-rose-600 transition-colors">
                          <i className="fa-solid fa-trash-can text-sm"></i>
                        </button>
                      </div>
                    </div>
                    <h4 className="text-[15px] font-bold text-slate-900 line-clamp-2 leading-snug mb-3 group-hover:text-black">{item.title}</h4>
                    <div className="flex justify-between items-center pt-2">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </p>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-100"></span>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                        {item.tone}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto w-full px-8 py-20 border-t border-slate-50 text-center">
        <p className="text-[11px] font-black text-slate-200 uppercase tracking-[0.8em] italic">
          COMMUTEBRIEF &bull; TURBO 2026
        </p>
      </footer>
    </div>
  );
};

export default App;
