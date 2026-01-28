
import React, { useState, useEffect, useRef } from 'react';
import { decodeAudioPCM } from '../services/geminiService';

interface AudioPlayerProps {
  audioBase64: string;
  title: string;
}

const speeds = [0.8, 1, 1.25, 1.5, 2];

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioBase64, title }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const lastWallTimeRef = useRef<number>(0);
  const audioPositionRef = useRef<number>(0);
  const bufferRef = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    return () => stopPlayback();
  }, []);

  const stopPlayback = () => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (e) {}
      sourceRef.current = null;
    }
    if (isPlaying) {
      const now = Date.now();
      audioPositionRef.current += ((now - lastWallTimeRef.current) / 1000) * speed;
    }
    setIsPlaying(false);
  };

  const togglePlayback = async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (!bufferRef.current) {
      bufferRef.current = await decodeAudioPCM(audioBase64, audioCtxRef.current);
    }
    const source = audioCtxRef.current.createBufferSource();
    source.buffer = bufferRef.current;
    source.playbackRate.value = speed;
    source.connect(audioCtxRef.current.destination);
    source.onended = () => {
      if (sourceRef.current === source) {
        setIsPlaying(false);
        if (audioPositionRef.current >= (bufferRef.current?.duration || 0) * 0.98) {
          audioPositionRef.current = 0;
          setProgress(0);
        }
      }
    };
    const offset = audioPositionRef.current % (bufferRef.current.duration || 1);
    source.start(0, offset);
    sourceRef.current = source;
    lastWallTimeRef.current = Date.now();
    setIsPlaying(true);
  };

  const cycleSpeed = () => {
    const nextSpeed = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    if (sourceRef.current) {
      const now = Date.now();
      audioPositionRef.current += ((now - lastWallTimeRef.current) / 1000) * speed;
      lastWallTimeRef.current = now;
      sourceRef.current.playbackRate.value = nextSpeed;
    }
    setSpeed(nextSpeed);
  };

  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        if (bufferRef.current) {
          const now = Date.now();
          const currentAudioPos = audioPositionRef.current + ((now - lastWallTimeRef.current) / 1000) * speed;
          setProgress(Math.min((currentAudioPos / bufferRef.current.duration) * 100, 100));
        }
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, speed]);

  return (
    <div className="w-full flex flex-col items-center">
      <div className="mb-10 w-full text-center">
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Audio Briefing</p>
        <h3 className="text-2xl font-bold mb-8 text-white tracking-tight leading-tight">{title}</h3>
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-white transition-all duration-150" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between w-full max-w-xs">
        <button onClick={cycleSpeed} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-[10px] font-black text-slate-400 hover:text-white transition-all">
          {speed}x
        </button>
        <button onClick={togglePlayback} className="w-16 h-16 bg-white text-slate-900 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all">
          <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'} text-2xl ${!isPlaying ? 'ml-1' : ''}`}></i>
        </button>
        <button onClick={() => { audioPositionRef.current = 0; setProgress(0); if (isPlaying) stopPlayback(); }} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-rose-400 transition-all">
          <i className="fa-solid fa-redo-alt text-xs"></i>
        </button>
      </div>
    </div>
  );
};

export default AudioPlayer;
