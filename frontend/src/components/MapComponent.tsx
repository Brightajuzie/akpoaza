import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';

let WebView: any = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('WebView could not be loaded on this platform.', e);
  }
}

interface MapComponentProps {
  latitude: number;
  longitude: number;
  providerLat?: number;
  providerLng?: number;
  selectable?: boolean;
  onLocationSelected?: (lat: number, lng: number) => void;
  recenterTrigger?: number;
}

export default function MapComponent({
  latitude,
  longitude,
  providerLat,
  providerLng,
  selectable = false,
  onLocationSelected,
  recenterTrigger,
}: MapComponentProps) {
  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mapInitialised = useRef(false);

  // Build the initial HTML (called once for mobile, rebuilt on prop change for web)
  const getMapHtml = () => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
      <style>
        body { padding: 0; margin: 0; background: #F8F9FA; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        html, body, #map { height: 100%; width: 100vw; }
        /* Customer marker ring */
        .customer-ring {
          width: 16px; height: 16px;
          background: #007AFF;
          border: 3px solid #fff;
          border-radius: 50%;
          box-shadow: 0 0 0 4px rgba(0,122,255,0.25);
        }
        /* Provider pulse */
        .provider-pin {
          position: relative;
          width: 16px; height: 16px;
          background: #FF2D55;
          border: 2px solid #fff;
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(255,45,85,0.5);
        }
        .provider-pin::after {
          content: '';
          position: absolute;
          top: -6px; left: -6px;
          width: 24px; height: 24px;
          border: 2px solid #FF2D55;
          border-radius: 50%;
          animation: pulse 1.4s infinite ease-out;
        }
        @keyframes pulse {
          0%   { transform: scale(0.5); opacity: 0.9; }
          100% { transform: scale(2);   opacity: 0; }
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
      <script>
        var map, customerMarker, providerMarker, routeLine;

        function initMap() {
          map = L.map('map', { zoomControl: false }).setView([${latitude}, ${longitude}], 15);

          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; CartoDB'
          }).addTo(map);

          L.control.zoom({ position: 'bottomright' }).addTo(map);

          if (${selectable ? 'true' : 'false'}) {
            // ---- Selectable / draggable mode ----
            var custIcon = L.divIcon({ className: 'customer-ring', iconSize: [16, 16], iconAnchor: [8, 8] });
            customerMarker = L.marker([${latitude}, ${longitude}], { draggable: true, icon: custIcon }).addTo(map);
            customerMarker.bindPopup('<b>Drag pin to job address</b>').openPopup();

            customerMarker.on('dragend', function () {
              var pos = customerMarker.getLatLng();
              sendCoords(pos.lat, pos.lng);
            });
            map.on('click', function (e) {
              customerMarker.setLatLng(e.latlng);
              sendCoords(e.latlng.lat, e.latlng.lng);
            });
          } else {
            // ---- Live-tracking mode ----
            updateMarkers(${latitude}, ${longitude}, ${providerLat ?? 'null'}, ${providerLng ?? 'null'});
          }
        }

        function sendCoords(lat, lng) {
          var msg = JSON.stringify({ type: 'location_selected', lat: lat, lng: lng });
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(msg);
          } else {
            window.parent.postMessage(msg, '*');
          }
        }

        // Called dynamically via injectJavaScript / postMessage to update markers without reload
        function updateMarkers(custLat, custLng, provLat, provLng) {
          if (custLat != null && custLng != null) {
            if (!customerMarker) {
              var custIcon = L.divIcon({ className: 'customer-ring', iconSize: [16, 16], iconAnchor: [8, 8] });
              customerMarker = L.marker([custLat, custLng], { icon: custIcon }).addTo(map);
              customerMarker.bindPopup('<b>Service Location</b>');
            } else {
              customerMarker.setLatLng([custLat, custLng]);
            }
          }

          if (provLat != null && provLng != null) {
            if (!providerMarker) {
              var provIcon = L.divIcon({ className: 'provider-pin', iconSize: [16, 16], iconAnchor: [8, 8] });
              providerMarker = L.marker([provLat, provLng], { icon: provIcon }).addTo(map);
              providerMarker.bindPopup('<b>Handyman Live Location</b>').openPopup();
            } else {
              providerMarker.setLatLng([provLat, provLng]);
            }
          }

          // Draw / update a dashed route line between the two markers
          if (customerMarker && providerMarker) {
            var latlngs = [customerMarker.getLatLng(), providerMarker.getLatLng()];
            if (!routeLine) {
              routeLine = L.polyline(latlngs, { color: '#007AFF', weight: 2, dashArray: '6 6', opacity: 0.7 }).addTo(map);
            } else {
              routeLine.setLatLngs(latlngs);
            }
            map.fitBounds(L.latLngBounds(latlngs).pad(0.35));
          } else if (customerMarker) {
            map.setView(customerMarker.getLatLng(), 15);
          }
        }

        // Listen for update messages from the React Native host
        document.addEventListener('message', function (e) {
          try {
            var d = JSON.parse(e.data);
            if (d.type === 'update_markers') updateMarkers(d.custLat, d.custLng, d.provLat, d.provLng);
          } catch (_) {}
        });
        window.addEventListener('message', function (e) {
          try {
            var d = JSON.parse(e.data);
            if (d.type === 'location_selected' || d.type === 'update_markers') {
              if (d.type === 'update_markers') updateMarkers(d.custLat, d.custLng, d.provLat, d.provLng);
            }
          } catch (_) {}
        });

        setTimeout(initMap, 100);
      </script>
    </body>
    </html>
  `;

  // ---- Web iframe: listen for location picks ----
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'location_selected' && onLocationSelected) {
          onLocationSelected(data.lat, data.lng);
        }
      } catch (_) {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onLocationSelected]);

  // ---- Mobile WebView: push marker updates via injectJavaScript ----
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!webViewRef.current || selectable) return;

    const js = `
      (function() {
        if (typeof updateMarkers === 'function') {
          updateMarkers(${latitude}, ${longitude}, ${providerLat ?? 'null'}, ${providerLng ?? 'null'});
        }
      })();
      true;
    `;
    // Small delay to ensure map is initialised before first injection
    const t = setTimeout(() => {
      webViewRef.current?.injectJavaScript?.(js);
    }, 300);
    return () => clearTimeout(t);
  }, [latitude, longitude, providerLat, providerLng, selectable, recenterTrigger]);

  // ---- Web iframe: push marker updates via postMessage ----
  useEffect(() => {
    if (Platform.OS !== 'web' || selectable) return;
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({
        type: 'update_markers',
        custLat: latitude, custLng: longitude,
        provLat: providerLat ?? null, provLng: providerLng ?? null,
      }),
      '*'
    );
  }, [latitude, longitude, providerLat, providerLng, selectable, recenterTrigger]);

  const handleMobileMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'location_selected' && onLocationSelected) {
        onLocationSelected(data.lat, data.lng);
      }
    } catch (_) {}
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <iframe
          ref={iframeRef}
          srcDoc={getMapHtml()}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Leaflet Map"
        />
      </View>
    );
  }

  if (!WebView) {
    return (
      <View style={[styles.container, styles.fallback]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: getMapHtml() }}
        onMessage={handleMobileMessage}
        scrollEnabled={false}
        domStorageEnabled={true}
        javaScriptEnabled={true}
        style={{ flex: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E9ECEF',
  },
});
