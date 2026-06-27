"use client";

import { useState } from "react";
import { frames, FrameData, PhotoSlot } from "@/lib/phobo-data";

export default function FrameCalibration() {
  const [frameList, setFrameList] = useState<FrameData[]>(JSON.parse(JSON.stringify(frames)));
  const [selectedFrameId, setSelectedFrameId] = useState(frames[0].id);

  const selectedFrame = frameList.find(f => f.id === selectedFrameId)!;

  const updateSlot = (slotIndex: number, field: keyof PhotoSlot, value: number) => {
    const updated = [...frameList];
    const frameIndex = updated.findIndex(f => f.id === selectedFrameId);
    updated[frameIndex].photoSlots[slotIndex] = {
      ...updated[frameIndex].photoSlots[slotIndex],
      [field]: value,
    };
    setFrameList(updated);
  };

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(frameList, null, 2));
    alert("Copied to clipboard! Overwrite public/assets/frames/frame-slots.json with this.");
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif", background: "#111", color: "#eee" }}>
      {/* Sidebar */}
      <div style={{ width: "350px", overflowY: "auto", background: "#222", padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <h2>Frame Calibration</h2>
        
        <div>
          <label>Select Frame: </label>
          <select 
            value={selectedFrameId} 
            onChange={e => setSelectedFrameId(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "5px" }}
          >
            {frameList.map(f => (
              <option key={f.id} value={f.id}>{f.name} ({f.layout})</option>
            ))}
          </select>
        </div>

        <button 
          onClick={copyJson}
          style={{ padding: "10px", background: "blue", color: "white", border: "none", cursor: "pointer", fontWeight: "bold" }}
        >
          Export & Copy JSON
        </button>

        <hr style={{ borderColor: "#444" }}/>

        <div>
          <h3>Slots for {selectedFrame.name}</h3>
          {selectedFrame.photoSlots.map((slot, index) => (
            <div key={index} style={{ background: "#333", padding: "10px", marginBottom: "10px", borderRadius: "8px" }}>
              <h4>Slot {index + 1}</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label>
                  X: 
                  <input type="number" value={slot.x} onChange={e => updateSlot(index, "x", parseInt(e.target.value) || 0)} style={{ width: "100%" }}/>
                </label>
                <label>
                  Y: 
                  <input type="number" value={slot.y} onChange={e => updateSlot(index, "y", parseInt(e.target.value) || 0)} style={{ width: "100%" }}/>
                </label>
                <label>
                  W: 
                  <input type="number" value={slot.width} onChange={e => updateSlot(index, "width", parseInt(e.target.value) || 0)} style={{ width: "100%" }}/>
                </label>
                <label>
                  H: 
                  <input type="number" value={slot.height} onChange={e => updateSlot(index, "height", parseInt(e.target.value) || 0)} style={{ width: "100%" }}/>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview Area */}
      <div style={{ flex: 1, padding: "20px", display: "flex", justifyContent: "center", alignItems: "center", background: "#000", overflow: "hidden" }}>
        
        {/* We use a wrapper with a strict aspect ratio matching 1200x1800 (or width/height) */}
        <div style={{ 
          position: "relative", 
          width: "100%", 
          height: "100%", 
          maxHeight: "90vh",
          aspectRatio: `${selectedFrame.width} / ${selectedFrame.height}`,
          background: "url(/assets/photos/placeholder-1.jpg)", 
          backgroundSize: "cover"
        }}>
          
          {/* Frame Template (over the background) */}
          <img 
            src={selectedFrame.templateUrl} 
            alt={selectedFrame.name} 
            style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0, zIndex: 10, pointerEvents: "none" }}
          />

          {/* Slots overlaid on top for calibration visualization */}
          {selectedFrame.photoSlots.map((slot, index) => (
            <div 
              key={index} 
              style={{
                position: "absolute",
                top: `${(slot.y / selectedFrame.height) * 100}%`,
                left: `${(slot.x / selectedFrame.width) * 100}%`,
                width: `${(slot.width / selectedFrame.width) * 100}%`,
                height: `${(slot.height / selectedFrame.height) * 100}%`,
                border: "2px dashed red",
                background: "rgba(255, 0, 0, 0.2)",
                zIndex: 20,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                color: "white",
                fontWeight: "bold",
                fontSize: "24px",
                pointerEvents: "none"
              }}
            >
              {index + 1}
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}
