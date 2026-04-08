"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { GenUIComponentProps, SandboxedWidgetArgs } from "@/lib/generative-ui-registry";

/**
 * Build the shell HTML document that gets loaded into the iframe.
 * Inspired by OpenGenerativeUI's widgetRenderer:
 * - Injects a bridge script for postMessage communication
 * - ResizeObserver reports content height back to parent
 * - Supports incremental HTML updates via update-content messages
 */
function assembleShell(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    color: #1a1a1a;
    background: transparent;
    overflow: hidden;
    padding: 12px;
  }
  #content { min-height: 20px; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e0e0e0; padding: 6px 8px; text-align: left; font-size: 12px; }
  th { background: #f5f5f5; font-weight: 600; }
  button { cursor: pointer; }
  a { color: #2563eb; }
</style>
</head>
<body>
<div id="content"></div>
<script>
(function() {
  var content = document.getElementById('content');
  var lastHeight = 0;

  function reportHeight() {
    var h = document.documentElement.scrollHeight;
    if (h !== lastHeight) {
      lastHeight = h;
      window.parent.postMessage({ type: 'widget-resize', height: h }, '*');
    }
  }

  new ResizeObserver(reportHeight).observe(content);
  reportHeight();

  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'update-content') {
      content.innerHTML = e.data.html || '';
      // Execute script tags
      var scripts = content.querySelectorAll('script');
      scripts.forEach(function(s) {
        var newScript = document.createElement('script');
        if (s.src) { newScript.src = s.src; }
        else { newScript.textContent = s.textContent; }
        s.parentNode.replaceChild(newScript, s);
      });
      setTimeout(reportHeight, 50);
    }
    if (e.data.type === 'set-theme') {
      document.body.style.color = e.data.dark ? '#e0e0e0' : '#1a1a1a';
      var ths = document.querySelectorAll('th');
      ths.forEach(function(th) { th.style.background = e.data.dark ? '#2a2a2a' : '#f5f5f5'; });
      var cells = document.querySelectorAll('th, td');
      cells.forEach(function(c) { c.style.borderColor = e.data.dark ? '#333' : '#e0e0e0'; });
    }
  });

  // Bridge: child can send prompts / user actions back
  window.sendPrompt = function(prompt) {
    window.parent.postMessage({ type: 'widget-prompt', prompt: prompt }, '*');
  };
  window.sendAction = function(action, data) {
    window.parent.postMessage({ type: 'widget-action', action: action, data: data }, '*');
  };
})();
</script>
</body>
</html>`;
}

const MAX_HEIGHT = 4000;
const MIN_HEIGHT = 80;

export function SandboxedWidget({
	toolCallId,
	status,
	args,
	result,
	respond,
}: GenUIComponentProps<SandboxedWidgetArgs>) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(MIN_HEIGHT);
	const [ready, setReady] = useState(false);
	const htmlRef = useRef(args.html ?? "");
	htmlRef.current = args.html ?? "";

	const pushContent = useCallback(() => {
		const iframe = iframeRef.current;
		if (!iframe?.contentWindow) return;
		iframe.contentWindow.postMessage(
			{ type: "update-content", html: htmlRef.current },
			"*",
		);
	}, []);

	useEffect(() => {
		function handleMessage(e: MessageEvent) {
			if (!e.data || typeof e.data !== "object") return;
			if (e.data.type === "widget-resize" && typeof e.data.height === "number") {
				setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, e.data.height)));
			}
			if (e.data.type === "widget-prompt" && typeof e.data.prompt === "string") {
				respond({ action: "prompt", prompt: e.data.prompt });
			}
			if (e.data.type === "widget-action") {
				respond({ action: e.data.action, data: e.data.data });
			}
		}
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [respond]);

	useEffect(() => {
		if (ready) {
			pushContent();
		}
	}, [ready, args.html, pushContent]);

	const handleLoad = useCallback(() => {
		setReady(true);
		pushContent();
	}, [pushContent]);

	return (
		<div
			className="rounded-2xl overflow-hidden"
			style={{
				background: "var(--color-surface)",
				border: "1px solid var(--color-border)",
			}}
		>
			{/* Header */}
			{(args.title || args.description) && (
				<div
					className="px-4 py-2.5 flex items-center gap-2"
					style={{
						borderBottom: "1px solid var(--color-border)",
						background: "var(--color-surface-hover)",
					}}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)" }}>
						<rect x="2" y="3" width="20" height="14" rx="2" />
						<path d="M8 21h8" /><path d="M12 17v4" />
					</svg>
					<div>
						{args.title && (
							<span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
								{args.title}
							</span>
						)}
						{args.description && (
							<p className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
								{args.description}
							</p>
						)}
					</div>
				</div>
			)}

			{/* Iframe */}
			<div className="relative" style={{ height, transition: "height 200ms ease" }}>
				{!ready && (
					<div
						className="absolute inset-0 flex items-center justify-center"
						style={{ background: "var(--color-surface-hover)" }}
					>
						<div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Loading widget...</div>
					</div>
				)}
				<iframe
					ref={iframeRef}
					srcDoc={assembleShell()}
					sandbox="allow-scripts"
					title={args.title ?? "Interactive widget"}
					className="w-full h-full border-0"
					style={{ display: ready ? "block" : "block", opacity: ready ? 1 : 0, transition: "opacity 200ms" }}
					onLoad={handleLoad}
				/>
			</div>
		</div>
	);
}
