export default function BackgroundDecor() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Soft ambient glow blobs, echoing the logo's blue/emerald palette */}
      <div className="absolute -top-40 left-1/2 h-[460px] w-[820px] -translate-x-1/2 animate-glow-drift rounded-full bg-info/10 blur-3xl" />
      <div
        className="absolute top-64 -right-52 h-[380px] w-[380px] animate-glow-pulse rounded-full bg-success/10 blur-3xl"
        style={{ animationDelay: "1.5s" }}
      />
      <div
        className="absolute -left-44 bottom-10 h-[340px] w-[340px] animate-glow-pulse rounded-full bg-info/[0.07] blur-3xl"
        style={{ animationDelay: "3s" }}
      />
      <div
        className="absolute top-[55%] left-1/3 h-[260px] w-[260px] animate-glow-pulse rounded-full bg-warning/[0.05] blur-3xl"
        style={{ animationDelay: "5s" }}
      />

      {/* Constellation / network mesh, matching the logo's ring pattern */}
      <svg className="absolute inset-x-0 top-0 h-[640px] w-full opacity-[0.55] [mask-image:linear-gradient(to_bottom,black,transparent)] dark:opacity-70">
        <defs>
          <pattern id="mda-constellation" width="150" height="150" patternUnits="userSpaceOnUse">
            <circle cx="18" cy="24" r="1.4" fill="var(--info)" fillOpacity="0.45" />
            <circle cx="108" cy="54" r="1.2" fill="var(--info)" fillOpacity="0.35" />
            <circle cx="64" cy="116" r="1.4" fill="var(--success)" fillOpacity="0.4" />
            <circle cx="138" cy="132" r="1" fill="var(--info)" fillOpacity="0.3" />
            <line x1="18" y1="24" x2="108" y2="54" stroke="var(--info)" strokeWidth="0.5" strokeOpacity="0.22" />
            <line x1="108" y1="54" x2="64" y2="116" stroke="var(--info)" strokeWidth="0.5" strokeOpacity="0.18" />
            <line x1="64" y1="116" x2="18" y2="24" stroke="var(--info)" strokeWidth="0.5" strokeOpacity="0.14" />
            <line x1="108" y1="54" x2="138" y2="132" stroke="var(--success)" strokeWidth="0.5" strokeOpacity="0.16" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#mda-constellation)" />
      </svg>

      {/* Fine hairline grid for extra depth, fading out with distance from the top */}
      <div
        className="absolute inset-x-0 top-0 h-[520px] w-full opacity-[0.4] [mask-image:linear-gradient(to_bottom,black,transparent)] dark:opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(to left, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
    </div>
  );
}
