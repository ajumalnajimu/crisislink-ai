'use client';
import { useState, useEffect } from 'react';
import AlertBanner from '@/components/AlertBanner';
import AIBriefing from '@/components/AIBriefing';
import Map from '@/components/Map';
import StatusBadge from '@/components/StatusBadge';
import Link from 'next/link';

let geoCache = {};

export default function AuthorityPage() {
  const [logs, setLogs] = useState([]);
  const [alertData, setAlertData] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [briefingContent, setBriefingContent] = useState(null);
  const [stats, setStats] = useState({ activeIncidents: 0, unitsRouting: 0 });
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('explorer');
  const [geoTrigger, setGeoTrigger] = useState(0);
  const [flyToTarget, setFlyToTarget] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [vicRes, volRes, matchRes, alertRes, briefRes] = await Promise.all([
          fetch('http://localhost:5000/api/victims').then(r => r.json()),
          fetch('http://localhost:5000/api/volunteers').then(r => r.json()),
          fetch('http://localhost:5000/api/matches').then(r => r.json()),
          fetch('http://localhost:5000/api/alerts').then(r => r.json()),
          fetch('http://localhost:5000/api/briefing/authority').then(r => r.json())
        ]);

        const newMarkers = [];
        let incidents = 0;
        let units = 0;

        if (vicRes.success && vicRes.victims) {
          Object.entries(vicRes.victims).forEach(([id, v]) => {
            if (v.status !== 'resolved') incidents++;
            if (v.lat && v.lng) {
              newMarkers.push({
                id,
                position: [v.lat, v.lng],
                type: 'victim',
                need: v.need,
                name: v.name
              });
              
              const coordKey = `${v.lat.toFixed(4)},${v.lng.toFixed(4)}`;
              if (!geoCache[coordKey]) {
                  // Fallback to local geography estimator instead of external API to prevent rate-limit crashes
                  let loc = "Unknown Region";
                  if (v.lat >= 12.5) loc = "Bangalore / Karnataka Border";
                  else if (v.lat >= 12.0) loc = "Kasaragod / Kannur Zone";
                  else if (v.lat >= 11.0) loc = "Kozhikode / Wayanad Zone";
                  else if (v.lat >= 10.3) loc = "Thrissur / Malappuram Zone";
                  else if (v.lat >= 9.8) loc = "Ernakulam (Kochi)";
                  else if (v.lat >= 9.2) loc = "Kottayam / Alappuzha";
                  else if (v.lat >= 8.8) loc = "Kollam / Pathanamthitta";
                  else loc = "Trivandrum / Deep South";
                  
                  geoCache[coordKey] = loc;
              }
            }
          });
        }

        if (volRes.success && volRes.volunteers) {
          Object.entries(volRes.volunteers).forEach(([id, v]) => {
            if (v.status === 'assigned') units++;
            if (v.lat && v.lng) {
              newMarkers.push({
                id,
                position: [v.lat, v.lng],
                type: 'volunteer',
                name: v.name
              });
            }
          });
        }
        
        setMarkers(newMarkers);
        setStats({ activeIncidents: incidents, unitsRouting: units });

        if (matchRes.success && matchRes.matches) {
          const newLogs = Object.values(matchRes.matches).map((m, i) => ({
            id: i,
            time: 'System Match',
            action: m.decisionLog || `Assigned volunteer ${m.volunteerId} to victim ${m.victimId}`
          })).reverse();
          setLogs(newLogs);
        }

        if (alertRes.success && alertRes.alerts && alertRes.alerts.length > 0) {
          setAlertData(alertRes.alerts[0].message);
        } else {
          setAlertData(null);
        }

        if (briefRes.success) {
          setBriefingContent(briefRes.briefing);
        }
      } catch (err) {
        // Silently caught polling drop
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleReassign = () => fetch('http://localhost:5000/api/reassign', { method: 'POST' });

  const filteredMarkers = activeFilter === 'all' 
    ? markers 
    : markers.filter(m => (m.type === 'victim' && m.need === activeFilter) || m.type === 'volunteer');

  const groupedCases = {};
  filteredMarkers.filter(m => m.type === 'victim').forEach(m => {
    const key = `${m.position[0].toFixed(4)},${m.position[1].toFixed(4)}`;
    const region = geoCache[key] || "Resolving...";
    if (!groupedCases[region]) groupedCases[region] = [];
    groupedCases[region].push(m);
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#fafafa] relative overflow-hidden text-slate-800">
        <div className="w-full max-w-[350px] bg-white border border-slate-300 flex flex-col pt-12 pb-6 px-10 relative z-10">
          <div className="flex justify-center mb-8">
            <h1 className="text-[2.2rem] font-black text-slate-800 tracking-tight text-center leading-[1.1]">
              CrisisLink<br/><span className="text-emerald-500 font-sans tracking-wide font-black text-xl">COMMAND</span>
            </h1>
          </div>
          
          <form className="flex flex-col gap-1.5 mb-4" onSubmit={(e) => { e.preventDefault(); setIsAuthenticated(true); }}>
            <div className="relative mb-2">
              <input 
                type="text" 
                placeholder="Phone number, username, or email" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full text-xs px-2 pt-2.5 pb-2 bg-[#fafafa] border border-slate-300 rounded-[3px] focus:outline-none focus:border-slate-400 placeholder:text-slate-500 font-regular" 
              />
            </div>
            <div className="relative mb-2">
              <input 
                type="password" 
                placeholder="Password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full text-xs px-2 pt-2.5 pb-2 bg-[#fafafa] border border-slate-300 rounded-[3px] focus:outline-none focus:border-slate-400 placeholder:text-slate-500 font-regular" 
              />
            </div>
            <button 
              type="submit" 
              disabled={!username || password.length < 6}
              className="mt-3 w-full py-1.5 font-bold text-[14px] text-white bg-[#0095f6] hover:bg-[#1877f2] disabled:opacity-70 disabled:hover:bg-[#0095f6] rounded-[8px] transition-colors"
            >
              Log in
            </button>
          </form>

          <div className="flex items-center gap-4 my-3 mb-6">
            <div className="flex-1 h-px bg-slate-300"></div>
            <span className="text-[13px] font-bold text-slate-400 uppercase">or</span>
            <div className="flex-1 h-px bg-slate-300"></div>
          </div>

          <div className="text-center">
            <button className="flex items-center justify-center gap-2 w-full text-[14px] font-bold text-[#385185] hover:text-[#283e6b] transition-colors mb-3">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              Log in with Secure ID
            </button>
            <button className="text-xs text-[#00376b] hover:text-slate-500 transition-colors">Forgot password?</button>
          </div>
        </div>

        <div className="w-full max-w-[350px] mt-2.5 py-5 bg-white border border-slate-300 flex flex-col items-center justify-center relative z-10 text-[14px]">
          <p className="text-slate-800 m-0">Don't have an account? <span className="text-[#0095f6] font-bold cursor-pointer">Sign up</span></p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent font-sans text-slate-100 pb-8 flex flex-col">
      
      {/* Top Navbar */}
      <div className="bg-slate-900/60 backdrop-blur-3xl border-b border-white/10 px-6 sm:px-8 py-5 flex items-center justify-between sticky top-0 z-50 shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
        <div className="flex items-center">
          <Link href="/" className="mr-6 p-3 bg-slate-800 rounded-xl hover:bg-slate-700 transition shadow-inner">
            <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </Link>
          <h1 className="text-2xl font-black text-white tracking-[0.2em] uppercase drop-shadow-md">Command <span className="text-emerald-400">Center</span></h1>
        </div>
        <div className="flex items-center space-x-6">
          <div className="hidden lg:flex items-center text-xs font-mono font-bold text-slate-500 tracking-wider">
            <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span> SERVER UPTIME: 99.9%</span>
            <span className="mx-4 text-slate-700">|</span>
            <span className="text-blue-400">ACTIVE UNITS: 12</span>
          </div>
          <button onClick={handleReassign} className="bg-rose-500/20 hover:bg-rose-500/40 px-5 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(225,29,72,0.3)] border border-rose-500/50 text-rose-100">
            Trigger Reassign
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1800px] w-full mx-auto grid grid-cols-1 xl:grid-cols-4 gap-8">
        
        {/* Left Column: UI Panels */}
        <div className="xl:col-span-1 flex flex-col space-y-8 h-full">
          
          <div className="transition-all duration-500">
            {alertData && (
              <div className="animate-in fade-in slide-in-from-top-8 duration-700">
                <AlertBanner message={alertData} />
              </div>
            )}
          </div>
          
          <AIBriefing 
            role="authority" 
            content={briefingContent || "Macro-level distribution is shifting. The Predictive Engine has engaged dynamic re-routing protocols. Monitor the Decision Log for automated unit reassignments."} 
          />

          <div className="flex-1 bg-slate-900/40 backdrop-blur-2xl rounded-[3rem] border border-white/10 overflow-hidden flex flex-col shadow-[0_10px_40px_rgba(0,0,0,0.5)] min-h-[500px]">
            <div className="bg-white/5 p-4 border-b border-white/10 flex justify-between items-center isolate">
              <div className="flex space-x-2 bg-black/20 p-1 rounded-xl border border-white/5 text-sm font-black uppercase tracking-wider">
                <button onClick={() => setActiveTab('logs')} className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'logs' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>System Logs</button>
                <button onClick={() => setActiveTab('explorer')} className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'explorer' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>Region Explorer</button>
              </div>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
               {activeTab === 'logs' ? (
                  logs.length > 0 ? logs.map((log, i) => (
                    <div key={log.id} className={`text-sm rounded-2xl p-4 border transition-all duration-500 ${i === 0 ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)] transform -translate-y-1' : 'bg-black/20 border-white/5 opacity-70 hover:opacity-100'}`}>
                      <span className="text-xs text-slate-500 font-mono mb-2 block font-bold tracking-widest">{log.time}</span>
                      <p className="text-slate-200 font-medium leading-relaxed">{log.action}</p>
                    </div>
                  )) : <p className="text-slate-500 text-center mt-10">No AI decisions logged yet.</p>
               ) : (
                  Object.keys(groupedCases).length > 0 ? Object.entries(groupedCases).map(([region, cases]) => (
                    <div key={region} className="mb-6 animate-in fade-in duration-500">
                      <div className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
                        <h4 className="font-bold text-slate-300 uppercase tracking-widest text-xs flex items-center">
                          <svg className="w-4 h-4 mr-2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          {region}
                        </h4>
                        <span className="bg-slate-800 text-slate-400 text-[10px] px-2.5 py-1 rounded-md font-black">{cases.length}</span>
                      </div>
                      <div className="space-y-2.5">
                        {cases.map((c, idx) => (
                          <button key={idx} onClick={() => setFlyToTarget({ pos: c.position, ts: Date.now() })} className="w-full text-left p-3.5 bg-slate-800/40 hover:bg-slate-800 border border-slate-700/50 hover:border-blue-500/50 rounded-2xl transition-all group flex justify-between items-center shadow-sm">
                            <div>
                              <div className="font-bold text-slate-200 text-sm">{c.name}</div>
                              <div className="text-[10px] uppercase font-black mt-1.5 tracking-widest" style={{color: c.need === 'medical' ? '#C0392B' : c.need === 'rescue' ? '#E67E22' : c.need === 'shelter' ? '#F1C40F' : '#27AE60'}}>{c.need} Needed</div>
                            </div>
                            <svg className="w-5 h-5 text-slate-600 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                          </button>
                        ))}
                      </div>
                    </div>
                  )) : <p className="text-slate-500 text-center mt-10">No active cases matching this filter.</p>
               )}
            </div>
          </div>
        </div>

        {/* Right Column: Global Map */}
        <div className="xl:col-span-3 bg-slate-900/40 backdrop-blur-2xl rounded-[3rem] border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] h-[70vh] xl:h-auto min-h-[600px] flex flex-col overflow-hidden">
           
           <div className="flex-1 w-full relative">
             {/* Overlays — inside the map wrapper so they never escape */}
             <div className="absolute top-4 left-4 z-[1000] bg-slate-950/90 backdrop-blur-xl border border-slate-700/50 p-4 rounded-2xl shadow-2xl pointer-events-none">
               <h4 className="text-[10px] uppercase font-black text-slate-500 mb-3 tracking-widest">Global Telemetry</h4>
               <div className="space-y-3">
                 <div className="flex items-center justify-between min-w-[150px]">
                   <span className="text-xs font-bold text-slate-300">Active Incidents</span>
                   <span className="font-black text-xl text-red-500">{stats.activeIncidents}</span>
                 </div>
                 <div className="h-px bg-slate-800 w-full"></div>
                 <div className="flex items-center justify-between min-w-[150px]">
                   <span className="text-xs font-bold text-slate-300">Units Routing</span>
                   <span className="font-black text-xl text-blue-500">{stats.unitsRouting}</span>
                 </div>
               </div>
             </div>

             {/* Legend Filter */}
             <div className="absolute top-4 right-4 z-[1000] flex space-x-2 bg-slate-950/80 backdrop-blur-xl p-2 rounded-xl border border-slate-800/50">
               <div onClick={() => setActiveFilter(activeFilter === 'medical' ? 'all' : 'medical')} className={`cursor-pointer transition-all ${activeFilter !== 'all' && activeFilter !== 'medical' ? 'opacity-30 grayscale' : 'opacity-100 hover:scale-105'}`}>
                 <StatusBadge urgency="medical" />
               </div>
               <div onClick={() => setActiveFilter(activeFilter === 'rescue' ? 'all' : 'rescue')} className={`cursor-pointer transition-all ${activeFilter !== 'all' && activeFilter !== 'rescue' ? 'opacity-30 grayscale' : 'opacity-100 hover:scale-105'}`}>
                 <StatusBadge urgency="rescue" />
               </div>
               <div onClick={() => setActiveFilter(activeFilter === 'shelter' ? 'all' : 'shelter')} className={`cursor-pointer transition-all ${activeFilter !== 'all' && activeFilter !== 'shelter' ? 'opacity-30 grayscale' : 'opacity-100 hover:scale-105'}`}>
                 <StatusBadge urgency="shelter" />
               </div>
               <div onClick={() => setActiveFilter(activeFilter === 'food' ? 'all' : 'food')} className={`cursor-pointer transition-all ${activeFilter !== 'all' && activeFilter !== 'food' ? 'opacity-30 grayscale' : 'opacity-100 hover:scale-105'}`}>
                 <StatusBadge urgency="food" />
               </div>
             </div>

             <Map markers={filteredMarkers} center={[20.5937, 78.9629]} zoom={5} flyToTarget={flyToTarget} />
           </div>
        </div>
        
      </div>
    </div>
  );
}
