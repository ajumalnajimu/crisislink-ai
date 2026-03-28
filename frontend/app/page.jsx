'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const [sosSending, setSosSending] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const router = useRouter();

  const handleSOS = async () => {
    if (sosSending || sosSent) return;
    setSosSending(true);

    let lat = 12.9716, lng = 77.5946; // fallback coords
    try {
      if (navigator.geolocation) {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }
    } catch {
      // Use fallback coords silently — we'll still dispatch
    }

    try {
      const res = await fetch('http://localhost:5000/api/victim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'SOS User',
          need: 'sos',
          urgency: 10,
          lat, lng,
          totalPersons: 1,
          vulnerablePersons: {},
          essentials: [],
          situation: { trapped: true },
          customMessage: 'SOS ACTIVATED FROM LANDING PAGE',
          escalated: true
        })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('crisislink_victimId', data.victimId);
        setSosSent(true);
        // Redirect to victim tracking after a brief confirmation moment
        setTimeout(() => router.push('/victim'), 1500);
      }
    } catch {
      setSosSending(false);
      alert('Connection error. Please try again or call emergency services.');
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col pt-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <div className="inline-flex items-center justify-center p-2 bg-rose-500/10 backdrop-blur-md rounded-full mb-10 shadow-sm border border-rose-500/20">
          <span className="bg-gradient-to-r from-rose-500 to-red-600 text-white text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-[0_0_15px_rgba(225,29,72,0.5)]">Live</span>
          <span className="text-sm font-bold text-rose-800 ml-3 mr-4 uppercase tracking-wide">Disaster Response Active</span>
        </div>
        
        <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
           <h1 className="text-3xl md:text-5xl font-black text-slate-800 tracking-tighter mb-4 drop-shadow-sm">
             Crisis<span className="text-rose-600">Link</span> <span className="text-slate-400 font-bold">AI</span>
           </h1>
           <p className="text-lg text-slate-500 font-medium">Intelligent real-time disaster coordination. If you are in immediate danger, press SOS now.</p>
        </div>

        {/* MASSIVE SOS BUTTON — instant dispatch, no redirect */}
        <div className="flex justify-center mb-24 relative animate-in zoom-in-75 fade-in duration-1000">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 md:w-80 md:h-80 bg-red-600 rounded-full blur-[80px] opacity-40 animate-pulse"></div>
          
          <button
            onClick={handleSOS}
            disabled={sosSending || sosSent}
            className={`relative group flex items-center justify-center w-64 h-64 md:w-80 md:h-80 rounded-full border-8 border-white transition-all duration-500 active:scale-95 ${
              sosSent
                ? 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-[0_20px_60px_-15px_rgba(16,185,129,0.7)]'
                : sosSending
                ? 'bg-gradient-to-br from-orange-500 to-red-600 shadow-[0_20px_60px_-15px_rgba(239,68,68,0.6)] animate-pulse'
                : 'bg-gradient-to-br from-red-500 to-red-700 shadow-[0_20px_60px_-15px_rgba(239,68,68,0.6)] hover:shadow-[0_20px_100px_-10px_rgba(239,68,68,0.8)] hover:scale-[1.03]'
            }`}
          >
            <div className={`absolute inset-1 rounded-full shadow-inner opacity-80 border-4 transition-opacity group-hover:opacity-100 ${sosSent ? 'bg-gradient-to-tr from-green-700 to-emerald-400 border-emerald-400/30' : 'bg-gradient-to-tr from-red-800 to-rose-500 border-red-400/30'}`}></div>
            <div className="relative z-10 flex flex-col items-center justify-center translate-y-2">
              {sosSent ? (
                <>
                  <span className="text-white text-[3.5rem] md:text-[4rem] font-black tracking-widest drop-shadow-[0_4px_10px_rgba(0,0,0,0.3)] mb-1 leading-none">✓</span>
                  <span className="text-white text-xs md:text-sm font-bold uppercase tracking-[0.2em] bg-black/20 px-4 py-2 rounded-full backdrop-blur-sm border border-white/10">Dispatched!</span>
                </>
              ) : (
                <>
                  <span className="text-white text-[5rem] md:text-[6.5rem] font-black tracking-widest drop-shadow-[0_4px_10px_rgba(0,0,0,0.3)] mb-1 leading-none">SOS</span>
                  <span className="text-white text-xs md:text-sm font-bold uppercase tracking-[0.25em] bg-black/20 px-5 py-2 rounded-full backdrop-blur-sm border border-white/10">
                    {sosSending ? 'Locating...' : 'Request Rescue'}
                  </span>
                </>
              )}
            </div>
            {/* Ripple Effects */}
            {!sosSent && <div className="absolute inset-0 rounded-full border border-red-500/50 scale-100 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]"></div>}
          </button>
        </div>

        <div className="mb-8 flex items-center justify-center gap-6 opacity-60">
          <div className="h-px bg-slate-300 w-24"></div>
          <p className="text-xs uppercase tracking-widest font-bold text-slate-500">Or Select Portal</p>
          <div className="h-px bg-slate-300 w-24"></div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Victim Link */}
          <Link href="/victim" className="group block">
            <div className="glass-panel rounded-[3rem] p-8 hover:bg-white/80 transition-all duration-500 transform hover:-translate-y-3 h-full flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-bl-full blur-2xl -z-10 group-hover:scale-150 transition-transform duration-700"></div>
              <div>
                <div className="w-20 h-20 bg-gradient-to-br from-rose-100 to-white text-rose-600 rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(225,29,72,0.3)] transition-all duration-500 border border-white">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-3 text-left tracking-tight drop-shadow-sm">Victim Portal</h2>
                <p className="text-slate-500 text-left mb-6 text-sm font-medium leading-relaxed">Report your status, request vital resources, and get live mapping with ETA from rescue units.</p>
              </div>
              <div className="text-rose-600 font-bold flex items-center uppercase tracking-wide text-sm group-hover:translate-x-2 transition-transform">
                Enter Portal <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </div>
            </div>
          </Link>

          {/* Volunteer Link */}
          <Link href="/volunteer" className="group block">
            <div className="glass-panel rounded-[3rem] p-8 hover:bg-white/80 transition-all duration-500 transform hover:-translate-y-3 h-full flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-bl-full blur-2xl -z-10 group-hover:scale-150 transition-transform duration-700"></div>
              <div>
                <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-white text-blue-600 rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(37,99,235,0.3)] transition-all duration-500 border border-white">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-3 text-left tracking-tight drop-shadow-sm">Volunteer Hub</h2>
                <p className="text-slate-500 text-sm text-left mb-6 font-medium leading-relaxed">Log your resources and location to receive dynamic AI routing and life-saving assignments.</p>
              </div>
              <div className="text-blue-600 font-bold flex items-center uppercase tracking-wide text-sm group-hover:translate-x-2 transition-transform">
                Enter Hub <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </div>
            </div>
          </Link>

          {/* Authority Link */}
          <Link href="/authority" className="group block">
            <div className="bg-slate-900/80 backdrop-blur-2xl rounded-[3rem] p-8 shadow-2xl border border-slate-700 hover:border-emerald-500/50 hover:shadow-[0_8px_40px_rgba(16,185,129,0.3)] transition-all duration-500 transform hover:-translate-y-3 h-full flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-bl-full blur-2xl -z-0 group-hover:scale-150 transition-transform duration-700"></div>
              <div className="relative z-10">
                <div className="w-20 h-20 bg-emerald-500/10 text-emerald-400 rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all duration-500 border border-emerald-500/30">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-black text-white mb-3 text-left tracking-tight">Command</h2>
                <p className="text-slate-400 text-sm text-left mb-6 font-medium leading-relaxed">Live AI briefings, heatmaps, and global resource tracking for macro coordination.</p>
              </div>
              <div className="text-emerald-400 font-bold flex items-center uppercase tracking-wide text-sm group-hover:translate-x-2 transition-transform relative z-10">
                Enter Command <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
