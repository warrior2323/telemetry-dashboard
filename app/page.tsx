"use client";

import { useEffect, useState } from "react";
import mqtt from "mqtt";
import CryptoJS from "crypto-js";

// Define the shape of our telemetry data for TypeScript
interface TelemetryNode {
  ip: string;
  location: string;
  position: {
    top: string;
    left: string;
  };
  temperature: number;
  humidity: number;
  rf_data: number[]; // Array of 126 channels for spectrum history
  last_updated: string;
}

// 16-Byte AES Key (MUST exactly match the ESP32 key)
const AES_KEY = "1234567890123456";

export default function Dashboard() {
  const [nodes, setNodes] = useState<Record<string, TelemetryNode>>({});
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  // Function to convert GPS coordinates to CSS percentages for the map image
  const calculateMapPosition = (lat: number, lon: number) => {
    // Bounding box calibrated for standard India outline map (adjusted for slight margins)
    const north = 38.5;
    const south = 8.0;
    const west = 67.5;
    const east = 98.0;

    let topPercent = ((north - lat) / (north - south)) * 100;
    let leftPercent = ((lon - west) / (east - west)) * 100;

    topPercent = Math.max(0, Math.min(100, topPercent));
    leftPercent = Math.max(0, Math.min(100, leftPercent));

    return { top: `${topPercent}%`, left: `${leftPercent}%` };
  };

  useEffect(() => {
    // Automatically detect if the site is running on HTTP (localhost) or HTTPS (Vercel)
    const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
    
    // Choose the correct protocol and port based on the environment
    const wsProtocol = isSecure ? "wss" : "ws";
    const wsPort = isSecure ? "8884" : "8000";
    const brokerUrl = `${wsProtocol}://broker.hivemq.com:${wsPort}/mqtt`;

    // Connect dynamically
    const client = mqtt.connect(brokerUrl);

    client.on("connect", () => {
      setConnectionStatus("Connected to Secure Live Grid");
      client.subscribe("Pbtx/Grp_4/#"); 
    });

    client.on("message", async (topic: string, message: any) => {
      try {
        // 1. Receive the Base64 Encrypted String from MQTT
        const encryptedPayload = message.toString();

        // 2. Decrypt the AES payload
        const key = CryptoJS.enc.Utf8.parse(AES_KEY);
        const decryptedBytes = CryptoJS.AES.decrypt(encryptedPayload, key, {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7
        });
        
        // 3. Convert bytes back to readable JSON string
        const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);
        
        if (!decryptedText) {
          throw new Error("Decryption failed. Incorrect key or corrupted payload.");
        }

        const payload = JSON.parse(decryptedText);
        
        if (payload.node_id) {
          let lat = 20.5937; // Default to center of India
          let lon = 78.9629;
          let locationName = "Unknown";
          let position = { top: "50%", left: "50%" };

          // Priority 1: Check if the ESP32 sent exact GPS coordinates
          if (payload.lat && payload.lon) {
            lat = payload.lat;
            lon = payload.lon;
            locationName = "Kharagpur, West Bengal";
            position = calculateMapPosition(lat, lon);
          } 
          // Priority 2: Fallback to IP geolocation if no GPS data is present
          else if (payload.ip_address && payload.ip_address !== "Unknown") {
            try {
              const geoResponse = await fetch(`/api/geoip?ip=${payload.ip_address}`);
              const geoData = await geoResponse.json();
              
              if (geoData.status === "success") {
                lat = geoData.lat;
                lon = geoData.lon;
                locationName = `${geoData.city}, ${geoData.regionName}`;
                position = calculateMapPosition(lat, lon);
              }
            } catch (err) {
              console.error("Geolocation proxy fetch failed:", err);
            }
          }

          // Update the React state with the live data and the spectrum array
          setNodes((prevNodes) => ({
            ...prevNodes,
            [payload.node_id]: {
              ip: payload.ip_address || "Unknown IP",
              location: locationName,
              position: position,
              temperature: payload.temperature,
              humidity: payload.humidity,
              rf_data: payload.rf_data || [], // Map the complete channel array
              last_updated: new Date().toLocaleTimeString(),
            }
          }));
        }
      } catch (error) {
        console.error("Security/Parse Error. Incoming message rejected:", error);
      }
    });

    return () => {
      if (client) client.end();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8 font-sans select-none overflow-x-hidden">
      <header className="mb-6 md:mb-8 text-center">
        <h1 className="text-2xl md:text-4xl font-bold mb-2">Nationwide Telemetry Grid</h1>
        <p className={`text-xs md:text-sm ${connectionStatus === "Connecting..." ? "text-yellow-400" : "text-green-400"}`}>
          {connectionStatus} (AES-128 Secured)
        </p>
        <p className="text-[10px] md:text-xs text-gray-400 mt-1">Hover or Tap for Quick Specs • Click Node for Full RF Histogram Analysis</p>
      </header>

      {/* Main Map Container (Responsive Height) */}
      <div className="relative w-full max-w-2xl mx-auto border border-gray-700 rounded-2xl bg-gray-800 shadow-2xl h-[400px] sm:h-[500px] md:h-[700px]">
        
        {/* Map Background Image */}
        <img 
          src="/india-img.jpg" 
          alt="Map of India" 
          className="absolute inset-0 w-full h-full object-contain opacity-50 p-2 md:p-4 pointer-events-none"
        />

        {/* Dynamic Markers */}
        {Object.keys(nodes).map((nodeId) => {
          const node = nodes[nodeId];
          
          // Calculate max value from array to display simple peak noise representation on hover
          const peakNoise = node.rf_data.length > 0 ? Math.max(...node.rf_data) : 0;

          return (
            <div 
              key={nodeId} 
              className="absolute group cursor-pointer z-20"
              style={{ top: node.position.top, left: node.position.left, transform: "translate(-50%, -100%)" }}
              onClick={() => setActiveNodeId(nodeId)}
            >
              {/* Red Map Pin SVG (Responsive Sizing) */}
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="currentColor" 
                className="w-7 h-7 md:w-9 md:h-9 text-red-500 drop-shadow-lg group-hover:text-blue-400 transition-colors duration-200 animate-bounce-short"
              >
                <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>

              {/* Interactive Hover Tooltip Box */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 md:w-56 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-30 hidden sm:block">
                <div className="bg-gray-950 border border-gray-600 rounded-lg p-3 md:p-4 shadow-2xl text-xs md:text-sm">
                  <h3 className="font-bold text-blue-400 border-b border-gray-700 pb-1 mb-2 truncate">{nodeId}</h3>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-400">Location:</span> 
                    <span className="font-mono text-[9px] md:text-[10px] text-right max-w-[100px] md:max-w-[120px] truncate">{node.location}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-400">IP:</span> 
                    <span className="font-mono text-[9px] md:text-[10px]">{node.ip}</span>
                  </div>
                  <div className="flex justify-between mb-1 mt-2">
                    <span className="text-gray-400">Temp:</span> 
                    <span className="font-mono text-green-400">{node.temperature} &deg;C</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-400">Humidity:</span> 
                    <span className="font-mono text-blue-300">{node.humidity} %</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-400">Peak RF:</span> 
                    <span className="font-mono text-red-400">{peakNoise} %</span>
                  </div>
                  <div className="text-right text-[8px] md:text-[9px] text-gray-500 mt-2 italic">
                    Click to view full spectrum
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* FULL CROWD HISTOGRAM ANALYSIS MODAL */}
      {activeNodeId && nodes[activeNodeId] && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 transition-all duration-300">
          <div className="bg-gray-800 border border-gray-700 p-4 md:p-6 rounded-2xl max-w-5xl w-full shadow-2xl transform scale-100 max-h-[95vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-700 pb-4 mb-4 md:mb-6 gap-3 sm:gap-0">
              <div>
                <h2 className="text-lg md:text-2xl font-bold text-blue-400">RF Channel Crowd Analysis</h2>
                <p className="text-[10px] md:text-xs text-gray-400 mt-1">Real-time spectrum occupancy breakdown across 126 channels for <span className="text-white font-mono">{activeNodeId}</span></p>
              </div>
              <button 
                onClick={() => setActiveNodeId(null)} 
                className="w-full sm:w-auto bg-gray-700 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-xl transition-colors duration-200 text-sm md:text-base"
              >
                Close View
              </button>
            </div>

            {/* Histogram Visualizer Container */}
            <div className="bg-gray-900 border border-gray-950 p-3 md:p-6 rounded-xl shadow-inner mb-4">
              <div className="flex items-end h-32 md:h-64 gap-[1px] md:gap-[3px] items-stretch flex-row pt-4">
                {nodes[activeNodeId].rf_data.map((value, idx) => (
                  <div 
                    key={idx} 
                    className="flex-1 flex flex-col justify-end group/bar relative"
                  >
                    {/* Hover Value Tooltip over the single histogram bar */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 bg-blue-600 text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover/bar:opacity-100 pointer-events-none transition-opacity duration-150 z-10 whitespace-nowrap hidden sm:block">
                      Ch {idx}: {value}%
                    </div>
                    
                    {/* Dynamic Bar Graphic */}
                    <div 
                      className={`w-full rounded-t transition-all duration-300 ${
                        value > 70 ? 'bg-red-500 hover:bg-red-400' : 
                        value > 40 ? 'bg-yellow-500 hover:bg-yellow-400' : 
                        'bg-blue-500 hover:bg-blue-400'
                      }`}
                      style={{ height: `${Math.max(2, (value / 100) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
              
              {/* X-Axis labels */}
              <div className="flex justify-between text-[8px] md:text-[11px] text-gray-500 border-t border-gray-800 mt-2 pt-2 font-mono">
                <span>Ch 0 (2.4 GHz)</span>
                <span className="hidden sm:inline">Ch 62 (2.46 GHz)</span>
                <span>Ch 125 (2.52 GHz)</span>
              </div>
            </div>

            {/* General Specs Summary Inside Modal (Responsive Grid) */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 text-center text-sm font-mono mt-2">
              <div className="bg-gray-700/40 border border-gray-700/60 p-2 md:p-3 rounded-xl">
                <span className="text-gray-400 block text-[10px] md:text-xs">Temperature</span>
                <span className="text-lg md:text-xl font-bold text-green-400">{nodes[activeNodeId].temperature} °C</span>
              </div>
              <div className="bg-gray-700/40 border border-gray-700/60 p-2 md:p-3 rounded-xl">
                <span className="text-gray-400 block text-[10px] md:text-xs">Humidity</span>
                <span className="text-lg md:text-xl font-bold text-blue-400">{nodes[activeNodeId].humidity} %</span>
              </div>
              <div className="col-span-2 md:col-span-1 bg-gray-700/40 border border-gray-700/60 p-2 md:p-3 rounded-xl">
                <span className="text-gray-400 block text-[10px] md:text-xs">Node Last Synchronized</span>
                <span className="text-lg md:text-xl font-bold text-yellow-400">{nodes[activeNodeId].last_updated}</span>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}