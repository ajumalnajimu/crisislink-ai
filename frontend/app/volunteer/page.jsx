'use client';
import { useState, useEffect } from 'react';
import VolunteerCard from '@/components/VolunteerCard';
import Map from '@/components/Map';
import Link from 'next/link';

// Helper for dynamic ETA
function getSpeedMultiplier(situation = {}) {
  let mult = 1.0;
  if (situation.waterRising) mult = Math.max(mult, 2.5);
  if (situation.buildingCollapse) mult = Math.max(mult, 2.0);
  if (situation.fireNearby) mult = Math.max(mult, 1.8);
  if (situation.trapped) mult = Math.max(mult, 1.5);
  return mult;
}

function calcDynamicETA(lat1, lon1, lat2, lon2, situation, baseSpeedKmh = 40.0) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distanceKm = R * c;
  const speedMult = getSpeedMultiplier(situation);
  const effectiveSpeed = baseSpeedKmh / speedMult;
  const etaMinutes = distanceKm / effectiveSpeed * 60;
  return Math.max(1, Math.round(etaMinutes * 10) / 10);
}

export default function VolunteerPage() {
  const [registered, setRegistered] = useState(false);
  const [reassigned, setReassigned] = useState(false);
  const [volunteerId, setVolunteerId] = useState(null);
  
  const [unitName, setUnitName] = useState('');
  const [resource, setResource] = useState('medical');
  const [locationStr, setLocationStr] = useState('');
  const [myCoords, setMyCoords] = useState(null);
  
  const [matchData, setMatchData] = useState(null);
  const [matchId, setMatchId] = useState(null);
  const [matchAccepted, setMatchAccepted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [victimDetails, setVictimDetails] = useState(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [pickerCoords, setPickerCoords] = useState(null);

  const [activeSession, setActiveSession] = useState(true);

  useEffect(() => {
    const savedId = localStorage.getItem('crisislink_volunteerId');
    if (savedId) {
      setVolunteerId(savedId);
      setRegistered(true);
      fetch(`http://localhost:5000/api/volunteer/${savedId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.volunteer) {
            const v = data.volunteer;
            setUnitName(v.name);
            setResource(v.resource);
            setLocationStr(`${v.lat}, ${v.lng}`);
            setMyCoords({ lat: v.lat, lng: v.lng });
            if (v.status === 'en_route') setMatchAccepted(true);
          }
        })
        .finally(() => setActiveSession(false));
    } else {
      setActiveSession(false);
    }
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    
    // Request permission for push notifications
    if ("Notification" in window && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
    
    setIsGeocoding(true);
    try {
      let lat, lng;
      const parts = locationStr.split(',').map(s => s.trim());
      if (parts.length === 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
        lat = parseFloat(parts[0]); lng = parseFloat(parts[1]);
      } else {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationStr)}&limit=1`);
        const geoData = await geoRes.json();
        if (geoData && geoData.length > 0) {
          lat = parseFloat(geoData[0].lat); lng = parseFloat(geoData[0].lon);
          setLocationStr(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        } else {
          alert("Could not locate address."); setIsGeocoding(false); return;
        }
      }
      setMyCoords({ lat, lng });

      const res = await fetch('http://localhost:5000/api/volunteer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: unitName, resource, lat, lng })
      });
      const data = await res.json();
      if (data.success) {
        setVolunteerId(data.volunteerId);
        localStorage.setItem('crisislink_volunteerId', data.volunteerId);
        setRegistered(true);
      }
    } catch (err) { console.error(err); } 
    finally { setIsGeocoding(false); }
  };

  useEffect(() => {
    if (!registered || !volunteerId) return;
    let previousVictimId = null;

    let watchId;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const newLat = pos.coords.latitude; const newLng = pos.coords.longitude;
          setMyCoords({ lat: newLat, lng: newLng });
          setLocationStr(`${newLat.toFixed(6)}, ${newLng.toFixed(6)}`);
          fetch('http://localhost:5000/api/location/update', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'volunteer', id: volunteerId, lat: newLat, lng: newLng })
          }).catch(() => {});
        },
        () => {}, { enableHighAccuracy: true }
      );
    }

    const pollMatches = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/matches');
        const data = await res.json();
        
        if (data.success && data.matches) {
           const matchEntries = Object.entries(data.matches);
           const myMatchEntry = matchEntries.find(([, m]) => m.volunteerId === volunteerId);
           
           if (myMatchEntry) {
             const [mId, myMatch] = myMatchEntry;
             setMatchId(mId);
             
             const vicRes = await fetch('http://localhost:5000/api/victims');
             const vicData = await vicRes.json();
             const victim = vicData.victims ? vicData.victims[myMatch.victimId] : null;

             if (victim) {
               if (previousVictimId && previousVictimId !== myMatch.victimId) {
                 setReassigned(true);
                 setMatchAccepted(false);
                 setTimeout(() => setReassigned(false), 8000);
               }
               previousVictimId = myMatch.victimId;

               let currentEtaStr = `${myMatch.eta || '?'} min`;
               if (myCoords && victim.lat) {
                  currentEtaStr = `${calcDynamicETA(myCoords.lat, myCoords.lng, victim.lat, victim.lng, victim.situation)} min`;
               }

               const details = {
                 id: myMatch.victimId, name: victim.name, need: victim.need,
                 urgency: victim.urgency, totalPersons: victim.totalPersons || 1,
                 situation: victim.situation || {}, vulnerablePersons: victim.vulnerablePersons || {},
                 essentials: victim.essentials || [], customMessage: victim.customMessage || '',
                 escalated: victim.escalated || false, lat: victim.lat, lng: victim.lng
               };
               setVictimDetails(details);

               setMatchData({
                 matchedVictim: victim.name || 'Unknown',
                 need: victim.need || 'unknown', distance: currentEtaStr,
                 score: myMatch.score, lat: victim.lat, lng: victim.lng, status: myMatch.status,
               });

               if (myMatch.status === 'pending' && (!matchAccepted || myMatch.victimId !== previousVictimId)) {
                 setShowModal(true);
                 if ("Notification" in window && Notification.permission === "granted" && myMatch.victimId !== previousVictimId) {
                   new Notification(victim.escalated ? `🚨 CRITICAL ESCALATION` : `🚨 Incoming Assignment`, {
                     body: `${victim.name} needs urgent ${victim.need}. ETA: ${currentEtaStr}`,
                     icon: '/favicon.ico'
                   });
                 }
               } else if (myMatch.status === 'accepted') {
                 setMatchAccepted(true);
               }
             }
           } else {
             setMatchData(null); setVictimDetails(null); setShowModal(false); setMatchAccepted(false);
           }
        }
      } catch (err) {}
    };

    pollMatches();
    const interval = setInterval(pollMatches, 3000);
    return () => {
      clearInterval(interval);
      if (watchId !== undefined && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    };
  }, [registered, volunteerId, matchAccepted, myCoords]);

  const handleAccept = async () => {
    try {
      await fetch('http://localhost:5000/api/match/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, volunteerId })
      });
      setMatchAccepted(true); setShowModal(false);
    } catch (err) {}
  };

  const handleDecline = async () => {
    try {
      await fetch('http://localhost:5000/api/match/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, volunteerId, victimId: victimDetails?.id })
      });
      setShowModal(false); setMatchData(null); setMatchId(null); setVictimDetails(null); setMatchAccepted(false);
    } catch (err) {}
  };

  const endShift = () => {
    localStorage.removeItem('crisislink_volunteerId');
    setRegistered(false); setVolunteerId(null); setMatchData(null); setVictimDetails(null);
  };

  const situationLabels = { trapped: '🔒 Trapped', waterRising: '🌊 Water Rising', fireNearby: '🔥 Fire Nearby', buildingCollapse: '🏚️ Building Risk' };

  if (activeSession) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-500">Restoring Check-In...</div>;

  const isEscalated = victimDetails && victimDetails.escalated;

  return (
    <div className={`min-h-screen p-4 md:p-8 font-sans transition-colors duration-500 ${isEscalated ? 'bg-red-900/40 backdrop-blur-3xl' : 'bg-transparent'}`}>
      <div className="max-w-[1400px] mx-auto space-y-8">
        
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-5 rounded-[2rem] shadow-sm ${isEscalated ? 'bg-red-950/80 backdrop-blur-xl border border-red-800' : 'glass-panel border border-white/40'}`}>
          <div className="flex items-center">
            <Link href="/" className="mr-5 p-3 bg-white/50 rounded-2xl hover:bg-white/80 transition-colors shadow-sm">
              <svg className="w-6 h-6 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </Link>
            <h1 className={`text-3xl font-black tracking-tight drop-shadow-sm ${isEscalated ? 'text-red-100' : 'text-slate-900'}`}>Volunteer <span className={isEscalated ? 'text-white' : 'text-blue-600'}>Hub</span></h1>
          </div>
          {registered && (
            <button onClick={endShift} className={`px-5 py-2.5 font-bold rounded-xl text-sm transition-colors border ${isEscalated ? 'bg-red-800/80 text-red-100 hover:bg-red-700 border-red-600/50' : 'bg-white/50 text-slate-700 hover:bg-white/80 border-white/40 shadow-sm'}`}>
              End Shift
            </button>
          )}
        </div>

        {reassigned && (
          <div className="bg-yellow-400 text-yellow-900 p-5 rounded-2xl shadow-xl animate-in slide-in-from-top-4 font-bold border-4 border-yellow-500 flex items-center uppercase tracking-widest text-lg">
            ⚠️ System overridden. You have been rerouted to a higher priority victim!
          </div>
        )}

        {isEscalated && (
          <div className="bg-red-600 text-white p-6 rounded-2xl shadow-2xl animate-pulse font-black border-4 border-white flex items-center justify-center uppercase tracking-widest text-2xl">
            🚨 EMERGENCY ESCALATED! PROCEED IMMEDIATELY! 🚨
          </div>
        )}

        <div className="grid xl:grid-cols-3 gap-8">
          
          {/* Left Column */}
          <div className="xl:col-span-1 space-y-8">
            {!registered ? (
              <div className="glass-panel p-8 md:p-10 rounded-[3rem] relative overflow-hidden text-slate-800">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-bl-full blur-2xl -z-0"></div>
                <h2 className="text-2xl font-black mb-8 text-slate-800 tracking-tight relative z-10 drop-shadow-sm">Unit Check-In</h2>
                <form onSubmit={handleRegister} className="space-y-6 relative z-10">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Call Sign / Name</label>
                    <input type="text" value={unitName} onChange={e => setUnitName(e.target.value)} required className="w-full px-5 py-4 rounded-2xl glass-input font-medium" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Resource Available</label>
                    <select required value={resource} onChange={e => setResource(e.target.value)} className="w-full px-5 py-4 rounded-2xl glass-input font-medium appearance-none">
                      <option value="medical">Medical Kit & First Aid</option>
                      <option value="rescue">Off-road Vehicle / Boat</option>
                      <option value="shelter">Temporary Shelter / Tents</option>
                      <option value="food">Water & Food Supplies</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Start Location</label>
                    <div className="flex space-x-2">
                       <input type="text" value={locationStr} onChange={e => setLocationStr(e.target.value)} required className="w-full px-5 py-4 rounded-2xl glass-input font-medium" placeholder="Address or map..."/>
                       <button type="button" onClick={() => setShowMapPicker(true)} className="px-5 py-4 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white rounded-2xl flex flex-col items-center justify-center shrink-0 shadow-md">
                          <span className="text-xl">📍</span>
                       </button>
                       <button type="button" onClick={() => navigator.geolocation.getCurrentPosition(pos => setLocationStr(`${pos.coords.latitude}, ${pos.coords.longitude}`))} className="px-5 py-4 bg-slate-800 text-white rounded-2xl shadow-md font-bold hover:bg-slate-900 transition-colors">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                       </button>
                    </div>
                  </div>
                  <button type="submit" disabled={isGeocoding} className="w-full mt-6 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-[0_8px_40px_rgba(79,70,229,0.5)] transition-all hover:-translate-y-1 hover:scale-[1.01] text-white rounded-2xl font-black text-lg uppercase tracking-widest shadow-[0_8px_30px_rgba(79,70,229,0.3)]">{isGeocoding ? 'Acquiring Lock...' : 'Go Online'}</button>
                </form>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
                <VolunteerCard 
                  volunteer={matchData ? { ...matchData, name: unitName, resource } : { name: unitName, resource, matchedVictim: 'Waiting Match', distance: 'N/A', need: resource }} 
                />
                
                {/* Persistent Victim Details Panel */}
                {matchAccepted && victimDetails && (
                  <div className={`p-6 rounded-3xl backdrop-blur-xl border ${isEscalated ? 'bg-red-950/80 border-red-500/50 shadow-[0_0_40px_rgba(225,29,72,0.4)] text-white' : 'glass-panel border-white/50 text-slate-800'}`}>
                    <h3 className={`font-black uppercase tracking-widest text-sm mb-4 drop-shadow-sm ${isEscalated ? 'text-red-200' : 'text-slate-500'}`}>Victim Intelligence</h3>
                    
                    <div className="space-y-4">
                      {Object.entries(victimDetails.situation || {}).some(([,v]) => v) && (
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(victimDetails.situation).map(([key, val]) => val ? (
                            <span key={key} className={`px-3 py-1.5 rounded-lg text-xs font-bold border backdrop-blur-md ${isEscalated ? 'bg-red-900/50 text-red-100 border-red-500/50' : 'bg-rose-500/10 text-rose-700 border-rose-500/20 shadow-sm'}`}>{situationLabels[key]}</span>
                          ) : null)}
                        </div>
                      )}

                      <div className={`p-4 rounded-xl backdrop-blur-sm border ${isEscalated ? 'bg-red-900/30 border-red-800/50' : 'bg-white/40 border-white/30 shadow-inner'}`}>
                        <div className="flex justify-between font-bold mb-2"><span>Group Size:</span><span className="text-xl">{victimDetails.totalPersons}</span></div>
                        {victimDetails.vulnerablePersons?.childPresent && <div className="text-sm">👶 Child present (Age {victimDetails.vulnerablePersons.childAge})</div>}
                        {victimDetails.vulnerablePersons?.elderlyPresent && <div className="text-sm">🧓 Elderly present (Age {victimDetails.vulnerablePersons.elderlyAge})</div>}
                        {victimDetails.vulnerablePersons?.patientPresent && <div className="text-sm">🏥 Patient: {victimDetails.vulnerablePersons.patientDisease}</div>}
                      </div>

                      {victimDetails.customMessage && (
                        <div className={`p-4 rounded-xl italic border backdrop-blur-sm ${isEscalated ? 'bg-red-900/50 border-red-800/50' : 'bg-amber-100/40 border-amber-200/50 text-amber-900'}`}>{victimDetails.customMessage}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`xl:col-span-2 rounded-[3rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] h-[800px] xl:h-auto overflow-hidden relative group transition-all duration-700 backdrop-blur-3xl border ${isEscalated ? 'border-red-500/50 shadow-[0_0_60px_rgba(239,68,68,0.4)] bg-red-950/20' : 'border-white/50 bg-white/30'}`}>
             <div className="absolute top-6 left-6 right-6 z-[1000] flex justify-between items-center pointer-events-none">
               <div className="glass-panel px-6 py-3 rounded-2xl pointer-events-auto shadow-md">
                 <h3 className="font-black text-slate-800 tracking-tight text-lg drop-shadow-sm">Live Routing</h3>
               </div>
               {registered && (
                 <div className={`px-5 py-3 rounded-2xl shadow-lg border backdrop-blur-md pointer-events-auto flex items-center font-bold text-sm tracking-widest uppercase ${matchAccepted ? (isEscalated ? 'bg-red-600/90 border-red-500 text-white animate-pulse' : 'bg-emerald-500/90 border-emerald-400 text-white') : 'bg-amber-500/90 border-amber-400 text-white'}`}>
                   {matchAccepted ? (isEscalated ? 'URGENT NAVIGATING' : 'Navigating') : 'Standby'}
                 </div>
               )}
             </div>

             <Map 
               center={matchData && matchAccepted ? [matchData.lat || 10.8505, matchData.lng || 76.2711] : [10.8505, 76.2711]}
               zoom={14}
               markers={[
                 ...(() => {
                   if (!locationStr || !locationStr.includes(',')) return [];
                   const parts = locationStr.split(',').map(s => parseFloat(s.trim()));
                   if (isNaN(parts[0]) || isNaN(parts[1])) return [];
                   return [{ position: parts, type: 'volunteer', name: `${unitName} (You)` }];
                 })(),
                 ...(matchData && matchData.lat && matchAccepted ? [{ position: [matchData.lat, matchData.lng], type: 'victim', need: matchData.need, name: matchData.matchedVictim }] : [])
               ]} 
             />
          </div>
          
        </div>
      </div>

      {showModal && victimDetails && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white/95 backdrop-blur-3xl rounded-[2.5rem] shadow-2xl border border-white/40 max-w-lg w-full overflow-hidden animate-in zoom-in-95 fade-in duration-300">
            <div className={`p-8 text-white ${victimDetails.escalated ? 'bg-gradient-to-r from-red-600 to-rose-700 animate-pulse' : 'bg-gradient-to-r from-blue-600 to-indigo-600'}`}>
              <div className="flex items-center justify-between">
                 <h3 className="text-xl font-black uppercase tracking-wider drop-shadow-sm">{victimDetails.escalated ? '🚨 CRITICAL ESCALATION' : '🚨 Incoming Assignment'}</h3>
                 <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-lg text-sm font-bold border border-white/20 shadow-inner">ETA: {matchData?.distance}</span>
              </div>
              <p className="text-sm mt-3 text-white/90 font-medium">{victimDetails.name} needs urgent assistance.</p>
            </div>
            
            <div className="p-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-100/50 backdrop-blur-sm p-4 rounded-2xl border border-slate-200/50"><div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Persons</div><div className="text-2xl font-black text-slate-800">{victimDetails.totalPersons}</div></div>
                <div className="bg-slate-100/50 backdrop-blur-sm p-4 rounded-2xl border border-slate-200/50"><div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Priority</div><div className={`text-xl font-black uppercase ${victimDetails.escalated ? 'text-red-600' : 'text-slate-800'}`}>{victimDetails.escalated ? 'CRITICAL (MAX)' : victimDetails.need}</div></div>
              </div>
            </div>

            <div className="p-8 pt-0 flex space-x-4">
              <button onClick={handleDecline} className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 transition-colors text-slate-700 rounded-2xl font-black text-sm uppercase tracking-wider">✕ Decline</button>
              <button onClick={handleAccept} className="flex-[2] py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:shadow-[0_8px_30px_rgba(16,185,129,0.3)] transition-all hover:-translate-y-1 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl">✓ Accept</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Map Picker Modal */}
      {showMapPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[70vh]">
            <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">Select Location</h3>
                <p className="text-xs text-slate-300">Tap anywhere on the map to drop a pin</p>
              </div>
              <button onClick={() => setShowMapPicker(false)} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="flex-1 relative w-full h-full bg-slate-100">
              <Map 
                center={myCoords ? [myCoords.lat, myCoords.lng] : [12.9716, 77.5946]} 
                zoom={14} 
                onLocationSelect={(latlng) => setPickerCoords(latlng)}
                pickerPos={pickerCoords}
                markers={[]}
              />
            </div>
            
            <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => setShowMapPicker(false)} 
                className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                disabled={!pickerCoords}
                onClick={() => {
                  if (pickerCoords) {
                    setMyCoords(pickerCoords);
                    setLocationStr(`${pickerCoords.lat.toFixed(6)}, ${pickerCoords.lng.toFixed(6)}`);
                    setShowMapPicker(false);
                  }
                }}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Location
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
