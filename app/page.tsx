"use client";

import { useEffect, useState } from "react";
import mqtt from "mqtt";

export default function Dashboard() {
  const [nodes, setNodes] = useState({});
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");

  // Function to convert GPS coordinates to CSS percentages for the map image
  const calculateMapPosition = (lat, lon) => {
    // Bounding box for the standard India outline map
    const north = 37.6;
    const south = 8.4;
    const west = 68.7;
    const east = 97.25;

    // Calculate percentages
    let topPercent = ((north - lat) / (north - south)) * 100;
    let leftPercent = ((lon - west) / (east - west)) * 100;

    // Clamp values to ensure pins don't fly off the screen if the IP is outside India
    topPercent = Math.max(0, Math.min(100, topPercent));
    leftPercent = Math.max(0, Math.min(100, leftPercent));

    return { top: `${topPercent}%`, left: `${leftPercent}%` };
  };

  useEffect(() => {
    const client = mqtt.connect("wss://broker.hivemq.com:8000/mqtt");

    client.on("connect", () => {
      setConnectionStatus("Connected to Live Grid");
      client.subscribe("Pbtx/Grp_4/#"); 
    });

    client.on("message", async (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        
        if (payload.node_id) {
          // If we have an IP, we need to geolocate it.
          let lat = 20.5937; // Default to center of India
          let lon = 78.9629;
          let locationName = "Unknown";
          let position = { top: "50%", left: "50%" };

          if (payload.ip_address && payload.ip_address !== "Unknown") {
            try {
              // Fetch securely from your own Next.js backend proxy
              const geoResponse = await fetch(`/api/geoip?ip=${payload.ip_address}`);
              const geoData = await geoResponse.json();
              
              if (geoData.status === "success") {
                // Back to using the original JSON keys from ip-api.com
                lat = geoData.lat;
                lon = geoData.lon;
                locationName = `${geoData.city}, ${geoData.regionName}`;
                position = calculateMapPosition(lat, lon);
              }
            } catch (err) {
              console.error("Geolocation proxy fetch failed:", err);
            }
          }

          // Update the React state with the live data and the calculated map position
          setNodes((prevNodes) => ({
            ...prevNodes,
            [payload.node_id]: {
              ip: payload.ip_address || "Unknown IP",
              location: locationName,
              position: position,
              temperature: payload.temperature,
              humidity: payload.humidity,
              rf_noise: payload.rf_noise,
              last_updated: new Date().toLocaleTimeString(),
            }
          }));
        }
      } catch (error) {
        console.error("Failed to parse incoming MQTT message:", error);
      }
    });

    return () => {
      if (client) client.end();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold mb-2">Nationwide Telemetry Grid</h1>
        <p className={`text-sm ${connectionStatus === "Connecting..." ? "text-yellow-400" : "text-green-400"}`}>
          {connectionStatus}
        </p>
      </header>

      {/* Main Map Container */}
      <div className="relative max-w-2xl mx-auto border border-gray-700 rounded-2xl bg-gray-800 shadow-2xl " style={{ height: "700px" }}>
        
        {/* Map Background Image */}
        <img 
          src="/india-img.jpg" 
          alt="Map of India" 
          className="absolute inset-0 w-full h-full object-contain opacity-50 p-4"
        />

        {/* Dynamic Markers */}
        {Object.keys(nodes).map((nodeId) => {
          const node = nodes[nodeId];

          return (
            <div 
              key={nodeId} 
              className="absolute group cursor-pointer"
              style={{ top: node.position.top, left: node.position.left, transform: "translate(-50%, -100%)" }}
            >
              {/* Red Map Pin SVG */}
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="currentColor" 
                className="w-8 h-8 text-red-500 drop-shadow-lg hover:text-red-400 transition-colors duration-200"
              >
                <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>

              {/* Interactive Hover Tooltip Box */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-56 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10">
                <div className="bg-gray-900 border border-gray-600 rounded-lg p-4 shadow-xl text-sm">
                  <h3 className="font-bold text-blue-400 border-b border-gray-700 pb-1 mb-2">{nodeId}</h3>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-400">Location:</span> 
                    <span className="font-mono text-[10px]">{node.location}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-400">IP:</span> 
                    <span className="font-mono text-[10px]">{node.ip}</span>
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
                    <span className="text-gray-400">RF Noise:</span> 
                    <span className="font-mono text-red-400">{node.rf_noise}</span>
                  </div>
                  <div className="text-right text-[10px] text-gray-500 mt-2">
                    Updated: {node.last_updated}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}