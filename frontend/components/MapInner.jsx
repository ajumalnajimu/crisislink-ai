'use client';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState } from 'react';

const colors = {
  medical: '#C0392B',
  rescue: '#E67E22',
  shelter: '#F1C40F',
  food: '#27AE60',
  sos: '#E74C3C',
};

function FlyToController({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target && target.pos) {
      map.flyTo(target.pos, 15, { duration: 1.5 });
    }
  }, [target, map]);
  return null;
}

function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function LocationPicker({ onLocationSelect }) {
  useMapEvents({
    click(e) {
      if (onLocationSelect) {
        onLocationSelect(e.latlng);
      }
    }
  });
  return null;
}

// Fit map bounds to show both markers when route is drawn
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points && points.length >= 2) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }
  }, [points, map]);
  return null;
}

// Component to fetch and draw route between two points using OSRM
function RouteLine({ from, to }) {
  const [routeCoords, setRouteCoords] = useState(null);

  const fromKey = from ? `${from[0]},${from[1]}` : '';
  const toKey = to ? `${to[0]},${to[1]}` : '';

  useEffect(() => {
    if (!from || !to) { setRouteCoords(null); return; }

    let cancelled = false;

    const fetchRoute = async () => {
      try {
        // OSRM free routing API (lng,lat format)
        const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!cancelled && data.routes && data.routes.length > 0) {
          // GeoJSON coords are [lng, lat], Leaflet needs [lat, lng]
          const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          setRouteCoords(coords);
        }
      } catch {
        // Fall back to a straight line if routing fails
        if (!cancelled) {
          setRouteCoords([from, to]);
        }
      }
    };

    fetchRoute();
    return () => { cancelled = true; };
  }, [fromKey, toKey]);

  if (!routeCoords) return null;

  return (
    <>
      {/* Shadow line for depth */}
      <Polyline
        positions={routeCoords}
        pathOptions={{
          color: '#000',
          weight: 8,
          opacity: 0.15,
        }}
      />
      {/* Main route line */}
      <Polyline
        positions={routeCoords}
        pathOptions={{
          color: '#4338CA',
          weight: 5,
          opacity: 0.9,
          dashArray: null,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      {/* Animated dash overlay */}
      <Polyline
        positions={routeCoords}
        pathOptions={{
          color: '#818CF8',
          weight: 3,
          opacity: 0.7,
          dashArray: '10, 15',
          lineCap: 'round',
          className: 'animate-route'
        }}
      />
      <FitBounds points={[routeCoords[0], routeCoords[routeCoords.length - 1]]} />
    </>
  );
}

// Custom volunteer icon (blue pin)
function createVolunteerIcon() {
  return L.divIcon({
    html: `<div style="
      width: 36px; height: 36px; 
      background: linear-gradient(135deg, #3B82F6, #1D4ED8); 
      border-radius: 50% 50% 50% 0; 
      transform: rotate(-45deg); 
      border: 3px solid white; 
      box-shadow: 0 4px 12px rgba(29,78,216,0.4);
      display: flex; align-items: center; justify-content: center;
    "><div style="transform: rotate(45deg); color: white; font-weight: 900; font-size: 14px;">V</div></div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
}

// Custom victim icon (red pulsing dot)
function createVictimIcon(need) {
  const color = colors[need] || colors.medical;
  return L.divIcon({
    html: `<div style="position: relative;">
      <div style="
        width: 20px; height: 20px; 
        background: ${color}; 
        border-radius: 50%; 
        border: 3px solid white; 
        box-shadow: 0 2px 8px ${color}88;
        position: relative; z-index: 2;
      "></div>
      <div style="
        position: absolute; top: -6px; left: -6px;
        width: 32px; height: 32px;
        background: ${color}40;
        border-radius: 50%;
        animation: ping 2s cubic-bezier(0,0,0.2,1) infinite;
      "></div>
    </div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -14],
  });
}

export default function MapInner({ center = [12.9716, 77.5946], zoom = 13, markers = [], flyToTarget = null, onLocationSelect = null, pickerPos = null, routeFrom = null, routeTo = null }) {
  useEffect(() => {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  // Extract volunteer and victim positions for routing
  const volunteerMarker = markers.find(m => m.type === 'volunteer');
  const victimMarker = markers.find(m => m.type === 'victim');
  const fromPos = routeFrom || (volunteerMarker ? volunteerMarker.position : null);
  const toPos = routeTo || (victimMarker ? victimMarker.position : null);

  return (
    <div className="w-full h-full relative z-0" style={{ minHeight: '400px' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        .animate-route {
          animation: flow 1s linear infinite;
        }
        @keyframes flow {
          to { stroke-dashoffset: -25; }
        }
      `}} />
      <MapContainer 
        center={center} 
        zoom={zoom} 
        scrollWheelZoom={true} 
        style={{ height: '100%', width: '100%' }}
        className="rounded-xl shadow-inner border border-slate-200"
        minZoom={3}
        maxBounds={[[-85, -180], [85, 180]]}
        maxBoundsViscosity={1.0}
        zoomControl={false}
      >
        <MapInvalidator />
        {flyToTarget && <FlyToController target={flyToTarget} />}
        {onLocationSelect && <LocationPicker onLocationSelect={onLocationSelect} />}
        {pickerPos && (
          <Marker position={pickerPos}>
            <Popup className="font-sans">
              <div className="font-bold text-slate-800 text-sm">Selected Drop Point</div>
            </Popup>
          </Marker>
        )}
        <ZoomControl position="bottomright" />
        <TileLayer
          attribution='&copy; Google Maps'
          url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
          noWrap={true}
        />

        {/* Route line between volunteer and victim */}
        {fromPos && toPos && <RouteLine from={fromPos} to={toPos} />}

        {markers.map((m, idx) => {
           if (m.type === 'volunteer') {
             return (
               <Marker key={`vol-${idx}`} position={m.position} icon={createVolunteerIcon()}>
                 <Popup className="font-sans">
                   <div className="font-bold text-slate-800 text-base">{m.name}</div>
                   <div className="text-xs text-blue-600 font-bold uppercase mt-1 tracking-wider">Active Unit</div>
                 </Popup>
               </Marker>
             );
           }
           
           return (
             <Marker key={`vic-${idx}`} position={m.position} icon={createVictimIcon(m.need)}>
               <Popup className="font-sans">
                 <div className="font-bold text-slate-800 text-base">{m.name}</div>
                 <div className="text-sm font-bold uppercase mt-1 tracking-wider" style={{color: colors[m.need] || colors.medical}}>
                   {m.need}
                 </div>
               </Popup>
             </Marker>
           );
        })}
      </MapContainer>
    </div>
  );
}
