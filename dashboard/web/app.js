(() => {
  const $ = (id) => document.getElementById(id);

  const pill = $("pill-state");
  const sinceEl = $("since");
  const queueEl = $("queue");
  const waitEl = $("wait");
  const ttftEl = $("ttft");
  const tpsEl = $("tps");
  const eventsEl = $("events");
  const logfileEl = $("logfile");
  const lastlineEl = $("lastline");

  const modal = $("modal");
  const btnSettings = $("btn-settings");
  const btnCancel = $("btn-cancel");
  const btnSave = $("btn-save");

  const cfgHost = $("host");
  const cfgPort = $("port");
  const cfgLog = $("log_path");
  const cfgPoll = $("poll_interval_ms");
  const cfgIdle = $("idle_after_sec");

  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");

  const STATE_COLORS = {
    idle: "#38d19a",
    working: "#4aa3ff",
    queued: "#ffcc66",
    warning: "#ffcc66",
    rate_limited: "#ff5f6d",
    misconfigured: "#ff5f6d",
    no_log: "#93a4b8"
  };

  let status = {
    state: "idle",
    since: Date.now() / 1000,
    log_file: "",
    queueAhead: 0,
    waitedMs: 0,
    ttft_ms: null,
    tps: null,
    lastLine: ""
  };

  // Identity from IDENTITY.md (loaded at startup)
  let identity = {
    name: "Mia",
    appearance: ""
  };

  // Parsed appearance traits
  let traits = {
    hairColor: "#5a3520",
    eyeColor: "#333",
    skinColor: "#f5deb3",
    earringColor: "#daa520",
    dressColor: null // will use state color if null
  };

  function parseAppearance(text) {
    if (!text) return;
    // Keyed color parsing (preferred): e.g. 髮色: #4a2a15 / hairColor=#4a2a15
    const pickHex = (keys, prop) => {
      const re = new RegExp(`(?:${keys.join("|")})\\s*[:=]\\s*(#(?:[0-9a-fA-F]{6}))`);
      const mm = text.match(re);
      if (mm && mm[1]) traits[prop] = mm[1];
    };
    pickHex(["hairColor","髮色","髮"], "hairColor");
    pickHex(["eyeColor","眼色","眼睛"], "eyeColor");
    pickHex(["skinColor","膚色","皮膚"], "skinColor");
    pickHex(["earringColor","耳環","earrings"], "earringColor");
    pickHex(["dressColor","衣服","服裝","dress"], "dressColor");

    // Hair color
    if (text.includes("深棕") || text.includes("咖啡色")) {
      traits.hairColor = "#4a2a15";
    } else if (text.includes("黑色") || text.includes("黑髮")) {
      traits.hairColor = "#1a1a1a";
    } else if (text.includes("金色") || text.includes("金髮")) {
      traits.hairColor = "#c4a45a";
    }
    // Eye color
    if (text.includes("棕色眼")) {
      traits.eyeColor = "#3a2510";
    } else if (text.includes("藍色眼") || text.includes("藍眸")) {
      traits.eyeColor = "#2a5a8a";
    }
    // Earrings
    if (text.includes("金色") && (text.includes("耳環") || text.includes("earring"))) {
      traits.earringColor = "#daa520";
    } else if (text.includes("銀色") && text.includes("耳環")) {
      traits.earringColor = "#c0c0c0";
    }
    // Lip color for smile
    if (text.includes("粉裸色")) {
      traits.lipColor = "#c08878";
    }
  }

  function fmtSince(tsSec) {
    const sec = Math.max(0, Math.floor(Date.now() / 1000 - tsSec));
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${mm}m`;
  }

  function setPill(st) {
    pill.textContent = st.toUpperCase();
    pill.style.borderColor = "rgba(27,42,59,.9)";
    const c = STATE_COLORS[st] || "#93a4b8";
    pill.style.boxShadow = `0 0 18px ${c}33`;
    pill.style.background = `${c}22`;
  }

  function pushEvent(type, raw) {
    const el = document.createElement("div");
    el.className = "event";
    const t = new Date().toLocaleTimeString();
    el.innerHTML = `<div class="t">${t} · ${type}</div><div class="m mono">${escapeHtml(raw || "")}</div>`;
    eventsEl.prepend(el);
    while (eventsEl.children.length > 80) eventsEl.removeChild(eventsEl.lastChild);
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function updateUI() {
    setPill(status.state);
    sinceEl.textContent = fmtSince(status.since || (Date.now() / 1000));
    queueEl.textContent = String(status.queueAhead || 0);
    waitEl.textContent = `${status.waitedMs || 0}ms`;
    ttftEl.textContent = status.ttft_ms == null ? "-" : `${status.ttft_ms}ms`;
    tpsEl.textContent = status.tps == null ? "-" : String(status.tps);
    logfileEl.textContent = status.log_file ? status.log_file : "(未設定/未找到：請到右上 Settings 設定 log_path)";
    lastlineEl.textContent = status.lastLine ? status.lastLine : "-";
  }

  // ============================================================
  // OFFICE SCENE - Interior Design
  // ============================================================
  const W = canvas.width;
  const H = canvas.height;

  // --- Room Layout ---
  const room = {
    // Main work desk (agent's desk) - center-left
    myDesk: { x: 80, y: 180, w: 200, h: 100, label: "" }, // label set after identity load
    // Guest desks A-D along the top
    desks: [
      { x: 380, y: 60, w: 120, h: 60, label: "Desk A" },
      { x: 520, y: 60, w: 120, h: 60, label: "Desk B" },
      { x: 660, y: 60, w: 120, h: 60, label: "Desk C" },
      { x: 800, y: 60, w: 120, h: 60, label: "Desk D" },
    ],
    // Rest area (sofa + plant)
    rest: { x: 620, y: 300, w: 300, h: 170, label: "休息區" },
  };

  // --- Agent (character) ---
  
  function getMyChairSeat() {
    // Must match drawMyDesk() chair geometry
    const chairX = room.myDesk.x + 74;
    const chairY = room.myDesk.y + 88;
    const chairW = 52;
    const chairH = 54;
    const backH = Math.max(14, Math.floor(chairH * 0.46));
    const seatH = Math.max(10, Math.floor(chairH * 0.22));
    const seatY = chairY + backH - 2;
    return { x: chairX + chairW / 2, y: seatY + seatH / 2 };
  }

  function getSofaSeat() {
    // Must match drawRestArea() sofa geometry
    const r = room.rest;
    const sofaX = r.x + 20;
    const seatY = r.y + 40;
    const seatW = 140;
    const seatH = 60;
    return { x: sofaX + seatW / 2, y: seatY + seatH / 2 };
  }


  function getMyChairGeom() {
    // Must match drawMyDesk() chair geometry
    const chairX = room.myDesk.x + 74;
    const chairY = room.myDesk.y + 88;
    const chairW = 52;
    const chairH = 54;
    const backH = Math.max(14, Math.floor(chairH * 0.46));
    const seatH = Math.max(10, Math.floor(chairH * 0.22));
    const seatY = chairY + backH - 2;
    return { chairX, chairY, chairW, chairH, backH, seatH, seatY };
  }

  function drawMyChairBackOccluder() {
    // Redraw the chair backrest on top of the agent to create correct occlusion
    const g = getMyChairGeom();
    fillRoundedWithGradient(g.chairX + 6, g.chairY, g.chairW - 12, g.backH, 10, [
      [0, "#242424"],
      [1, "#121212"],
    ]);
    overlayPatternClipped(g.chairX + 6, g.chairY, g.chairW - 12, g.backH, 10, MAT.fabric, 0.16);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    drawRoundedRect(g.chairX + 6, g.chairY, g.chairW - 12, g.backH, 10);
    ctx.stroke();
  }


const agent = {
    x: room.myDesk.x + 100,
    // NOTE: y represents the character's body reference point.
    // Keep the character *below* the desk surface (avoid looking like standing on the desk).
    y: room.myDesk.y + room.myDesk.h + 30,
    vx: 0, vy: 0,
    target: { x: room.myDesk.x + 100, y: room.myDesk.y + room.myDesk.h + 30 },
    mood: "idle",
    bob: 0,
    frame: 0,
  };

  function setTargetByState(st) {
    if (st === "working") {
      // Sit on the chair at own desk (back facing us)
      const seat = getMyChairSeat();
      agent.target = { x: seat.x, y: seat.y - 10 };
      agent.mood = "working";
    } else if (st === "queued") {
      // Stand near Desk B waiting
      agent.target = { x: room.desks[1].x + 60, y: room.desks[1].y + 90 };
      agent.mood = "queued";
    } else if (st === "rate_limited") {
      // Go to rest area and sit on the sofa
      const seat = getSofaSeat();
      agent.target = { x: seat.x, y: seat.y + 6 };
      agent.mood = st;
    } else if (st === "misconfigured" || st === "no_log") {
      // Stand near Desk D confused
      agent.target = { x: room.desks[3].x + 60, y: room.desks[3].y + 90 };
      agent.mood = st;
    } else {
      // idle: go to rest area and relax on the sofa
      const seat = getSofaSeat();
      agent.target = { x: seat.x, y: seat.y + 6 };
      agent.mood = "idle";
    }
  }

  function step(dt) {
    const speed = 100;
    const dx = agent.target.x - agent.x;
    const dy = agent.target.y - agent.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      agent.vx = (dx / dist) * speed;
      agent.vy = (dy / dist) * speed;
      agent.x += agent.vx * dt;
      agent.y += agent.vy * dt;
    } else {
      agent.vx = 0; agent.vy = 0;
    }
    agent.bob += dt * 4;
    agent.frame += dt;
  }

  // --- Drawing helpers ---
  function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }


  // --- Materials (patterns + gradients) ---
  // 目的：在不引入圖片資產的前提下，讓 2D 物件呈現更明顯的立體與材質感（木紋 / 布料 / 金屬）。
  const MAT = { wood: null, fabric: null, metal: null };

  function seededRand(seed) {
    // Deterministic PRNG (xorshift32)
    let x = (seed >>> 0) || 1;
    return () => {
      x ^= (x << 13) >>> 0;
      x ^= (x >>> 17) >>> 0;
      x ^= (x << 5) >>> 0;
      return (x >>> 0) / 4294967296;
    };
  }

  function makePatternWood() {
    const c = document.createElement("canvas");
    c.width = 96; c.height = 96;
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, c.width, c.height);

    // Base subtle grain lines
    const rnd = seededRand(1337);
    g.globalAlpha = 0.20;
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const y = i * 10 + rnd() * 6;
      g.beginPath();
      for (let x = -10; x <= 106; x += 10) {
        const yy = y + Math.sin((x + i * 17) * 0.12) * 2.2;
        g.lineTo(x, yy);
      }
      g.stroke();
    }

    // Darker streaks
    g.globalAlpha = 0.14;
    g.strokeStyle = "rgba(0,0,0,0.55)";
    for (let i = 0; i < 6; i++) {
      const y = i * 16 + rnd() * 8;
      g.beginPath();
      for (let x = -10; x <= 106; x += 12) {
        const yy = y + Math.sin((x + i * 23) * 0.10) * 2.6;
        g.lineTo(x, yy);
      }
      g.stroke();
    }

    // Tiny pores
    g.globalAlpha = 0.10;
    for (let i = 0; i < 140; i++) {
      const x = rnd() * 96;
      const y = rnd() * 96;
      const a = 0.08 + rnd() * 0.18;
      g.fillStyle = `rgba(0,0,0,${a})`;
      g.fillRect(x, y, 1, 1);
    }

    return ctx.createPattern(c, "repeat");
  }

  function makePatternFabric() {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, 64, 64);
    g.globalAlpha = 0.18;
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.lineWidth = 1;
    for (let i = -64; i <= 128; i += 6) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 64, 64);
      g.stroke();
    }
    g.globalAlpha = 0.10;
    g.strokeStyle = "rgba(0,0,0,0.45)";
    for (let i = -64; i <= 128; i += 7) {
      g.beginPath();
      g.moveTo(i, 64);
      g.lineTo(i + 64, 0);
      g.stroke();
    }
    return ctx.createPattern(c, "repeat");
  }

  function makePatternMetal() {
    const c = document.createElement("canvas");
    c.width = 80; c.height = 80;
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, 80, 80);
    g.globalAlpha = 0.16;
    g.strokeStyle = "rgba(255,255,255,0.10)";
    g.lineWidth = 1;
    for (let y = 0; y <= 80; y += 4) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(80, y);
      g.stroke();
    }
    g.globalAlpha = 0.08;
    g.strokeStyle = "rgba(0,0,0,0.50)";
    for (let y = 2; y <= 80; y += 6) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(80, y);
      g.stroke();
    }
    return ctx.createPattern(c, "repeat");
  }

  function initMaterials() {
    // Patterns are intentionally subtle; gradients do most of the depth.
    MAT.wood = makePatternWood();
    MAT.fabric = makePatternFabric();
    MAT.metal = makePatternMetal();
  }

  function fillRoundedWithGradient(x, y, w, h, r, stops, vertical = true) {
    const g = vertical ? ctx.createLinearGradient(x, y, x, y + h) : ctx.createLinearGradient(x, y, x + w, y);
    for (const [pos, color] of stops) g.addColorStop(pos, color);
    ctx.fillStyle = g;
    drawRoundedRect(x, y, w, h, r);
    ctx.fill();
  }

  function overlayPatternClipped(x, y, w, h, r, pattern, alpha) {
    if (!pattern || alpha <= 0) return;
    ctx.save();
    drawRoundedRect(x, y, w, h, r);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pattern;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function drawDeskShadow(x, y, w, h, depth = 16) {
    // Soft ground shadow to suggest height.
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + depth, w * 0.42, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawKeyboard(x, y, w, h, keyAlpha = 0.07) {
    ctx.save();

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    drawRoundedRect(x + 1, y + 2, w, h, 3);
    ctx.fill();

    // Body
    fillRoundedWithGradient(x, y, w, h, 3, [
      [0, "#2b2b2b"],
      [1, "#141414"],
    ]);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    drawRoundedRect(x, y, w, h, 3);
    ctx.stroke();

    // Keys (very light)
    ctx.save();
    drawRoundedRect(x, y, w, h, 3);
    ctx.clip();
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(255,255,255,${keyAlpha})`;
    const cols = 9;
    const rows = 2;
    const pad = 3;
    const kw = (w - pad * 2) / cols;
    const kh = (h - pad * 2) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const kx = x + pad + c * kw + 0.8;
        const ky = y + pad + r * kh + 0.8;
        ctx.fillRect(kx, ky, kw - 1.6, kh - 1.6);
      }
    }
    // Top specular strip
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 2, y + 2, w - 4, 2);
    ctx.restore();

    ctx.restore();
  }

  function drawMouse(cx, cy, rx, ry) {
    ctx.save();
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + 2, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const g = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
    g.addColorStop(0, "#2a2a2a");
    g.addColorStop(1, "#111111");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Highlight
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.25, cy - ry * 0.25, rx * 0.35, ry * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Scroll line
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry * 0.55);
    ctx.lineTo(cx, cy + ry * 0.10);
    ctx.stroke();

    ctx.restore();
  }

  function drawChair(x, y, w, h, fabricBase = "#232323") {
    // x,y 是椅背頂部；椅子整體高度 h。
    ctx.save();

    const backH = Math.max(14, Math.floor(h * 0.46));
    const seatH = Math.max(10, Math.floor(h * 0.22));
    const seatY = y + backH - 2;
    const baseY = seatY + seatH;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h - 2, w * 0.40, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Backrest (fabric)
    fillRoundedWithGradient(x + 6, y, w - 12, backH, 10, [
      [0, fabricBase],
      [1, "#121212"],
    ]);
    overlayPatternClipped(x + 6, y, w - 12, backH, 10, MAT.fabric, 0.16);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    drawRoundedRect(x + 6, y, w - 12, backH, 10);
    ctx.stroke();

    // Seat (fabric)
    fillRoundedWithGradient(x + 2, seatY, w - 4, seatH, 10, [
      [0, "#1f1f1f"],
      [1, "#0f0f0f"],
    ]);
    overlayPatternClipped(x + 2, seatY, w - 4, seatH, 10, MAT.fabric, 0.14);

    // Stem (metal)
    ctx.save();
    ctx.globalAlpha = 0.9;
    fillRoundedWithGradient(x + w / 2 - 3, baseY - 1, 6, h - (baseY - y) - 6, 3, [
      [0, "#3a3a3a"],
      [1, "#141414"],
    ]);
    overlayPatternClipped(x + w / 2 - 3, baseY - 1, 6, h - (baseY - y) - 6, 3, MAT.metal, 0.10);
    ctx.restore();

    // Base
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h - 10);
    ctx.lineTo(x + w / 2 - w * 0.30, y + h - 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h - 10);
    ctx.lineTo(x + w / 2 + w * 0.30, y + h - 4);
    ctx.stroke();

    ctx.restore();
  }

  initMaterials();

  // --- Floor ---
  function drawFloor() {
    ctx.save();
    for (let y = 0; y < H; y += 30) {
      ctx.fillStyle = y % 60 === 0 ? "#1a1510" : "#1e1813";
      ctx.fillRect(0, y, W, 30);
      ctx.strokeStyle = "rgba(80,60,40,0.15)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- Walls ---
  function drawWalls() {
    ctx.save();
    // Back wall
    ctx.fillStyle = "#1c2230";
    ctx.fillRect(0, 0, W, 40);
    // Wall trim
    ctx.fillStyle = "#2a3448";
    ctx.fillRect(0, 38, W, 4);

    // Window on back wall (left)
    ctx.fillStyle = "#1a2a44";
    drawRoundedRect(120, 5, 160, 30, 4);
    ctx.fill();
    ctx.strokeStyle = "#3a5070";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(100,160,220,0.12)";
    ctx.fillRect(122, 7, 76, 26);
    ctx.fillRect(202, 7, 76, 26);
    ctx.fillStyle = "#3a5070";
    ctx.fillRect(199, 5, 3, 30);

    // Window on back wall (right)
    ctx.fillStyle = "#1a2a44";
    drawRoundedRect(680, 5, 160, 30, 4);
    ctx.fill();
    ctx.strokeStyle = "#3a5070";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(100,160,220,0.12)";
    ctx.fillRect(682, 7, 76, 26);
    ctx.fillRect(762, 7, 76, 26);
    ctx.fillStyle = "#3a5070";
    ctx.fillRect(759, 5, 3, 30);

    // Clock on wall
    const cx = 490, cy = 20;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#0e1520";
    ctx.fill();
    ctx.strokeStyle = "#4a6080";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const now = new Date();
    const hr = now.getHours() % 12;
    const mn = now.getMinutes();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((hr + mn / 60) * Math.PI / 6 - Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, 0);
    ctx.strokeStyle = "#e6eef8"; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(mn * Math.PI / 30 - Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0);
    ctx.strokeStyle = "#4aa3ff"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    ctx.restore();
  }


  // --- Main Work Desk ---
  function drawMyDesk() {
    const d = room.myDesk;
    ctx.save();

    // Ground shadow (desk height)
    drawDeskShadow(d.x, d.y, d.w, d.h, 18);

    // Desk surface (dark wood with grain)
    fillRoundedWithGradient(d.x, d.y, d.w, d.h, 8, [
      [0, "#2c2118"],
      [1, "#1c140f"],
    ]);
    overlayPatternClipped(d.x, d.y, d.w, d.h, 8, MAT.wood, 0.14);

    // Desk top rim highlight
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    drawRoundedRect(d.x + 4, d.y + 4, d.w - 8, 14, 6);
    ctx.fill();

    // Desk thickness (front edge)
    fillRoundedWithGradient(d.x + 2, d.y + d.h - 12, d.w - 4, 12, 6, [
      [0, "rgba(0,0,0,0.35)"],
      [1, "rgba(0,0,0,0.10)"],
    ]);

    // Outline
    ctx.strokeStyle = "#4a3828";
    ctx.lineWidth = 2;
    drawRoundedRect(d.x, d.y, d.w, d.h, 8);
    ctx.stroke();

    // Monitor (with subtle glass reflection)
    const mx = d.x + 60, my = d.y + 10;
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(mx + 25, my + 50, 10, 12);
    ctx.fillRect(mx + 15, my + 60, 30, 5);

    ctx.save();
    // monitor shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    drawRoundedRect(mx + 2, my + 2, 60, 45, 4);
    ctx.fill();
    ctx.restore();

    fillRoundedWithGradient(mx, my, 60, 45, 4, [
      [0, "#0c0f14"],
      [1, "#06080b"],
    ]);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1.5;
    drawRoundedRect(mx, my, 60, 45, 4);
    ctx.stroke();

    const screenColor = status.state === "working" ? "rgba(74,163,255,0.32)" :
      status.state === "idle" ? "rgba(56,209,154,0.16)" :
        status.state === "rate_limited" ? "rgba(255,95,109,0.22)" : "rgba(100,120,140,0.10)";
    ctx.fillStyle = screenColor;
    ctx.fillRect(mx + 3, my + 3, 54, 39);

    // Screen reflection
    const rg = ctx.createLinearGradient(mx + 3, my + 3, mx + 57, my + 42);
    rg.addColorStop(0, "rgba(255,255,255,0.10)");
    rg.addColorStop(0.45, "rgba(255,255,255,0.02)");
    rg.addColorStop(1, "rgba(255,255,255,0.00)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(mx + 3, my + 3);
    ctx.lineTo(mx + 38, my + 3);
    ctx.lineTo(mx + 3, my + 30);
    ctx.closePath();
    ctx.fill();

    if (status.state === "working") {
      ctx.fillStyle = "rgba(74,163,255,0.85)";
      for (let i = 0; i < 4; i++) {
        const lw = 20 + Math.sin(agent.frame * 2 + i) * 15;
        ctx.fillRect(mx + 8, my + 10 + i * 8, lw, 2);
      }
    }

    // Keyboard + Mouse (more 3D)
    drawKeyboard(d.x + 55, d.y + 70, 50, 16, 0.075);
    drawMouse(d.x + 120, d.y + 76, 8, 10);

    // Coffee mug (slight highlight)
    ctx.fillStyle = "#8B4513";
    drawRoundedRect(d.x + 155, d.y + 60, 16, 20, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(d.x + 157, d.y + 62, 2, 16);

    if (status.state !== "no_log") {
      ctx.strokeStyle = "rgba(200,200,200,0.30)";
      ctx.lineWidth = 1;
      const steamT = agent.frame * 3;
      ctx.beginPath();
      ctx.moveTo(d.x + 160, d.y + 58);
      ctx.quadraticCurveTo(d.x + 158 + Math.sin(steamT) * 4, d.y + 48, d.x + 163, d.y + 42);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(d.x + 165, d.y + 58);
      ctx.quadraticCurveTo(d.x + 167 + Math.sin(steamT + 1) * 4, d.y + 50, d.x + 162, d.y + 44);
      ctx.stroke();
    }

    // Phone on desk
    fillRoundedWithGradient(d.x + 10, d.y + 55, 25, 35, 4, [
      [0, "#1a1a2e"],
      [1, "#0d0d18"],
    ]);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    drawRoundedRect(d.x + 10, d.y + 55, 25, 35, 4);
    ctx.stroke();
    ctx.fillStyle = "rgba(74,163,255,0.16)";
    ctx.fillRect(d.x + 13, d.y + 59, 19, 24);
    const pg = ctx.createLinearGradient(d.x + 13, d.y + 59, d.x + 32, d.y + 83);
    pg.addColorStop(0, "rgba(255,255,255,0.12)");
    pg.addColorStop(1, "rgba(255,255,255,0.00)");
    ctx.fillStyle = pg;
    ctx.fillRect(d.x + 13, d.y + 59, 19, 24);

    // Chair (fabric + metal)
    drawChair(d.x + 74, d.y + 88, 52, 54, "#242424");

    // Desk label (uses identity name)
    ctx.fillStyle = "rgba(230,238,248,0.70)";
    ctx.font = "bold 11px ui-sans-serif,system-ui";
    ctx.fillText(d.label, d.x + 8, d.y - 5);

    ctx.restore();
  }


  // --- Guest Desks ---
  function drawGuestDesk(d, idx) {
    ctx.save();

    // Chair first (so it looks tucked under the desk)
    const chairW = 46;
    const chairH = 50;
    const chairX = d.x + (d.w - chairW) / 2;
    const chairY = d.y + d.h - 22;
    drawChair(chairX, chairY, chairW, chairH, "#232323");

    // Desk shadow + surface (wood)
    drawDeskShadow(d.x, d.y, d.w, d.h, 12);
    fillRoundedWithGradient(d.x, d.y, d.w, d.h, 6, [
      [0, "#2a2018"],
      [1, "#1a120d"],
    ]);
    overlayPatternClipped(d.x, d.y, d.w, d.h, 6, MAT.wood, 0.12);

    // Rim highlight
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    drawRoundedRect(d.x + 3, d.y + 3, d.w - 6, 10, 5);
    ctx.fill();

    // Front thickness
    fillRoundedWithGradient(d.x + 2, d.y + d.h - 10, d.w - 4, 10, 5, [
      [0, "rgba(0,0,0,0.32)"],
      [1, "rgba(0,0,0,0.10)"],
    ]);

    // Outline
    ctx.strokeStyle = "#3a3020";
    ctx.lineWidth = 1.5;
    drawRoundedRect(d.x, d.y, d.w, d.h, 6);
    ctx.stroke();

    // Monitor (glass + reflection)
    const mx = d.x + 30, my = d.y + 8;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    drawRoundedRect(mx + 1, my + 2, 35, 25, 3);
    ctx.fill();
    ctx.restore();

    fillRoundedWithGradient(mx, my, 35, 25, 3, [
      [0, "#0a0e14"],
      [1, "#05070a"],
    ]);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    drawRoundedRect(mx, my, 35, 25, 3);
    ctx.stroke();

    ctx.fillStyle = "rgba(56,209,154,0.12)";
    ctx.fillRect(mx + 2, my + 2, 31, 21);

    const mr = ctx.createLinearGradient(mx + 2, my + 2, mx + 33, my + 23);
    mr.addColorStop(0, "rgba(255,255,255,0.10)");
    mr.addColorStop(0.55, "rgba(255,255,255,0.02)");
    mr.addColorStop(1, "rgba(255,255,255,0.00)");
    ctx.fillStyle = mr;
    ctx.beginPath();
    ctx.moveTo(mx + 2, my + 2);
    ctx.lineTo(mx + 20, my + 2);
    ctx.lineTo(mx + 2, my + 16);
    ctx.closePath();
    ctx.fill();

    // Keyboard + Mouse (新增：A/B/C/D 都補齊)
    drawKeyboard(d.x + 34, d.y + 40, 46, 11, 0.06);
    drawMouse(d.x + 92, d.y + 45, 5.6, 7.4);

    // Desk accessories (keep existing identity per desk)
    if (idx === 0) {
      // small books
      ctx.fillStyle = "#4a3828";
      ctx.fillRect(d.x + 8, d.y + 15, 18, 6);
      ctx.fillStyle = "#3a5040";
      ctx.fillRect(d.x + 8, d.y + 21, 18, 5);
      ctx.fillStyle = "#4a3040";
      ctx.fillRect(d.x + 8, d.y + 26, 18, 5);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(d.x + 8, d.y + 15, 18, 2);
    } else if (idx === 1) {
      // notes
      fillRoundedWithGradient(d.x + 8, d.y + 20, 16, 22, 2, [
        [0, "#f2ead8"],
        [1, "#d8d0c0"],
      ]);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(d.x + 11, d.y + 24 + i * 4, 10, 1);
      }
    } else if (idx === 2) {
      // plant
      fillRoundedWithGradient(d.x + 10, d.y + 30, 14, 16, 3, [
        [0, "#6b4226"],
        [1, "#3b2415"],
      ]);
      ctx.fillStyle = "#3a8050";
      ctx.beginPath();
      ctx.arc(d.x + 17, d.y + 26, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a6040";
      ctx.beginPath();
      ctx.arc(d.x + 14, d.y + 24, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.arc(d.x + 19, d.y + 23, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // tablet
      fillRoundedWithGradient(d.x + 8, d.y + 20, 18, 26, 3, [
        [0, "#1a1a2e"],
        [1, "#0d0d18"],
      ]);
      ctx.fillStyle = "rgba(100,140,200,0.14)";
      ctx.fillRect(d.x + 10, d.y + 23, 14, 20);
      const tg = ctx.createLinearGradient(d.x + 10, d.y + 23, d.x + 24, d.y + 43);
      tg.addColorStop(0, "rgba(255,255,255,0.10)");
      tg.addColorStop(1, "rgba(255,255,255,0.00)");
      ctx.fillStyle = tg;
      ctx.fillRect(d.x + 10, d.y + 23, 14, 20);
    }

    // Label
    ctx.fillStyle = "rgba(200,210,225,0.55)";
    ctx.font = "600 10px ui-sans-serif,system-ui";
    ctx.fillText(d.label, d.x + 5, d.y - 4);

    ctx.restore();
  }

  // --- Rest Area ---
  function drawRestArea() {
    const r = room.rest;
    ctx.save();

    ctx.fillStyle = "rgba(80,40,30,0.2)";
    drawRoundedRect(r.x - 10, r.y - 10, r.w + 20, r.h + 20, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,60,40,0.15)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "rgba(200,210,225,0.5)";
    ctx.font = "600 11px ui-sans-serif,system-ui";
    ctx.fillText(r.label, r.x + 5, r.y - 15);

    // Sofa
    ctx.fillStyle = "#2a2540";
    drawRoundedRect(r.x + 20, r.y + 40, 140, 60, 12);
    ctx.fill();
    ctx.fillStyle = "#352f4a";
    drawRoundedRect(r.x + 20, r.y + 30, 140, 20, 8);
    ctx.fill();
    ctx.fillStyle = "#3a3450";
    drawRoundedRect(r.x + 28, r.y + 48, 55, 40, 8);
    ctx.fill();
    ctx.fillStyle = "#3a3450";
    drawRoundedRect(r.x + 92, r.y + 48, 55, 40, 8);
    ctx.fill();
    ctx.fillStyle = "#5a4070";
    drawRoundedRect(r.x + 30, r.y + 50, 22, 18, 6);
    ctx.fill();

    // Coffee table
    ctx.fillStyle = "#2a2018";
    drawRoundedRect(r.x + 50, r.y + 110, 80, 35, 6);
    ctx.fill();
    ctx.strokeStyle = "#3a2e20";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#e0d8c8";
    ctx.save();
    ctx.translate(r.x + 70, r.y + 120);
    ctx.rotate(0.15);
    ctx.fillRect(0, 0, 20, 14);
    ctx.restore();

    // Floor lamp
    const lx = r.x + 225, ly = r.y + 20;
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lx, ly + 130);
    ctx.lineTo(lx, ly + 30);
    ctx.stroke();
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.ellipse(lx, ly + 135, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8d8b0";
    ctx.beginPath();
    ctx.moveTo(lx - 18, ly + 30);
    ctx.lineTo(lx + 18, ly + 30);
    ctx.lineTo(lx + 12, ly);
    ctx.lineTo(lx - 12, ly);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,240,200,0.06)";
    ctx.beginPath();
    ctx.arc(lx, ly + 50, 60, 0, Math.PI * 2);
    ctx.fill();

    // Potted plant
    const px = r.x - 30, py = r.y + 115;
    ctx.fillStyle = "#6b4226";
    drawRoundedRect(px, py, 24, 30, 5);
    ctx.fill();
    ctx.fillStyle = "#2a7040";
    ctx.beginPath(); ctx.arc(px + 12, py - 8, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3a8855";
    ctx.beginPath(); ctx.arc(px + 6, py - 15, 10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + 18, py - 12, 11, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  // --- Bookshelf ---
  function drawBookshelf() {
    ctx.save();
    const bx = 20, by = 50;
    ctx.fillStyle = "#2a2018";
    ctx.fillRect(bx, by, 45, 120);
    ctx.strokeStyle = "#3a2e20";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, 45, 120);
    for (let i = 0; i < 4; i++) {
      const sy = by + 5 + i * 30;
      ctx.fillStyle = "#3a2e20";
      ctx.fillRect(bx + 2, sy + 24, 41, 3);
      const colors = ["#c44", "#48a", "#6a4", "#a84", "#64a", "#4a8"];
      for (let j = 0; j < 5; j++) {
        ctx.fillStyle = colors[(i * 5 + j) % colors.length];
        ctx.fillRect(bx + 5 + j * 8, sy + 2, 6, 22);
      }
    }
    ctx.restore();
  }

  // --- Draw Agent (character with traits from IDENTITY.md) ---
  
  function drawAgentSittingBack(c, bob) {
    // Sitting on chair, facing desk (away from viewer)

    // Shadow (smaller, more grounded)
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(agent.x, agent.y + 18, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Seated legs (subtle)
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(agent.x - 5, agent.y + 6 + bob);
    ctx.lineTo(agent.x - 9, agent.y + 14 + bob);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(agent.x + 5, agent.y + 6 + bob);
    ctx.lineTo(agent.x + 9, agent.y + 14 + bob);
    ctx.stroke();

    // Body (back view) — placed higher so the back is behind the backrest
    const by = agent.y + bob;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(agent.x - 11, by + 3);
    ctx.lineTo(agent.x + 11, by + 3);
    ctx.lineTo(agent.x + 9, by - 12);
    ctx.lineTo(agent.x - 9, by - 12);
    ctx.closePath();
    ctx.fill();

    // Shoulder highlight
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(agent.x - 8, by - 12, 16, 3);

    // Arms reaching forward (typing)

    ctx.strokeStyle = c;
    ctx.lineWidth = 3;
    const t = agent.frame * 6;
    ctx.beginPath();
    ctx.moveTo(agent.x - 10, agent.y - 2 + bob);
    ctx.lineTo(agent.x - 16, agent.y - 12 + bob + Math.sin(t) * 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(agent.x + 10, agent.y - 2 + bob);
    ctx.lineTo(agent.x + 16, agent.y - 12 + bob + Math.sin(t + 1) * 1.2);
    ctx.stroke();

    // Chair back occlusion: cover torso/back, keep head visible
    drawMyChairBackOccluder();

    // Head (skin)
    ctx.fillStyle = traits.skinColor;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y - 18 + bob, 11, 0, Math.PI * 2);
    ctx.fill();

    // Hair (back, cover face)
    ctx.fillStyle = traits.hairColor;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y - 19 + bob, 12, 0, Math.PI * 2);
    ctx.fill();
    // long hair down
    ctx.fillRect(agent.x - 12, agent.y - 19 + bob, 4, 20);
    ctx.fillRect(agent.x + 8, agent.y - 19 + bob, 4, 20);
    // wave tips
    ctx.beginPath();
    ctx.arc(agent.x - 11, agent.y + 1 + bob, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(agent.x + 11, agent.y + 1 + bob, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAgentSittingSofaFront(c, bob) {
    // Sitting on the sofa, facing the viewer

    // Shadow (soft)
    ctx.fillStyle = "rgba(0,0,0,0.20)";
    ctx.beginPath();
    ctx.ellipse(agent.x, agent.y + 22, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs (bent on seat)
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;

    // Thighs
    ctx.beginPath();
    ctx.moveTo(agent.x - 6, agent.y + 8 + bob);
    ctx.lineTo(agent.x - 13, agent.y + 15 + bob);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(agent.x + 6, agent.y + 8 + bob);
    ctx.lineTo(agent.x + 13, agent.y + 15 + bob);
    ctx.stroke();

    // Shins
    ctx.beginPath();
    ctx.moveTo(agent.x - 13, agent.y + 15 + bob);
    ctx.lineTo(agent.x - 10, agent.y + 24 + bob);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(agent.x + 13, agent.y + 15 + bob);
    ctx.lineTo(agent.x + 10, agent.y + 24 + bob);
    ctx.stroke();

    // Feet
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(agent.x - 12, agent.y + 24 + bob);
    ctx.lineTo(agent.x - 6, agent.y + 24 + bob);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(agent.x + 12, agent.y + 24 + bob);
    ctx.lineTo(agent.x + 6, agent.y + 24 + bob);
    ctx.stroke();

    // Body (slightly shorter to look seated)
    const by = agent.y + bob;
    const bodyColor = traits.dressColor || c;
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(agent.x - 12, by + 10);
    ctx.lineTo(agent.x + 12, by + 10);
    ctx.lineTo(agent.x + 10, by - 10);
    ctx.lineTo(agent.x - 10, by - 10);
    ctx.closePath();
    ctx.fill();

    // Subtle fabric highlight
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(agent.x - 9, by - 10, 18, 3);

    // Arms resting on lap
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 3;
    const t = agent.frame * 2.2;
    ctx.beginPath();
    ctx.moveTo(agent.x - 10, by);
    ctx.lineTo(agent.x - 3, by + 8 + Math.sin(t) * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(agent.x + 10, by);
    ctx.lineTo(agent.x + 3, by + 8 + Math.sin(t + 1) * 0.6);
    ctx.stroke();

    // Head
    ctx.fillStyle = traits.skinColor;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y - 18 + bob, 11, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = traits.hairColor;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y - 22 + bob, 12, Math.PI, 2 * Math.PI);
    ctx.fill();
    // side hair
    ctx.fillRect(agent.x - 12, agent.y - 22 + bob, 4, 18);
    ctx.fillRect(agent.x + 8, agent.y - 22 + bob, 4, 18);
    // wave tips
    ctx.beginPath();
    ctx.arc(agent.x - 11, agent.y - 4 + bob, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(agent.x + 11, agent.y - 4 + bob, 3, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = traits.eyeColor;
    const blink = Math.sin(agent.frame * 0.8) > 0.95 ? 0.5 : 2;
    ctx.beginPath();
    ctx.ellipse(agent.x - 4, agent.y - 19 + bob, 1.5, blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(agent.x + 4, agent.y - 19 + bob, 1.5, blink, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = traits.lipColor || "#a0705a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y - 14 + bob, 3, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // Earrings
    ctx.fillStyle = traits.earringColor;
    ctx.beginPath();
    ctx.arc(agent.x - 11, agent.y - 14 + bob, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(agent.x + 11, agent.y - 14 + bob, 2, 0, Math.PI * 2);
    ctx.fill();
  }


function drawAgent() {
    const st = status.state;
    const c = STATE_COLORS[st] || "#93a4b8";
    const isMoving = Math.hypot(agent.vx, agent.vy) > 5;
    const bobWalk = Math.sin(agent.bob) * 2;
    const bobSit = Math.sin(agent.frame * 3) * 0.8;
    const isDeskSit = (st === "working" && !isMoving);
    const isSofaSit = ((st === "idle" || st === "rate_limited") && !isMoving);
    const bob = (isDeskSit || isSofaSit) ? bobSit : bobWalk;

    ctx.save();


    // Working at desk: sit on chair and face the desk (back to viewer)
    if (st === "working" && !isMoving) {
      drawAgentSittingBack(c, bob);

      // Status badge
      ctx.fillStyle = "rgba(11,15,20,0.85)";
      const label = st === "idle" ? identity.name : st.replaceAll("_", " ").toUpperCase();
      ctx.font = "bold 9px ui-sans-serif,system-ui";
      const tw = ctx.measureText(label).width;
      drawRoundedRect(agent.x - tw / 2 - 6, agent.y - 40 + bob, tw + 12, 16, 6);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.fillText(label, agent.x - tw / 2, agent.y - 30 + bob);

      // Thought bubble when working
      const bx2 = agent.x + 20, by2 = agent.y - 50 + bob;
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.arc(agent.x + 14, agent.y - 36 + bob, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx2, by2 + 8, 4, 0, Math.PI * 2);
      ctx.fill();
      drawRoundedRect(bx2 - 5, by2 - 12, 40, 18, 8);
      ctx.fill();
      ctx.fillStyle = "rgba(74,163,255,0.7)";
      ctx.font = "8px ui-sans-serif,system-ui";
      ctx.fillText("coding...", bx2, by2);

      ctx.restore();
      return;
    }


    // Resting in the lounge: sit on the sofa
    if (isSofaSit) {
      drawAgentSittingSofaFront(c, bob);

      // Status badge
      ctx.fillStyle = "rgba(11,15,20,0.85)";
      const label = st === "idle" ? identity.name : st.replaceAll("_", " ").toUpperCase();
      ctx.font = "bold 9px ui-sans-serif,system-ui";
      const tw = ctx.measureText(label).width;
      drawRoundedRect(agent.x - tw / 2 - 6, agent.y - 40 + bob, tw + 12, 16, 6);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.fillText(label, agent.x - tw / 2, agent.y - 30 + bob);

      ctx.restore();
      return;
    }



    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(agent.x, agent.y + 24, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs (walking animation)
    const legSwing = isMoving ? Math.sin(agent.bob * 2) * 6 : 0;
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(agent.x - 5, agent.y + 12 + bob);
    ctx.lineTo(agent.x - 5 - legSwing, agent.y + 22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(agent.x + 5, agent.y + 12 + bob);
    ctx.lineTo(agent.x + 5 + legSwing, agent.y + 22);
    ctx.stroke();

    // Body (dress/top) — use state color
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(agent.x - 12, agent.y + 12 + bob);
    ctx.lineTo(agent.x + 12, agent.y + 12 + bob);
    ctx.lineTo(agent.x + 10, agent.y - 8 + bob);
    ctx.lineTo(agent.x - 10, agent.y - 8 + bob);
    ctx.closePath();
    ctx.fill();

    // Arms
    ctx.strokeStyle = c;
    ctx.lineWidth = 3;
    const armSwing = isMoving ? Math.sin(agent.bob * 2 + 1) * 8 : 0;
    ctx.beginPath();
    ctx.moveTo(agent.x - 11, agent.y - 2 + bob);
    ctx.lineTo(agent.x - 18 - armSwing, agent.y + 8 + bob);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(agent.x + 11, agent.y - 2 + bob);
    ctx.lineTo(agent.x + 18 + armSwing, agent.y + 8 + bob);
    ctx.stroke();

    // If working, right arm up typing
    if (st === "working" && !isMoving) {
      ctx.beginPath();
      ctx.moveTo(agent.x + 11, agent.y - 2 + bob);
      ctx.lineTo(agent.x + 16, agent.y - 8 + bob + Math.sin(agent.frame * 6) * 2);
      ctx.stroke();
    }

    // Head (skin from traits)
    ctx.fillStyle = traits.skinColor;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y - 18 + bob, 11, 0, Math.PI * 2);
    ctx.fill();

    // Hair (color from traits)
    ctx.fillStyle = traits.hairColor;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y - 22 + bob, 12, Math.PI, 2 * Math.PI);
    ctx.fill();
    // side hair (long, wavy)
    ctx.fillRect(agent.x - 12, agent.y - 22 + bob, 4, 18);
    ctx.fillRect(agent.x + 8, agent.y - 22 + bob, 4, 18);
    // wave tips
    ctx.beginPath();
    ctx.arc(agent.x - 11, agent.y - 4 + bob, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(agent.x + 11, agent.y - 4 + bob, 3, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (color from traits)
    ctx.fillStyle = traits.eyeColor;
    const blink = Math.sin(agent.frame * 0.8) > 0.95 ? 0.5 : 2;
    ctx.beginPath();
    ctx.ellipse(agent.x - 4, agent.y - 19 + bob, 1.5, blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(agent.x + 4, agent.y - 19 + bob, 1.5, blink, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mouth (smile)
    ctx.strokeStyle = traits.lipColor || "#a0705a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y - 14 + bob, 3, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    // Earrings (color from traits)
    ctx.fillStyle = traits.earringColor;
    ctx.beginPath();
    ctx.arc(agent.x - 11, agent.y - 14 + bob, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(agent.x + 11, agent.y - 14 + bob, 2, 0, Math.PI * 2);
    ctx.fill();

    // Status badge
    ctx.fillStyle = "rgba(11,15,20,0.85)";
    // For idle state, show name instead of "IDLE"
    const label = st === "idle" ? identity.name : st.replaceAll("_", " ").toUpperCase();
    ctx.font = "bold 9px ui-sans-serif,system-ui";
    const tw = ctx.measureText(label).width;
    drawRoundedRect(agent.x - tw / 2 - 6, agent.y - 40 + bob, tw + 12, 16, 6);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.fillText(label, agent.x - tw / 2, agent.y - 30 + bob);

    // Queue count badge
    if (st === "queued" && (status.queueAhead || 0) > 0) {
      ctx.fillStyle = "#ffcc66";
      drawRoundedRect(agent.x + 14, agent.y - 38 + bob, 20, 14, 5);
      ctx.fill();
      ctx.fillStyle = "#0b0f14";
      ctx.font = "bold 9px ui-sans-serif,system-ui";
      ctx.fillText(String(status.queueAhead), agent.x + 19, agent.y - 28 + bob);
    }

    // Thought bubble when working
    if (st === "working" && !isMoving) {
      const bx2 = agent.x + 20, by2 = agent.y - 50 + bob;
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.arc(agent.x + 14, agent.y - 36 + bob, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx2, by2 + 8, 4, 0, Math.PI * 2);
      ctx.fill();
      drawRoundedRect(bx2 - 5, by2 - 12, 40, 18, 8);
      ctx.fill();
      ctx.fillStyle = "rgba(74,163,255,0.7)";
      ctx.font = "8px ui-sans-serif,system-ui";
      ctx.fillText("coding...", bx2, by2);
    }

    // Idle: show name with a small flower/decoration
    if (st === "idle" && !isMoving) {
      ctx.fillStyle = "rgba(56,209,154,0.12)";
      const bx2 = agent.x + 18, by2 = agent.y - 46 + bob;
      ctx.beginPath();
      ctx.arc(agent.x + 13, agent.y - 36 + bob, 2, 0, Math.PI * 2);
      ctx.fill();
      drawRoundedRect(bx2 - 5, by2 - 8, 34, 16, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(56,209,154,0.7)";
      ctx.font = "8px ui-sans-serif,system-ui";
      ctx.fillText(`🌸 ${identity.name}`, bx2 - 2, by2 + 3);
    }

    ctx.restore();
  }

  // --- Main render ---
  function render() {
    ctx.clearRect(0, 0, W, H);

    drawFloor();
    drawWalls();
    drawBookshelf();

    room.desks.forEach((d, i) => drawGuestDesk(d, i));

    drawMyDesk();
    drawRestArea();
    drawAgent();

    // Title overlay
    ctx.save();
    ctx.fillStyle = "rgba(230,238,248,0.06)";
    ctx.font = "bold 48px ui-sans-serif,system-ui";
    ctx.fillText("OFFICE", W - 220, H - 20);
    ctx.restore();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    render();
    requestAnimationFrame(loop);
  }

  // --- Settings modal ---
  btnSettings.addEventListener("click", () => modal.classList.add("show"));
  btnCancel.addEventListener("click", () => modal.classList.remove("show"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("show"); });

  async function loadConfig() {
    const r = await fetch("/api/config", { cache: "no-store" });
    const cfg = await r.json();
    cfgHost.value = cfg.host || "127.0.0.1";
    cfgPort.value = String(cfg.port || 8787);
    cfgLog.value = cfg.log_path || "";
    cfgPoll.value = String(cfg.poll_interval_ms || 250);
    cfgIdle.value = String(cfg.idle_after_sec || 60);
  }

  btnSave.addEventListener("click", async () => {
    const payload = {
      host: cfgHost.value.trim(),
      port: parseInt(cfgPort.value, 10),
      log_path: cfgLog.value.trim(),
      poll_interval_ms: parseInt(cfgPoll.value, 10),
      idle_after_sec: parseInt(cfgIdle.value, 10)
    };
    const r = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (r.ok) {
      modal.classList.remove("show");
      pushEvent("config", "已儲存設定。若你改了 Host/Port，請重啟 server。");
    } else {
      pushEvent("config_error", "儲存設定失敗。");
    }
  });

  // --- Load identity from IDENTITY.md ---
  async function loadIdentity() {
    try {
      const r = await fetch("/api/identity", { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        identity = data;
        // Update desk label with name
        room.myDesk.label = `${identity.name}'s Desk`;
        // Parse appearance traits
        parseAppearance(identity.appearance);
        pushEvent("identity", `已載入身分：${identity.name}`);
      }
    } catch (e) {
      // fallback
      room.myDesk.label = "Mia's Desk";
    }
  }

  // --- SSE events ---
  function applyStatus(s) {
    status = {
      ...status,
      ...s,
      since: s.since || status.since
    };
    updateUI();
    setTargetByState(status.state);
  }

  function startSSE() {
    const es = new EventSource("/events");
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data);
        if (ev.type === "status") {
          applyStatus(ev.status || {});
          return;
        }
        if (ev.type && ev.raw) {
          if (ev.type === "queued") {
            status.queueAhead = ev.queueAhead ?? status.queueAhead;
            status.waitedMs = ev.waitedMs ?? status.waitedMs;
          }
          if (ev.type === "working") {
            if (ev.ttft_ms != null) status.ttft_ms = ev.ttft_ms;
            if (ev.tps != null) status.tps = ev.tps;
          }
          status.lastLine = ev.raw || status.lastLine;
          const next = (ev.type === "working" || ev.type === "diagnostic") ? "working"
            : (ev.type === "queued") ? "queued"
              : (ev.type === "rate_limited") ? "rate_limited"
                : (ev.type === "misconfigured") ? "misconfigured"
                  : (ev.type === "timeout" || ev.type === "tool_error" || ev.type === "warning") ? "warning"
                    : status.state;
          if (next !== status.state) {
            status.state = next;
            status.since = Date.now() / 1000;
            setTargetByState(status.state);
          }
          updateUI();
          pushEvent(ev.type, ev.raw);
        }
      } catch (e) { }
    };
    es.onerror = () => {
      pushEvent("sse", "與 server 連線中斷，將自動重連…");
    };
  }

  // Init — load identity first, then start everything
  (async () => {
    await loadIdentity();
    await loadConfig();
    updateUI();
    setTargetByState(status.state);
    startSSE();
    requestAnimationFrame(loop);
  })();
})();
