"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

// Each component from our database gets a printable label with a QR code.
// These labels get printed, cut out, and taped to physical objects during
// the live demo — so when the presenter "scans" the object, the part's
// full history pops up in the Capture tool.
interface LabelComponent {
  id: string;
  partNumber: string;
  serialNumber: string;
  description: string;
  status: string;
}

export default function PrintLabelsPage() {
  const [components, setComponents] = useState<LabelComponent[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all seed components from our API
  useEffect(() => {
    async function fetchComponents() {
      const res = await fetch("/api/components");
      const data = await res.json();
      setComponents(data);
      setLoading(false);
    }
    fetchComponents();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-slate-500">Loading components...</p>
      </div>
    );
  }

  return (
    // White background, no navigation — this page is designed to be printed
    <div className="min-h-screen bg-white p-8">
      {/* Print instructions — hidden when printing */}
      <div className="print:hidden mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          AeroTrack Demo Labels
        </h1>
        <p className="text-sm text-slate-500 mb-4">
          Print this page, cut out the labels, and tape them to physical objects
          for the live demo. When scanned with the Capture tool, each label pulls
          up the part&apos;s full history.
        </p>
        <button
          onClick={() => window.print()}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Print Labels
        </button>
      </div>

      {/* Label grid — 2 columns on screen, optimized for printing */}
      <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto">
        {components.map((comp) => (
          <div
            key={comp.id}
            className="border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center text-center print:border-solid print:border-slate-400 break-inside-avoid"
          >
            {/* QR code — encodes the component's database ID so the Capture
                tool can look it up instantly when scanned */}
            <QRCodeSVG
              value={comp.id}
              size={140}
              level="M"
              includeMargin={false}
            />

            {/* Part identification info below the QR code */}
            <div className="mt-4 space-y-1">
              <p className="font-mono font-bold text-lg text-slate-900">
                {comp.partNumber}
              </p>
              <p className="font-mono text-sm text-slate-600">
                {comp.serialNumber}
              </p>
              <p className="text-sm text-slate-500">{comp.description}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wide mt-2">
                AeroTrack Demo — {comp.status}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer — hidden when printing */}
      <div className="print:hidden mt-8 text-center text-xs text-slate-400">
        <p>
          Tip: Use card stock or adhesive label paper for best results. Each
          label should be roughly 3&quot; x 4&quot;.
        </p>
      </div>
    </div>
  );
}
