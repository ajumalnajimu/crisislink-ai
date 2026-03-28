'use client';
import { useState, useEffect, useRef } from 'react';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  // Auth state
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Registration / operational state
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
  const [showPassword, setShowPassword] = useState(false);
  const [pickerCoords, setPickerCoords] = useState(null);

  const [activeSession, setActiveSession] = useState(true);

  // Refs to avoid stale closures in polling
  const previousVictimIdRef = useRef(null);
  const processingActionRef = useRef(false);
  const matchAcceptedRef = useRef(false);

  // Listen for Firebase auth changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      const msgs = {
        'auth/invalid-email': 'Invalid email address.',
        'auth/user-not-found': 'No account found.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/email-already-in-use': 'Account already exists.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/invalid-credential': 'Invalid email or password.',
      };
      setAuthError(msgs[err.code] || 'Authentication failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setRegistered(false);
    setVolunteerId(null);
    localStorage.removeItem('crisislink_volunteerId');
    router.push('/');
  };

  useEffect(() => {
    const savedId = localStorage.getItem('crisislink_volunteerId');
    if (savedId) {
      setVolunteerId(savedId);
      setRegistered(true);
      fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/volunteer/${savedId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.volunteer) {
            const v = data.volunteer;
            setUnitName(v.name);
            setResource(v.resource);
            setLocationStr(`${v.lat}, ${v.lng}`);
            setMyCoords({ lat: v.lat, lng: v.lng });
            if (v.status === 'en_route') { setMatchAccepted(true); matchAcceptedRef.current = true; }
          } else {
            // Backend wiped or ID invalid, clear the ghost session
            localStorage.removeItem('crisislink_volunteerId');
            setRegistered(false);
            setVolunteerId(null);
          }
        })
        .catch(() => { 
          // Network error or unreachable
          localStorage.removeItem('crisislink_volunteerId'); 
          setRegistered(false); 
          setVolunteerId(null); 
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

      const res = await fetch('${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/volunteer', {
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

  // Sync myCoords to a ref for the polling loop to use without resetting the loop
  const myCoordsRef = useRef(myCoords);
  useEffect(() => { myCoordsRef.current = myCoords; }, [myCoords]);

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
          fetch('${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/location/update', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'volunteer', id: volunteerId, lat: newLat, lng: newLng })
          }).catch(() => {});
        },
        () => {}, { enableHighAccuracy: true }
      );
    }

    const pollMatches = async () => {
      // Don't poll while user is actively accepting/declining
      if (processingActionRef.current) return;
      try {
        const res = await fetch('${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/matches');
        const data = await res.json();
        
        if (data.success && data.matches) {
           const matchEntries = Object.entries(data.matches);
           const myMatchEntry = matchEntries.find(([, m]) => m.volunteerId === volunteerId);
           
           if (myMatchEntry) {
             const [mId, myMatch] = myMatchEntry;
             setMatchId(mId);
             
             const vicRes = await fetch('${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/victims');
             const vicData = await vicRes.json();
             const victim = vicData.victims ? vicData.victims[myMatch.victimId] : null;

             if (victim) {
               if (previousVictimId && previousVictimId !== myMatch.victimId) {
                 setReassigned(true);
                 setMatchAccepted(false);
                 matchAcceptedRef.current = false;
                 setTimeout(() => setReassigned(false), 8000);
               }
               previousVictimId = myMatch.victimId;
               previousVictimIdRef.current = myMatch.victimId;

               let currentEtaStr = `${myMatch.eta || '?'} min`;
               if (myCoordsRef.current && victim.lat) {
                  currentEtaStr = `${calcDynamicETA(myCoordsRef.current.lat, myCoordsRef.current.lng, victim.lat, victim.lng, victim.situation)} min`;
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

               if (myMatch.status === 'pending' && !matchAcceptedRef.current) {
                 if (!showModal) {
                   try {
                     const ctx = new (window.AudioContext || window.webkitAudioContext)();
                     const osc = ctx.createOscillator();
                     osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime);
                     osc.connect(ctx.destination);
                     osc.start(); osc.stop(ctx.currentTime + 0.15);
                   } catch(e) { console.warn("Audio chime failed to play"); }
                 }
                 setShowModal(true);
                 if ("Notification" in window && Notification.permission === "granted") {
                   new Notification(victim.escalated ? `🚨 CRITICAL ESCALATION` : `🚨 Incoming Assignment`, {
                     body: `${victim.name} needs urgent ${victim.need}. ETA: ${currentEtaStr}`,
                     icon: '/favicon.ico'
                   });
                 }
               } else if (myMatch.status === 'accepted') {
                 setMatchAccepted(true);
                 matchAcceptedRef.current = true;
               }
             }
           } else {
             setMatchData(null); setVictimDetails(null); setShowModal(false); setMatchAccepted(false);
             matchAcceptedRef.current = false;
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
  }, [registered, volunteerId]); // removed myCoords from deps to stop infinite resets

  const handleAccept = async () => {
    processingActionRef.current = true;
    try {
      const res = await fetch('${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/match/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, volunteerId })
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setMatchAccepted(true);
      matchAcceptedRef.current = true;
      setShowModal(false);
    } catch (err) {
      console.error('Accept failed:', err);
      // Optimistically accept even if server is laggy
      setMatchAccepted(true);
      matchAcceptedRef.current = true;
      setShowModal(false);
    } finally {
      processingActionRef.current = false;
    }
  };

  const handleDecline = async () => {
    processingActionRef.current = true;
    setShowModal(false);
    if (!matchId) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/matches/${matchId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'declined' })
      });
      setMatchData(null); setVictimDetails(null);
    } catch(err) { console.error(err); }
    finally { processingActionRef.current = false; }
  };

  const handleCompleteMission = async () => {
    if (!matchId) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/matches/${matchId}/complete`, {
        method: 'POST',
      });
      setMatchData(null);
      setMatchId(null);
      setVictimDetails(null);
      setMatchAccepted(false);
      matchAcceptedRef.current = false;
      previousVictimIdRef.current = null;
      processingActionRef.current = false;
    } catch (e) {
      console.error("Failed to complete mission:", e);
    }
  };

  const endShift = () => {
    localStorage.removeItem('crisislink_volunteerId');
    setRegistered(false); setVolunteerId(null); setMatchData(null); setVictimDetails(null);
  };

  const situationLabels = { trapped: '🔒 Trapped', waterRising: '🌊 Water Rising', fireNearby: '🔥 Fire Nearby', buildingCollapse: '🏚️ Building Risk' };

  if (activeSession || authLoading) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-500">{authLoading ? 'Verifying...' : 'Restoring Check-In...'}</div>;

  // Step 1: Firebase Auth Gate
  if (!firebaseUser) {
    return (
      <div className="relative min-h-screen bg-slate-50 overflow-hidden text-slate-600 font-sans">
        {/* BLOB - solid color only */}
        <svg viewBox="0 0 566 840" preserveAspectRatio="xMaxYMid slice" className="absolute top-0 right-0 h-full w-[50%] z-0 hidden lg:block pointer-events-none">
          <path d="M342.407 73.6315C388.53 56.4007 394.378 17.3643 391.538 0H566V840H0C14.5385 834.991 100.266 804.436 77.2046 707.263C49.6393 591.11 115.306 518.927 176.468 488.873C363.385 397.026 156.98 302.824 167.945 179.32C173.46 117.209 284.755 95.1699 342.407 73.6315Z" fill="#2563eb"/>
        </svg>
        <div className="relative z-10 min-h-screen flex items-center justify-center lg:justify-start">
          <div className="w-full max-w-[420px] px-8 lg:px-0 lg:ml-[10%] animate-in fade-in slide-in-from-left-8 duration-700">
            <Link href="/" className="inline-flex mb-12 text-slate-400 hover:text-blue-500 transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </Link>
            <h1 className="text-4xl lg:text-[2.5rem] font-black text-slate-900 text-center lg:text-left mb-3 tracking-tight leading-tight">
              {isSignup ? 'Join as' : 'Welcome,'}
            </h1>
            <p className="text-3xl font-black text-blue-600 text-center lg:text-left mb-10">
              {isSignup ? 'Volunteer' : 'Volunteer'}
            </p>
            <form onSubmit={handleAuth} className="space-y-5">
              <div className="relative flex items-center bg-white rounded-3xl p-1 border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-all group">
                <input type="email" id="vol-auth-email" placeholder=" " value={email} onChange={e => setEmail(e.target.value)} required
                  className="peer w-full bg-transparent px-5 pt-8 pb-3 text-[15px] font-semibold text-slate-800 placeholder-transparent focus:outline-none" />
                <label htmlFor="vol-auth-email" className="absolute left-5 top-5 text-[15px] font-bold text-slate-400 peer-placeholder-shown:top-5 peer-focus:top-3 peer-focus:text-xs peer-focus:text-blue-500 transition-all pointer-events-none">Email Address</label>
                <svg className="w-6 h-6 absolute right-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" /></svg>
              </div>
              <div className="relative flex items-center bg-white rounded-3xl p-1 border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-all group">
                <input type={showPassword ? 'text' : 'password'} id="vol-auth-pass" placeholder=" " value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                  className="peer w-full bg-transparent px-5 pt-8 pb-3 text-[15px] font-semibold text-slate-800 placeholder-transparent focus:outline-none" />
                <label htmlFor="vol-auth-pass" className="absolute left-5 top-5 text-[15px] font-bold text-slate-400 peer-placeholder-shown:top-5 peer-focus:top-3 peer-focus:text-xs peer-focus:text-blue-500 transition-all pointer-events-none">Password</label>
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-5 text-slate-400 hover:text-blue-500 focus:outline-none transition-colors">
                  {showPassword ? (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
              {authError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-2xl">{authError}</div>}
              <button type="submit" disabled={authSubmitting} className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white font-black text-lg tracking-wide rounded-full transition-all shadow-[0_8px_24px_rgba(37,99,235,0.3)] hover:shadow-[0_12px_32px_rgba(37,99,235,0.5)] disabled:opacity-60 mt-2">
                {authSubmitting ? 'Please wait...' : (isSignup ? 'Create Account' : 'Sign In')}
              </button>
              <p className="text-center text-sm font-bold text-slate-500 pt-4">
                {isSignup ? 'Already registered?' : 'New volunteer?'}{' '}
                <button type="button" onClick={() => { setIsSignup(!isSignup); setAuthError(''); }} className="text-blue-600 hover:text-blue-700 transition-colors bg-transparent">
                  {isSignup ? 'Log In' : 'Create Account'}
                </button>
              </p>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Operational Details (shown after auth, before backend registration)
  if (!registered) {
    return (
      <div className="relative min-h-screen bg-slate-50 overflow-hidden text-slate-600 font-sans">
        
        {/* BLOB - solid color only */}
        <svg viewBox="0 0 566 840" preserveAspectRatio="xMaxYMid slice" className="absolute top-0 right-0 h-full w-[50%] z-0 hidden lg:block pointer-events-none">
          <path d="M342.407 73.6315C388.53 56.4007 394.378 17.3643 391.538 0H566V840H0C14.5385 834.991 100.266 804.436 77.2046 707.263C49.6393 591.11 115.306 518.927 176.468 488.873C363.385 397.026 156.98 302.824 167.945 179.32C173.46 117.209 284.755 95.1699 342.407 73.6315Z" fill="#2563eb"/>
        </svg>

        {/* Content - Centered vertically and horizontally */}
        <div className="relative z-10 min-h-screen flex items-center justify-center lg:justify-start">
          <div className="w-full max-w-[420px] px-8 lg:px-0 lg:ml-[10%] animate-in fade-in slide-in-from-left-8 duration-700">
            <Link href="/" className="inline-flex mb-12 text-slate-400 hover:text-blue-500 transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </Link>
            
            <h1 className="text-4xl lg:text-[2.5rem] font-black text-slate-900 text-center lg:text-left mb-12 tracking-tight leading-tight">
              Volunteer <br/>
              <span className="text-blue-600">Operations Hub</span>
            </h1>
            
            <form onSubmit={handleRegister} className="space-y-6">
              
              {/* CALL SIGN */}
              <div className="relative flex items-center bg-white rounded-3xl p-1 border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-all group">
                <input 
                    type="text" 
                    id="vol-callsign"
                    placeholder=" " 
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                    required
                    className="peer w-full bg-transparent px-5 pt-8 pb-3 text-[15px] font-semibold text-slate-800 placeholder-transparent focus:outline-none" 
                />
                <label htmlFor="vol-callsign" className="absolute left-5 top-5 text-[15px] font-bold text-slate-400 peer-placeholder-shown:top-5 peer-focus:top-3 peer-focus:text-xs peer-focus:text-blue-500 transition-all pointer-events-none">Call Sign / Unit Name</label>
                <svg className="w-6 h-6 absolute right-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>

              {/* RESOURCE SELECT */}
              <div className="relative flex items-center bg-white rounded-3xl p-1 border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-all group">
                <select 
                  id="vol-resource"
                  required 
                  value={resource} 
                  onChange={e => setResource(e.target.value)} 
                  className="w-full bg-transparent px-4 pt-8 pb-3 text-[15px] font-semibold text-slate-800 focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="medical">Medical Kit & First Aid</option>
                  <option value="rescue">Off-road Vehicle / Boat</option>
                  <option value="shelter">Temporary Shelter / Tents</option>
                  <option value="food">Water & Food Supplies</option>
                </select>
                <label htmlFor="vol-resource" className="absolute left-5 top-3 text-xs font-bold text-slate-400 group-focus-within:text-blue-500 transition-all pointer-events-none">Resource Capability</label>
                <svg className="w-6 h-6 absolute right-5 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              </div>

              {/* LOCATION INPUT */}
              <div className="relative flex items-center bg-white rounded-3xl p-1 border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-all group pr-24">
                <input 
                    type="text" 
                    id="vol-location"
                    placeholder=" " 
                    value={locationStr}
                    onChange={(e) => setLocationStr(e.target.value)}
                    required
                    className="peer w-full bg-transparent px-5 pt-8 pb-3 text-[15px] font-semibold text-slate-800 placeholder-transparent focus:outline-none" 
                />
                <label htmlFor="vol-location" className="absolute left-5 top-5 text-[15px] font-bold text-slate-400 peer-placeholder-shown:top-5 peer-focus:top-3 peer-focus:text-xs peer-focus:text-blue-500 transition-all pointer-events-none">Location GPS</label>
                
                <div className="absolute right-2 flex space-x-1">
                   <button type="button" onClick={() => setShowMapPicker(true)} className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 hover:text-blue-500 transition-colors flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                   </button>
                   <button type="button" onClick={() => {
                     if (navigator.geolocation) {
                       navigator.geolocation.getCurrentPosition(
                         pos => setLocationStr(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
                         () => alert('Could not get GPS. Please enter manually.'),
                         { timeout: 5000, enableHighAccuracy: false, maximumAge: 60000 }
                       );
                     }
                   }} className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 hover:text-blue-500 transition-colors flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" /></svg>
                   </button>
                </div>
              </div>

              <button type="submit" disabled={isGeocoding} className="w-full py-5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-lg tracking-wide rounded-full transition-all shadow-[0_8px_24px_rgba(37,99,235,0.3)] hover:shadow-[0_12px_32px_rgba(37,99,235,0.5)] flex items-center justify-center disabled:opacity-50 disabled:shadow-none mt-4">
                {isGeocoding ? 'Locking Coordinates...' : 'Go Online'}
              </button>
            </form>
          </div>
        </div>

        {/* Map Picker Modal */}
        {showMapPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[70vh]">
              <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-lg">Select Location</h3>
                  <p className="text-xs text-slate-300">Tap anywhere on the map to drop a pin</p>
                </div>
                <button type="button" onClick={() => setShowMapPicker(false)} className="text-slate-400 hover:text-white transition-colors">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 relative w-full h-full bg-slate-100">
                <Map center={myCoords ? [myCoords.lat, myCoords.lng] : [12.9716, 77.5946]} zoom={14} onLocationSelect={(latlng) => setPickerCoords(latlng)} pickerPos={pickerCoords} markers={[]} />
              </div>
              <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowMapPicker(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                <button type="button" disabled={!pickerCoords} onClick={() => { if (pickerCoords) { setMyCoords(pickerCoords); setLocationStr(`${pickerCoords.lat.toFixed(6)}, ${pickerCoords.lng.toFixed(6)}`); setShowMapPicker(false); } }} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Confirm Location</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

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
            <div className="flex items-center space-x-3">
              <button onClick={handleLogout} className={`px-4 py-2 font-bold rounded-xl text-sm transition-colors border backdrop-blur-sm ${isEscalated ? 'bg-red-900/50 text-red-100 hover:bg-red-800 border-red-500/30' : 'bg-white/40 text-slate-600 hover:bg-white/60 border-slate-300 shadow-sm'}`}>
                Switch Account
              </button>
              <button onClick={() => { localStorage.removeItem('crisislink_volunteerId'); setRegistered(false); setVolunteerId(null); setMatchData(null); setVictimDetails(null); setMatchAccepted(false); matchAcceptedRef.current = false; }} className={`px-5 py-2 font-bold rounded-xl text-sm transition-colors border shadow-sm ${isEscalated ? 'bg-red-600/90 text-white hover:bg-red-500 border-red-500' : 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-500/20'}`}>
                Change Resource
              </button>
            </div>
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
            <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
              {/* User Info Panel */}
              <div className={`p-5 rounded-2xl border backdrop-blur-xl ${isEscalated ? 'bg-red-950/50 border-red-800/50' : 'glass-panel border-white/40'}`}>
                <div className="flex items-center space-x-4 mb-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg ${isEscalated ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
                    {unitName ? unitName.charAt(0).toUpperCase() : 'V'}
                  </div>
                  <div>
                    <h3 className={`font-black text-lg ${isEscalated ? 'text-white' : 'text-slate-900'}`}>{unitName || 'Volunteer'}</h3>
                    <p className={`text-xs font-bold uppercase tracking-wider ${isEscalated ? 'text-red-300' : 'text-slate-500'}`}>{firebaseUser?.email}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${isEscalated ? 'bg-red-900 text-red-100' : 'bg-blue-100 text-blue-700'}`}>{resource}</span>
                  <span className={`px-3 py-1 rounded-lg text-xs font-bold ${isEscalated ? 'bg-red-900 text-red-200' : 'bg-slate-100 text-slate-600'}`}>📍 {locationStr || 'GPS Active'}</span>
                </div>
              </div>

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

                    <button onClick={handleCompleteMission} className={`w-full py-4 mt-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-xl transition-all hover:-translate-y-1 ${isEscalated ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_8px_30px_rgba(220,38,38,0.4)]' : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:shadow-[0_8px_30px_rgba(16,185,129,0.3)] text-white'}`}>
                      🏁 Complete Rescue Mission
                    </button>
                  </div>
                </div>
              )}
            </div>
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
