import Link from "next/link";
import { Plane, LayoutDashboard, ScanLine, Glasses } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <Plane className="h-10 w-10 text-blue-400" />
          <h1 className="text-4xl font-bold tracking-tight">AeroTrack</h1>
        </div>

        {/* Tagline */}
        <h2 className="text-xl text-slate-300 mb-2">
          AI-Powered Maintenance Documentation
        </h2>
        <h3 className="text-lg text-slate-400 mb-8">for Aerospace Components</h3>

        {/* Hero statement */}
        <p className="text-lg text-slate-300 mb-10 leading-relaxed max-w-lg mx-auto">
          The mechanic works. The paperwork writes itself.
          <br />
          <span className="text-slate-400">
            Every repair generates born-digital records that feed the component&apos;s lifecycle thread — automatically.
          </span>
        </p>

        {/* Two entry paths */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-medium transition-colors text-lg"
          >
            <LayoutDashboard className="h-5 w-5" />
            Enter Dashboard
          </Link>
          <Link
            href="/capture"
            className="flex items-center justify-center gap-2 bg-white text-slate-900 hover:bg-slate-100 px-8 py-4 rounded-lg font-medium transition-colors text-lg"
          >
            <ScanLine className="h-5 w-5" />
            Open Capture Tool
          </Link>
        </div>

        {/* Smart Glasses Preview — shows the vision for hands-free capture */}
        <Link
          href="/glasses-demo"
          className="flex items-center justify-center gap-2 text-sm text-green-400 hover:text-green-300 border border-green-500/30 hover:border-green-500/50 px-6 py-3 rounded-lg font-mono transition-colors mb-12"
        >
          <Glasses className="h-4 w-4" />
          Smart Glasses Preview — Hands-Free Future
        </Link>

        {/* How it works */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-8 text-left">
          <h4 className="font-semibold text-sm text-slate-400 uppercase tracking-wide mb-4">
            How it works
          </h4>
          <ol className="space-y-3 text-sm text-slate-300">
            <li className="flex gap-3">
              <span className="text-blue-400 font-bold">1.</span>
              Mechanic scans part and sees full history
            </li>
            <li className="flex gap-3">
              <span className="text-blue-400 font-bold">2.</span>
              Works through overhaul, narrating and photographing as they go
            </li>
            <li className="flex gap-3">
              <span className="text-blue-400 font-bold">3.</span>
              AI generates 8130-3, work order, and findings report automatically
            </li>
            <li className="flex gap-3">
              <span className="text-blue-400 font-bold">4.</span>
              Mechanic reviews and signs electronically
            </li>
            <li className="flex gap-3">
              <span className="text-blue-400 font-bold">5.</span>
              Structured data feeds the digital thread
            </li>
          </ol>
        </div>

        {/* Parker positioning */}
        <p className="text-sm text-slate-500 mb-2">
          Designed to complement Parker&apos;s SkyThread and DUST Identity initiatives
        </p>
        <p className="text-sm text-slate-500 mb-1">
          AeroTrack is the capture layer.
        </p>
        <p className="text-xs text-slate-600 mt-6">
          Built for Parker Aerospace — Proof of Concept Demo
        </p>
      </div>
    </div>
  );
}
