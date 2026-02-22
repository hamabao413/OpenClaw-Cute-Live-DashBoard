# OpenClaw-Cute-Live-DashBoard
OpenClaw Live Dashboard is a web UI that combines a status/metrics panel with a live scene canvas to visualize what your OpenClaw main agent is doing in real time. (Work in Progress — not finished yet.)
1) Top Status Pill (State Indicator)

A prominent state pill shows the agent’s current state with color coding:

idle (green)

working (blue)

queued / warning (yellow)

rate_limited / misconfigured (red)

This is meant to be a “one-glance” indicator of whether the system is running, waiting, throttled, or misconfigured.

2) Metrics Row (Quick Numbers)

A compact metrics area displays live operational signals (as text counters), including:

Since: how long the current state has been active

Queue: queue-ahead or queued tasks estimate

Wait: waiting time/latency indicator (when applicable)

TTFT: time-to-first-token estimate (when applicable)

TPS: tokens per second estimate (when applicable)

3) Events + Log Signals

The UI includes a lightweight “what’s happening now” section:

Events: recent event messages / signals

Logfile: which log file is currently being tailed

Last line: the latest parsed line (useful for debugging or verifying live parsing)

4) Settings Modal (Connection & Polling)

A settings dialog allows configuring the data source:

host

port

log_path

poll_interval_ms

idle_after_sec

This is where you control how the dashboard reads/refreshes data and what log source it watches.

5) Scene Canvas (Live Room Visualization)

The large canvas scene visually represents the agent’s state using “rooms”:

Multiple desks (Desk A / B / C / D) now include keyboard, mouse, and chair for completeness and more realistic depth/material feel.

Main Desk (working state): the doll/agent moves to the desk and sits on the chair facing the desk (back toward the viewer).

The chair back occludes the body/back while the head remains visible (so it looks seated naturally without covering the head).

Rest Area (idle / rate-limited): the doll returns to the rest area and sits on the sofa.

The plant has been moved slightly downward and the lamp slightly to the right (per your latest adjustments).

6) Session Auto-Switch (No Server Restart Needed)

When new sessions are created and new logs appear, the server logic automatically detects the newest log and switches tailing to it, so you don’t need to restart the server just to follow new sessions.

Development status (WIP / Not finished)

This UI is still under development:

Layout and visual details may continue to change.

Some state transitions/edge cases may still be refined.

Metrics extraction depends on the current log format and may need updates if log output changes.
