import { useEffect, useRef, useState } from "react";

const AD_CLIENT = "ca-pub-6135964294198582";
/** The "Spin app banner" display ad unit in AdSense. */
const AD_SLOT = "6562388893";
/** Ads only run where AdSense has approved the site; elsewhere they'd never fill. */
const AD_HOSTS = ["spin.paulgeorge.com"];
const SCRIPT_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export const adsEnabled = () => typeof location !== "undefined" && AD_HOSTS.includes(location.hostname);

/** Adds the AdSense script once. It's only loaded when a banner is first shown. */
function loadAdScript() {
  if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = SCRIPT_SRC;
  script.crossOrigin = "anonymous";
  document.head.appendChild(script);
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * A responsive AdSense banner for the editor screen. Ride mode never renders it.
 * Nothing shows offline, on other hosts, or when AdSense has no ad to fill it
 * (it marks the slot data-ad-status="unfilled", which the CSS hides).
 */
export function AdBanner() {
  const online = useOnline();
  const ref = useRef<HTMLModElement>(null);
  const show = online && adsEnabled();

  useEffect(() => {
    if (!show || !ref.current || ref.current.dataset.adsbygoogleStatus) return;
    loadAdScript();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense not available (blocked or failed); the slot just stays empty.
    }
  }, [show]);

  if (!show) return null;
  return (
    <aside className="ad-banner" aria-label="Advertisement">
      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={AD_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
