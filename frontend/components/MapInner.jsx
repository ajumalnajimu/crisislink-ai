'use client';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';

const colors = {
  medical: '#C0392B',
  rescue: '#E67E22',
  shelter: '#F1C40F',
  food: '#27AE60',
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

export default function MapInner({ center = [12.9716, 77.5946], zoom = 13, markers = [], flyToTarget = null, onLocationSelect = null, pickerPos = null }) {
  useEffect(() => {
    // Fix leafet default icon issue in Next.js
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  return (
    <div className="w-full h-full relative z-0" style={{ minHeight: '400px' }}>
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
        {markers.map((m, idx) => {
           if (m.type === 'volunteer') {
             return (
               <Marker key={`vol-${idx}`} position={m.position}>
                 <Popup className="font-sans">
                   <div className="font-bold text-slate-800 text-base">{m.name}</div>
                   <div className="text-xs text-blue-600 font-bold uppercase mt-1 tracking-wider">Active Unit</div>
                 </Popup>
               </Marker>
             );
           }
           
           return (
             <CircleMarker 
               key={`vic-${idx}`} 
               center={m.position} 
               radius={14} 
               pathOptions={{ 
                 fillColor: colors[m.need] || colors.medical, 
                 color: 'white', 
                 weight: 3, 
                 fillOpacity: 0.85 
               }}
             >
               <Popup className="font-sans">
                 <div className="font-bold text-slate-800 text-base">{m.name}</div>
                 <div className="text-sm font-bold uppercase mt-1 tracking-wider" style={{color: colors[m.need] || colors.medical}}>
                   {m.need}
                 </div>
               </Popup>
             </CircleMarker>
           );
        })}
      </MapContainer>
    </div>
  );
}
