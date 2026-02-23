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
    // Must match drawMyDesk() chair geometry (backH ratio 0.55)
    const chairX = room.myDesk.x + 74;
    const chairY = room.myDesk.y + 88;
    const chairW = 52;
    const chairH = 54;
    const backH = Math.max(14, Math.floor(chairH * 0.55));
    const seatH = Math.max(10, Math.floor(chairH * 0.22));
    const seatY = chairY + backH - 2;
    return { x: chairX + chairW / 2, y: seatY + seatH / 2 };
  }

  function getSofaSeat() {
    // Sofa geometry: sy = r.y+30, cushion top = sy+32 = r.y+62
    // Want agent.y ≈ 345 so:
    //   head center = 327 → above backrest top (330) ✓
    //   body bottom = 355 → inside sofa body face ✓
    //   legs end    = 363 → at cushion top (362), hidden by occluder ✓
    // agent.target.y = seatCenterY + 6 = r.y+45 → agent.y = 345
    const r = room.rest;
    const seatCenterX = r.x + 18 + 74;
    const seatCenterY = r.y + 39;   // target.y = r.y+45, agent.y ≈ 345
    return { x: seatCenterX, y: seatCenterY };
  }


  function getMyChairGeom() {
    // Must match drawMyDesk() chair geometry (backH ratio 0.55)
    const chairX = room.myDesk.x + 74;
    const chairY = room.myDesk.y + 88;
    const chairW = 52;
    const chairH = 54;
    const backH = Math.max(14, Math.floor(chairH * 0.55));
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
      // Anchor to chairY so head clears the backrest top cleanly
      const g = getMyChairGeom();
      // agent.y = chairY + 10 → body (chairY-2 to chairY+13) mostly behind backrest (chairY to chairY+backH) ✓
      agent.target = { x: g.chairX + g.chairW / 2, y: g.chairY + 10 };
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

    const backH = Math.max(14, Math.floor(h * 0.55));
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
    // Base floor color gradient (front brighter, back darker for perspective)
    const floorGrad = ctx.createLinearGradient(0, 0, 0, H);
    floorGrad.addColorStop(0, "#131008");
    floorGrad.addColorStop(0.5, "#1c1710");
    floorGrad.addColorStop(1, "#221e14");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 0, W, H);

    // Horizontal plank lines (perspective: tighter near top, wider near bottom)
    for (let y = 0; y < H; y += 28) {
      const alpha = 0.06 + (y / H) * 0.10;
      ctx.fillStyle = `rgba(30,22,8,${alpha})`;
      ctx.fillRect(0, y, W, 2);
    }
    // Vertical grain lines (faint, angled slightly for perspective)
    ctx.save();
    for (let x = 0; x < W + 60; x += 60) {
      const alpha = 0.06 + Math.random() * 0.03;
      ctx.strokeStyle = `rgba(50,35,15,${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 20, H);
      ctx.stroke();
    }
    ctx.restore();

    // Ambient ground shadow near bottom edges (vignette)
    const vGrad = ctx.createLinearGradient(0, H - 60, 0, H);
    vGrad.addColorStop(0, "rgba(0,0,0,0)");
    vGrad.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, H - 60, W, 60);
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

    // Desk area floor glow
    const deskGlow = ctx.createRadialGradient(d.x + d.w/2, d.y + d.h + 20, 5, d.x + d.w/2, d.y + d.h + 20, 90);
    deskGlow.addColorStop(0, "rgba(76,168,255,0.06)");
    deskGlow.addColorStop(1, "rgba(76,168,255,0)");
    ctx.fillStyle = deskGlow;
    ctx.beginPath(); ctx.ellipse(d.x + d.w/2, d.y + d.h + 20, 90, 35, 0, 0, Math.PI*2); ctx.fill();

    // Ground shadow
    drawDeskShadow(d.x, d.y, d.w, d.h, 18);

    // Desk side panel (3D front edge depth)
    const sidePanel = ctx.createLinearGradient(d.x, d.y + d.h - 6, d.x, d.y + d.h + 10);
    sidePanel.addColorStop(0, "#1a1208");
    sidePanel.addColorStop(1, "#0e0a06");
    ctx.fillStyle = sidePanel;
    drawRoundedRect(d.x + 2, d.y + d.h - 8, d.w - 4, 14, 6);
    ctx.fill();

    // Desk surface (dark wood with grain)
    fillRoundedWithGradient(d.x, d.y, d.w, d.h, 8, [
      [0, "#2e2318"],
      [0.5, "#241b12"],
      [1, "#1c140f"],
    ]);
    overlayPatternClipped(d.x, d.y, d.w, d.h, 8, MAT.wood, 0.14);

    // Desk top rim highlight
    const rimGrad = ctx.createLinearGradient(d.x, d.y, d.x, d.y + 16);
    rimGrad.addColorStop(0, "rgba(255,255,255,0.08)");
    rimGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rimGrad;
    drawRoundedRect(d.x + 4, d.y + 4, d.w - 8, 14, 6);
    ctx.fill();

    // Outline
    ctx.strokeStyle = "#4a3828";
    ctx.lineWidth = 2;
    drawRoundedRect(d.x, d.y, d.w, d.h, 8);
    ctx.stroke();

    // ── MONITOR ───────────────────────────────────────────────
    const mx = d.x + 58, my = d.y + 8;
    // Monitor stand
    ctx.fillStyle = "#1a1a1a";
    drawRoundedRect(mx + 22, my + 48, 16, 14, 3); ctx.fill();
    ctx.fillStyle = "#242424";
    ctx.fillRect(mx + 12, my + 60, 36, 5);
    // Stand highlight
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(mx + 12, my + 60, 36, 2);

    // Monitor bezel shadow
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    drawRoundedRect(mx + 2, my + 3, 62, 47, 5); ctx.fill();

    // Monitor bezel
    const bezelGrad = ctx.createLinearGradient(mx, my, mx, my + 48);
    bezelGrad.addColorStop(0, "#1c1c1c");
    bezelGrad.addColorStop(1, "#0e0e0e");
    ctx.fillStyle = bezelGrad;
    drawRoundedRect(mx, my, 62, 48, 5); ctx.fill();

    // Screen bezel rim highlight
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1.5;
    drawRoundedRect(mx, my, 62, 48, 5); ctx.stroke();

    // Screen area
    const screenColor = status.state === "working"    ? "rgba(74,163,255,0.30)" :
                        status.state === "idle"        ? "rgba(56,209,154,0.16)" :
                        status.state === "rate_limited"? "rgba(255,95,109,0.22)" :
                                                         "rgba(80,100,120,0.10)";
    ctx.fillStyle = screenColor;
    ctx.fillRect(mx + 3, my + 3, 56, 40);

    // Screen glass reflection (diagonal glare)
    const rg = ctx.createLinearGradient(mx + 3, my + 3, mx + 45, my + 43);
    rg.addColorStop(0, "rgba(255,255,255,0.11)");
    rg.addColorStop(0.35, "rgba(255,255,255,0.03)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(mx + 3, my + 3); ctx.lineTo(mx + 36, my + 3); ctx.lineTo(mx + 3, my + 28);
    ctx.closePath(); ctx.fill();

    // Screen content (animated lines when working)
    if (status.state === "working") {
      ctx.fillStyle = "rgba(74,163,255,0.85)";
      for (let i = 0; i < 4; i++) {
        const lw = 18 + Math.sin(agent.frame * 2 + i) * 14;
        ctx.fillRect(mx + 8, my + 10 + i * 8, lw, 2);
      }
      // Cursor blink
      if (Math.floor(agent.frame / 15) % 2 === 0) {
        ctx.fillStyle = "rgba(74,163,255,0.9)";
        ctx.fillRect(mx + 8 + 18, my + 10, 2, 8);
      }
    } else if (status.state === "idle") {
      // Screensaver dots
      for (let i = 0; i < 3; i++) {
        const px2 = mx + 16 + i * 12;
        const py2 = my + 20 + Math.sin(agent.frame * 0.06 + i * 1.2) * 5;
        ctx.fillStyle = `rgba(56,209,154,${0.4 + Math.sin(agent.frame * 0.05 + i) * 0.2})`;
        ctx.beginPath(); ctx.arc(px2, py2, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Monitor power LED
    const ledColor = status.state === "idle" ? "#38d19a" : status.state === "working" ? "#4aa3ff" : "#888";
    ctx.fillStyle = ledColor;
    ctx.beginPath(); ctx.arc(mx + 31, my + 46, 1.5, 0, Math.PI*2); ctx.fill();
    // LED glow
    ctx.fillStyle = ledColor.replace(")", ",0.3)").replace("rgb","rgba");
    ctx.beginPath(); ctx.arc(mx + 31, my + 46, 4, 0, Math.PI*2); ctx.fill();

    // ── KEYBOARD ──────────────────────────────────────────────
    drawKeyboard(d.x + 55, d.y + 70, 52, 16, 0.075);

    // ── MOUSE ─────────────────────────────────────────────────
    drawMouse(d.x + 122, d.y + 75, 8, 10);

    // ── COFFEE MUG ────────────────────────────────────────────
    const mugX = d.x + 154, mugY = d.y + 58;
    // Mug shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(mugX + 8, mugY + 22, 9, 3, 0, 0, Math.PI*2); ctx.fill();
    // Mug body gradient
    const mugGrad = ctx.createLinearGradient(mugX, mugY, mugX + 16, mugY);
    mugGrad.addColorStop(0, "#6a3010");
    mugGrad.addColorStop(0.4, "#8B4513");
    mugGrad.addColorStop(1, "#5a2a0e");
    ctx.fillStyle = mugGrad;
    drawRoundedRect(mugX, mugY, 16, 20, 3); ctx.fill();
    // Mug rim highlight
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(mugX + 2, mugY + 1, 3, 18);
    // Mug handle
    ctx.strokeStyle = "#6a3010";
    ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(mugX + 16, mugY + 10, 5, -0.5 * Math.PI, 0.5 * Math.PI);
    ctx.stroke();
    // Coffee liquid
    ctx.fillStyle = "#2a1608";
    ctx.fillRect(mugX + 2, mugY + 2, 12, 5);
    // Steam (animated)
    if (status.state !== "no_log") {
      ctx.strokeStyle = "rgba(220,220,220,0.25)";
      ctx.lineWidth = 1.2; ctx.lineCap = "round";
      const st = agent.frame * 3;
      ctx.beginPath();
      ctx.moveTo(mugX + 5, mugY - 2);
      ctx.quadraticCurveTo(mugX + 3 + Math.sin(st) * 3, mugY - 9, mugX + 6, mugY - 15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mugX + 11, mugY - 2);
      ctx.quadraticCurveTo(mugX + 13 + Math.sin(st + 1.5) * 3, mugY - 9, mugX + 10, mugY - 16);
      ctx.stroke();
    }

    // ── PHONE ─────────────────────────────────────────────────
    const phX = d.x + 10, phY = d.y + 54;
    // Phone shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    drawRoundedRect(phX + 3, phY + 4, 25, 36, 5); ctx.fill();
    // Phone body
    fillRoundedWithGradient(phX, phY, 25, 36, 5, [
      [0, "#1e1e32"],
      [1, "#0d0d1a"],
    ]);
    // Phone screen bezel
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    drawRoundedRect(phX, phY, 25, 36, 5); ctx.stroke();
    // Screen
    ctx.fillStyle = "rgba(74,163,255,0.18)";
    ctx.fillRect(phX + 3, phY + 4, 19, 24);
    // Screen notification UI lines
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(phX + 5, phY + 7, 15, 1.5);
    ctx.fillRect(phX + 5, phY + 11, 10, 1);
    ctx.fillRect(phX + 5, phY + 15, 12, 1);
    // Glass reflection
    const pg = ctx.createLinearGradient(phX + 3, phY + 4, phX + 22, phY + 28);
    pg.addColorStop(0, "rgba(255,255,255,0.12)"); pg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = pg;
    ctx.fillRect(phX + 3, phY + 4, 19, 24);
    // Home button
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath(); ctx.arc(phX + 12, phY + 31, 3, 0, Math.PI*2); ctx.fill();

    // ── STICKY NOTE ───────────────────────────────────────────
    ctx.save();
    ctx.translate(d.x + 38, d.y + 52);
    ctx.rotate(-0.06);
    const noteGrad = ctx.createLinearGradient(0, 0, 0, 22);
    noteGrad.addColorStop(0, "#ffe58a"); noteGrad.addColorStop(1, "#f0d060");
    ctx.fillStyle = noteGrad;
    ctx.fillRect(0, 0, 20, 22);
    // Note fold corner
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(20, 4); ctx.lineTo(20, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f0c840";
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(20, 4); ctx.lineTo(16, 4); ctx.closePath(); ctx.fill();
    // Note lines
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let li = 0; li < 4; li++) ctx.fillRect(3, 6 + li * 4, 14, 1);
    ctx.restore();

    // ── CHAIR ─────────────────────────────────────────────────
    drawChair(d.x + 74, d.y + 88, 52, 54, "#242424");

    // Desk label
    ctx.fillStyle = "rgba(230,238,248,0.70)";
    ctx.font = "bold 11px ui-sans-serif,system-ui";
    ctx.fillText(d.label, d.x + 8, d.y - 6);

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

    // Monitor
    const mx = d.x + 30, my = d.y + 8;

    // Monitor stand
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(mx + 14, my + 24, 8, 10);
    ctx.fillStyle = "#222";
    ctx.fillRect(mx + 8, my + 33, 20, 3);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(mx + 8, my + 33, 20, 1);

    // Monitor bezel shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    drawRoundedRect(mx + 1, my + 2, 35, 25, 3); ctx.fill();

    // Monitor bezel
    fillRoundedWithGradient(mx, my, 35, 25, 3, [
      [0, "#181818"],
      [1, "#0a0a0a"],
    ]);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    drawRoundedRect(mx, my, 35, 25, 3); ctx.stroke();

    // Screen tint (all desks show green idle)
    ctx.fillStyle = "rgba(56,209,154,0.12)";
    ctx.fillRect(mx + 2, my + 2, 31, 19);

    // Screen content: mini code lines
    ctx.fillStyle = "rgba(56,209,154,0.45)";
    ctx.fillRect(mx + 4, my + 5, 14, 1.5);
    ctx.fillStyle = "rgba(76,168,255,0.35)";
    ctx.fillRect(mx + 6, my + 9, 20, 1.5);
    ctx.fillStyle = "rgba(56,209,154,0.25)";
    ctx.fillRect(mx + 4, my + 13, 10, 1.5);
    ctx.fillStyle = "rgba(255,200,80,0.30)";
    ctx.fillRect(mx + 4, my + 17, 16, 1.5);

    // Glass reflection
    const mr = ctx.createLinearGradient(mx + 2, my + 2, mx + 28, my + 21);
    mr.addColorStop(0, "rgba(255,255,255,0.10)");
    mr.addColorStop(0.45, "rgba(255,255,255,0.02)");
    mr.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = mr;
    ctx.beginPath();
    ctx.moveTo(mx + 2, my + 2); ctx.lineTo(mx + 20, my + 2); ctx.lineTo(mx + 2, my + 14);
    ctx.closePath(); ctx.fill();

    // Power LED
    ctx.fillStyle = "#38d19a";
    ctx.beginPath(); ctx.arc(mx + 18, my + 23, 1.2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(56,209,154,0.3)";
    ctx.beginPath(); ctx.arc(mx + 18, my + 23, 3, 0, Math.PI*2); ctx.fill();

    // Keyboard + Mouse
    drawKeyboard(d.x + 34, d.y + 40, 46, 11, 0.06);
    drawMouse(d.x + 92, d.y + 45, 5.6, 7.4);

    // ── Desk accessories — one unique set per desk ──────────────
    if (idx === 0) {
      // Desk A — Book stack (3 books, spine detail)
      const bookColors = ["#8a3028","#2a5a8a","#3a7038"];
      const bookHeights = [7, 6, 5];
      let stackY = d.y + 14;
      bookColors.forEach((bc, bi) => {
        const bkGrad = ctx.createLinearGradient(d.x + 6, stackY, d.x + 24, stackY);
        bkGrad.addColorStop(0, shadeColor(bc, -25));
        bkGrad.addColorStop(0.35, bc);
        bkGrad.addColorStop(1, shadeColor(bc, -12));
        ctx.fillStyle = bkGrad;
        drawRoundedRect(d.x + 6, stackY, 18, bookHeights[bi], bi === 0 ? 2 : 1);
        ctx.fill();
        // Spine line
        ctx.fillStyle = "rgba(0,0,0,0.20)";
        ctx.fillRect(d.x + 6, stackY, 1.5, bookHeights[bi]);
        // Top highlight
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(d.x + 6, stackY, 18, 1.5);
        // Title stripe
        if (bookHeights[bi] >= 6) {
          ctx.fillStyle = "rgba(255,255,255,0.20)";
          ctx.fillRect(d.x + 9, stackY + 2, 10, 1);
        }
        stackY += bookHeights[bi];
      });
      // Book shadow under stack
      ctx.fillStyle = "rgba(0,0,0,0.20)";
      ctx.beginPath(); ctx.ellipse(d.x + 15, stackY + 2, 9, 2.5, 0, 0, Math.PI*2); ctx.fill();

    } else if (idx === 1) {
      // Desk B — Notepad with pen
      ctx.save();
      ctx.translate(d.x + 6, d.y + 14);
      ctx.rotate(-0.04);
      // Notepad shadow
      ctx.fillStyle = "rgba(0,0,0,0.20)";
      drawRoundedRect(2, 2, 18, 26, 2); ctx.fill();
      // Notepad body
      const padGrad = ctx.createLinearGradient(0, 0, 0, 26);
      padGrad.addColorStop(0, "#f5eed8");
      padGrad.addColorStop(1, "#e0d8c2");
      ctx.fillStyle = padGrad;
      drawRoundedRect(0, 0, 18, 26, 2); ctx.fill();
      // Binding strip at top
      const bindGrad = ctx.createLinearGradient(0, 0, 18, 0);
      bindGrad.addColorStop(0, "#4a8aaa");
      bindGrad.addColorStop(1, "#2a6a8a");
      ctx.fillStyle = bindGrad;
      ctx.fillRect(0, 0, 18, 4);
      // Ruled lines
      ctx.fillStyle = "rgba(100,130,180,0.30)";
      for (let li = 0; li < 5; li++) {
        ctx.fillRect(2, 7 + li * 4, 14, 0.8);
      }
      // Handwriting squiggles (2 rows filled)
      ctx.fillStyle = "rgba(40,40,80,0.28)";
      ctx.fillRect(2, 7, 11, 0.8);
      ctx.fillRect(2, 11, 8, 0.8);
      ctx.restore();
      // Pen on top-right of notepad
      ctx.save();
      ctx.translate(d.x + 22, d.y + 12);
      ctx.rotate(0.25);
      // Pen body
      const penGrad = ctx.createLinearGradient(0, 0, 4, 0);
      penGrad.addColorStop(0, "#2a5a8a");
      penGrad.addColorStop(1, "#1a3a6a");
      ctx.fillStyle = penGrad;
      ctx.fillRect(0, 0, 4, 22);
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(0, 0, 1.5, 22);
      // Pen tip
      ctx.fillStyle = "#888";
      ctx.beginPath();
      ctx.moveTo(0, 22); ctx.lineTo(4, 22); ctx.lineTo(2, 26); ctx.closePath(); ctx.fill();
      // Clip
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(1, 0, 1, 10);
      ctx.restore();

    } else if (idx === 2) {
      // Desk C — Lush mini plant in gradient pot
      const px2 = d.x + 7, py2 = d.y + 30;
      // Pot shadow
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath(); ctx.ellipse(px2 + 9, py2 + 28, 10, 3, 0, 0, Math.PI*2); ctx.fill();
      // Pot gradient (terracotta)
      const potG = ctx.createLinearGradient(px2, py2 + 6, px2 + 18, py2 + 6);
      potG.addColorStop(0, "#7a3c22");
      potG.addColorStop(0.4, "#a05030");
      potG.addColorStop(1, "#5a2c18");
      ctx.fillStyle = potG;
      drawRoundedRect(px2 + 2, py2 + 8, 14, 20, 3); ctx.fill();
      // Pot rim
      const rimG2 = ctx.createLinearGradient(px2, py2 + 5, px2 + 18, py2 + 5);
      rimG2.addColorStop(0, "#8a4428"); rimG2.addColorStop(0.5, "#c06040"); rimG2.addColorStop(1, "#6a3018");
      ctx.fillStyle = rimG2;
      drawRoundedRect(px2, py2 + 5, 18, 5, 3); ctx.fill();
      // Soil
      ctx.fillStyle = "#2a1a0e";
      ctx.beginPath(); ctx.ellipse(px2 + 9, py2 + 8, 7, 2.5, 0, 0, Math.PI*2); ctx.fill();
      // Leaves — layered circles
      const leafCs = ["#1e5e32","#276640","#2e7a4c","#3a9060","#1a4e2a"];
      const leafPs2 = [
        [px2+9,py2+0,9],[px2+4,py2-6,6],[px2+14,py2-5,7],
        [px2+7,py2-11,5],[px2+12,py2-9,5],[px2+9,py2-14,4],
      ];
      leafPs2.forEach(([lx3,ly3,lr3],i) => {
        ctx.fillStyle = leafCs[i % leafCs.length];
        ctx.beginPath(); ctx.arc(lx3, ly3, lr3, 0, Math.PI*2); ctx.fill();
      });
      ctx.fillStyle = "rgba(120,210,140,0.12)";
      ctx.beginPath(); ctx.arc(px2+9,py2-12,3,0,Math.PI*2); ctx.fill();

    } else {
      // Desk D — Tablet with status UI
      // Tablet shadow
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      drawRoundedRect(d.x + 10, d.y + 22, 18, 26, 4); ctx.fill();
      // Tablet body
      fillRoundedWithGradient(d.x + 8, d.y + 20, 18, 26, 4, [
        [0, "#1e1e34"],
        [1, "#0d0d1c"],
      ]);
      // Bezel edge
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      drawRoundedRect(d.x + 8, d.y + 20, 18, 26, 4); ctx.stroke();
      // Screen glow (purple/blue hue)
      ctx.fillStyle = "rgba(100,80,200,0.18)";
      ctx.fillRect(d.x + 10, d.y + 23, 14, 18);
      // Screen UI: mini chart bars
      const barColors = ["rgba(76,168,255,0.6)","rgba(56,209,154,0.6)","rgba(255,160,80,0.6)"];
      [8,12,6].forEach((bh, bi) => {
        ctx.fillStyle = barColors[bi];
        ctx.fillRect(d.x + 11 + bi * 4, d.y + 23 + (14 - bh), 3, bh);
      });
      // Glass reflection diagonal
      const tg2 = ctx.createLinearGradient(d.x + 10, d.y + 23, d.x + 24, d.y + 37);
      tg2.addColorStop(0, "rgba(255,255,255,0.12)");
      tg2.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = tg2;
      ctx.fillRect(d.x + 10, d.y + 23, 14, 18);
      // Home button
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath(); ctx.arc(d.x + 17, d.y + 43, 2.5, 0, Math.PI*2); ctx.fill();
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

    // Zone ambient glow on floor
    const zoneGrad = ctx.createRadialGradient(r.x + r.w/2, r.y + r.h/2, 10, r.x + r.w/2, r.y + r.h/2, 180);
    zoneGrad.addColorStop(0, "rgba(90,55,130,0.14)");
    zoneGrad.addColorStop(1, "rgba(40,20,60,0.0)");
    ctx.fillStyle = zoneGrad;
    ctx.beginPath(); ctx.ellipse(r.x + r.w/2, r.y + r.h, 190, 80, 0, 0, Math.PI * 2); ctx.fill();

    // Zone border (subtle)
    ctx.strokeStyle = "rgba(100,60,160,0.14)";
    ctx.lineWidth = 1.5;
    drawRoundedRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16, 14);
    ctx.stroke();

    // Zone label
    ctx.fillStyle = "rgba(180,165,220,0.55)";
    ctx.font = "600 10px ui-sans-serif,system-ui";
    ctx.letterSpacing = "1px";
    ctx.fillText(r.label, r.x + 5, r.y - 14);
    ctx.letterSpacing = "0px";

    // ── SOFA ──────────────────────────────────────────────────────────
    const sx = r.x + 18, sy = r.y + 30;
    const SW = 148, SH = 68;

    // Drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    drawRoundedRect(sx + 4, sy + 8, SW, SH + 12, 14);
    ctx.fill();

    // Sofa body base gradient
    const sofaBodyGrad = ctx.createLinearGradient(sx, sy + 20, sx, sy + SH + 20);
    sofaBodyGrad.addColorStop(0, "#2d2748");
    sofaBodyGrad.addColorStop(1, "#1e1a32");
    ctx.fillStyle = sofaBodyGrad;
    drawRoundedRect(sx, sy + 22, SW, SH, 12);
    ctx.fill();

    // Sofa backrest gradient
    const backGrad = ctx.createLinearGradient(sx, sy, sx, sy + 30);
    backGrad.addColorStop(0, "#3d3460");
    backGrad.addColorStop(1, "#2a2448");
    ctx.fillStyle = backGrad;
    drawRoundedRect(sx, sy, SW, 28, 10);
    ctx.fill();

    // Backrest top highlight
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    drawRoundedRect(sx + 6, sy + 3, SW - 12, 8, 5);
    ctx.fill();

    // Armrest LEFT
    const armGrad1 = ctx.createLinearGradient(sx, sy + 20, sx + 16, sy + 20);
    armGrad1.addColorStop(0, "#3a3058");
    armGrad1.addColorStop(1, "#2a2445");
    ctx.fillStyle = armGrad1;
    drawRoundedRect(sx, sy + 20, 16, 64, 8);
    ctx.fill();
    // Armrest highlight
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    drawRoundedRect(sx + 3, sy + 20, 5, 64, 4);
    ctx.fill();

    // Armrest RIGHT
    const armGrad2 = ctx.createLinearGradient(sx + SW - 16, sy + 20, sx + SW, sy + 20);
    armGrad2.addColorStop(0, "#2a2445");
    armGrad2.addColorStop(1, "#3a3058");
    ctx.fillStyle = armGrad2;
    drawRoundedRect(sx + SW - 16, sy + 20, 16, 64, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    drawRoundedRect(sx + SW - 8, sy + 20, 5, 64, 4);
    ctx.fill();

    // Seat cushion LEFT
    const cL = ctx.createLinearGradient(sx + 18, sy + 32, sx + 18, sy + 82);
    cL.addColorStop(0, "#38305a");
    cL.addColorStop(1, "#252040");
    ctx.fillStyle = cL;
    drawRoundedRect(sx + 18, sy + 32, 54, 48, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    drawRoundedRect(sx + 18, sy + 32, 54, 48, 8);
    ctx.stroke();

    // Seat cushion RIGHT
    const cR = ctx.createLinearGradient(sx + 76, sy + 32, sx + 76, sy + 82);
    cR.addColorStop(0, "#38305a");
    cR.addColorStop(1, "#252040");
    ctx.fillStyle = cR;
    drawRoundedRect(sx + 76, sy + 32, 54, 48, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    drawRoundedRect(sx + 76, sy + 32, 54, 48, 8);
    ctx.stroke();

    // Cushion top highlight (plush shimmer)
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    drawRoundedRect(sx + 22, sy + 34, 46, 10, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    drawRoundedRect(sx + 80, sy + 34, 46, 10, 4);
    ctx.fill();

    // Throw pillow (accent)
    const pilG = ctx.createLinearGradient(sx + 28, sy + 36, sx + 28, sy + 58);
    pilG.addColorStop(0, "#8860c8");
    pilG.addColorStop(1, "#5a3a90");
    ctx.fillStyle = pilG;
    drawRoundedRect(sx + 28, sy + 36, 26, 22, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    drawRoundedRect(sx + 28, sy + 36, 26, 22, 6);
    ctx.stroke();
    // Pillow X stitch
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(sx + 32, sy + 40); ctx.lineTo(sx + 50, sy + 54);
    ctx.moveTo(sx + 50, sy + 40); ctx.lineTo(sx + 32, sy + 54);
    ctx.stroke();

    // Sofa feet (4 small)
    ctx.fillStyle = "#1a1530";
    [[sx + 20, sy + 88],[sx + SW - 22, sy + 88],[sx + 20, sy + 62],[sx + SW - 22, sy + 62]].forEach(([fx, fy]) => {
      ctx.fillRect(fx, fy, 5, 4);
    });

    // ── COFFEE TABLE ──────────────────────────────────────────────────
    const tx = r.x + 48, ty = r.y + 108;
    const TW = 88, TH = 38;

    // Table shadow
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    drawRoundedRect(tx + 4, ty + 6, TW, TH, 8);
    ctx.fill();

    // Table legs
    ctx.fillStyle = "#2a2018";
    [[tx + 10, ty + TH - 6],[tx + TW - 14, ty + TH - 6]].forEach(([lx2, ly2]) => {
      ctx.fillRect(lx2, ly2, 5, 10);
    });

    // Table surface (dark walnut)
    const tSurfGrad = ctx.createLinearGradient(tx, ty, tx, ty + TH);
    tSurfGrad.addColorStop(0, "#2e2416");
    tSurfGrad.addColorStop(1, "#1a150c");
    ctx.fillStyle = tSurfGrad;
    drawRoundedRect(tx, ty, TW, TH, 8);
    ctx.fill();

    // Wood grain lines
    ctx.save();
    ctx.beginPath(); drawRoundedRect(tx, ty, TW, TH, 8); ctx.clip();
    ctx.strokeStyle = "rgba(60,40,20,0.25)";
    ctx.lineWidth = 1;
    for (let gi = 0; gi < 5; gi++) {
      ctx.beginPath();
      ctx.moveTo(tx + gi * 20, ty);
      ctx.lineTo(tx + gi * 20 - 8, ty + TH);
      ctx.stroke();
    }
    ctx.restore();

    // Glass top overlay
    const glassGrad = ctx.createLinearGradient(tx, ty, tx + TW, ty + TH);
    glassGrad.addColorStop(0, "rgba(160,200,255,0.08)");
    glassGrad.addColorStop(0.5, "rgba(255,255,255,0.03)");
    glassGrad.addColorStop(1, "rgba(160,200,255,0.04)");
    ctx.fillStyle = glassGrad;
    drawRoundedRect(tx, ty, TW, TH, 8);
    ctx.fill();

    // Table outline
    ctx.strokeStyle = "rgba(60,45,28,0.9)";
    ctx.lineWidth = 1.5;
    drawRoundedRect(tx, ty, TW, TH, 8);
    ctx.stroke();

    // Items on table: small book (slightly rotated)
    ctx.save();
    ctx.translate(tx + 16, ty + 10);
    ctx.rotate(-0.12);
    ctx.fillStyle = "#e8e0d0"; ctx.fillRect(0, 0, 22, 14);
    ctx.fillStyle = "#c8bfb0"; ctx.fillRect(0, 12, 22, 2);
    ctx.fillStyle = "rgba(0,0,0,0.08)"; ctx.fillRect(0, 0, 1, 14);
    ctx.restore();

    // Small cup
    ctx.fillStyle = "#5a4540";
    drawRoundedRect(tx + 50, ty + 8, 12, 14, 3); ctx.fill();
    ctx.fillStyle = "#4a8060";
    ctx.fillRect(tx + 52, ty + 9, 8, 4); // tea color
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    drawRoundedRect(tx + 50, ty + 8, 12, 14, 3); ctx.stroke();

    // ── FLOOR LAMP ───────────────────────────────────────────────────
    const lx = r.x + 230, ly = r.y + 18;

    // Lamp ambient glow on floor
    const lampFloorGlow = ctx.createRadialGradient(lx, ly + 148, 0, lx, ly + 148, 55);
    lampFloorGlow.addColorStop(0, "rgba(255,235,180,0.14)");
    lampFloorGlow.addColorStop(1, "rgba(255,235,180,0)");
    ctx.fillStyle = lampFloorGlow;
    ctx.beginPath(); ctx.ellipse(lx, ly + 148, 55, 22, 0, 0, Math.PI * 2); ctx.fill();

    // Pole (metallic)
    const poleGrad = ctx.createLinearGradient(lx - 3, 0, lx + 3, 0);
    poleGrad.addColorStop(0, "#444");
    poleGrad.addColorStop(0.4, "#888");
    poleGrad.addColorStop(1, "#333");
    ctx.strokeStyle = poleGrad;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(lx, ly + 145);
    ctx.lineTo(lx, ly + 32);
    ctx.stroke();

    // Base plate
    const baseGrad = ctx.createLinearGradient(lx - 18, ly + 148, lx + 18, ly + 148);
    baseGrad.addColorStop(0, "#333");
    baseGrad.addColorStop(0.5, "#555");
    baseGrad.addColorStop(1, "#2a2a2a");
    ctx.fillStyle = baseGrad;
    ctx.beginPath(); ctx.ellipse(lx, ly + 148, 18, 6, 0, 0, Math.PI * 2); ctx.fill();

    // Lamp shade (cone with gradient)
    ctx.save();
    const shadeGrad = ctx.createLinearGradient(lx, ly, lx, ly + 34);
    shadeGrad.addColorStop(0, "#c0a060");
    shadeGrad.addColorStop(1, "#f0d890");
    ctx.fillStyle = shadeGrad;
    ctx.beginPath();
    ctx.moveTo(lx - 20, ly + 34);
    ctx.bezierCurveTo(lx - 20, ly + 34, lx - 10, ly + 4, lx - 10, ly);
    ctx.lineTo(lx + 10, ly);
    ctx.bezierCurveTo(lx + 10, ly + 4, lx + 20, ly + 34, lx + 20, ly + 34);
    ctx.closePath();
    ctx.fill();

    // Shade inner glow
    ctx.fillStyle = "rgba(255,240,180,0.55)";
    ctx.beginPath();
    ctx.moveTo(lx - 8, ly + 32);
    ctx.lineTo(lx + 8, ly + 32);
    ctx.lineTo(lx + 5, ly + 8);
    ctx.lineTo(lx - 5, ly + 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Light cone downward (soft warm glow)
    const coneGrad = ctx.createLinearGradient(lx, ly + 34, lx, ly + 100);
    coneGrad.addColorStop(0, "rgba(255,230,150,0.10)");
    coneGrad.addColorStop(1, "rgba(255,230,150,0)");
    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(lx - 20, ly + 34);
    ctx.lineTo(lx - 55, ly + 100);
    ctx.lineTo(lx + 55, ly + 100);
    ctx.lineTo(lx + 20, ly + 34);
    ctx.closePath();
    ctx.fill();

    // ── POTTED PLANT ─────────────────────────────────────────────────
    const px = r.x - 28, py = r.y + 112;

    // Pot shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(px + 14, py + 34, 16, 5, 0, 0, Math.PI * 2); ctx.fill();

    // Pot body gradient (terracotta)
    const potGrad = ctx.createLinearGradient(px, py + 4, px + 28, py + 4);
    potGrad.addColorStop(0, "#7a3c22");
    potGrad.addColorStop(0.4, "#a05030");
    potGrad.addColorStop(1, "#5a2c18");
    ctx.fillStyle = potGrad;
    drawRoundedRect(px + 2, py + 6, 24, 28, 5);
    ctx.fill();

    // Pot rim
    const rimGrad = ctx.createLinearGradient(px, py, px + 28, py);
    rimGrad.addColorStop(0, "#8a4428");
    rimGrad.addColorStop(0.5, "#c06040");
    rimGrad.addColorStop(1, "#7a3820");
    ctx.fillStyle = rimGrad;
    drawRoundedRect(px, py + 4, 28, 6, 4);
    ctx.fill();

    // Soil
    ctx.fillStyle = "#2a1a0e";
    ctx.beginPath(); ctx.ellipse(px + 14, py + 9, 10, 4, 0, 0, Math.PI * 2); ctx.fill();

    // Leaves (multiple overlapping circles for bushiness)
    const leafColors = ["#1e5e32","#276640","#2e7a4c","#3a9060","#1a4e2a"];
    const leafPositions = [
      [px + 14, py - 8, 16],[px + 6, py - 16, 11],[px + 22, py - 14, 12],
      [px + 10, py - 22, 9],[px + 20, py - 20, 9],[px + 14, py - 26, 8],
      [px + 4, py - 8, 8],[px + 24, py - 8, 8],
    ];
    leafPositions.forEach(([lx2, ly2, lr], i) => {
      ctx.fillStyle = leafColors[i % leafColors.length];
      ctx.beginPath(); ctx.arc(lx2, ly2, lr, 0, Math.PI * 2); ctx.fill();
    });

    // Leaf highlight (top highlight for 3D roundness)
    ctx.fillStyle = "rgba(100,200,120,0.12)";
    ctx.beginPath(); ctx.arc(px + 14, py - 24, 5, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  // --- Copier ---
  function drawCopier(cx, cy) {
    ctx.save();
    const CW = 65, CH = 46;
    const DEPTH = 6;
    const LID_H = 8;
    const TRAY_H = 7;

    // Drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(cx + CW/2 + 3, cy + CH + TRAY_H + 5, CW * 0.46, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Right side face (3-D)
    const sideGrad = ctx.createLinearGradient(cx + CW, cy, cx + CW + DEPTH, cy);
    sideGrad.addColorStop(0, "#1a1c22"); sideGrad.addColorStop(1, "#0e1014");
    ctx.fillStyle = sideGrad;
    ctx.beginPath();
    ctx.moveTo(cx + CW,         cy);
    ctx.lineTo(cx + CW + DEPTH, cy - DEPTH * 0.6);
    ctx.lineTo(cx + CW + DEPTH, cy + CH + TRAY_H - DEPTH * 0.6);
    ctx.lineTo(cx + CW,         cy + CH + TRAY_H);
    ctx.closePath();
    ctx.fill();

    // Top face (3-D)
    const topGrad = ctx.createLinearGradient(cx, cy - LID_H, cx, cy - LID_H - DEPTH * 0.6);
    topGrad.addColorStop(0, "#3a3e4a"); topGrad.addColorStop(1, "#2a2e38");
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.moveTo(cx,              cy - LID_H);
    ctx.lineTo(cx + CW,         cy - LID_H);
    ctx.lineTo(cx + CW + DEPTH, cy - LID_H - DEPTH * 0.6);
    ctx.lineTo(cx + DEPTH,      cy - LID_H - DEPTH * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + DEPTH, cy - LID_H - DEPTH * 0.6);
    ctx.lineTo(cx + CW + DEPTH, cy - LID_H - DEPTH * 0.6);
    ctx.stroke();

    // Scanner lid
    const lidGrad = ctx.createLinearGradient(cx, cy - LID_H, cx, cy);
    lidGrad.addColorStop(0, "#3c4050"); lidGrad.addColorStop(1, "#2a2e3c");
    ctx.fillStyle = lidGrad;
    drawRoundedRect(cx, cy - LID_H, CW, LID_H, 2); ctx.fill();

    // Scanner glass strip
    ctx.fillStyle = "#d0e4f0";
    ctx.fillRect(cx + 4, cy - 2, CW - 8, 3);
    const glare = ctx.createLinearGradient(cx + 4, cy - 2, cx + CW - 4, cy - 2);
    glare.addColorStop(0, "rgba(255,255,255,0.55)");
    glare.addColorStop(1, "rgba(255,255,255,0.05)");
    ctx.fillStyle = glare;
    ctx.fillRect(cx + 4, cy - 2, CW - 8, 3);

    // Hinge
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(cx, cy, CW, 2);

    // Main body
    const bodyGrad = ctx.createLinearGradient(cx, cy, cx, cy + CH);
    bodyGrad.addColorStop(0, "#2e3240");
    bodyGrad.addColorStop(1, "#1c1f2c");
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(cx, cy, CW, CH);
    // Edge highlight
    const edgeHi = ctx.createLinearGradient(cx, cy, cx + 5, cy);
    edgeHi.addColorStop(0, "rgba(255,255,255,0.08)");
    edgeHi.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = edgeHi;
    ctx.fillRect(cx, cy, 5, CH);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(cx, cy, CW, 4);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.strokeRect(cx, cy, CW, CH);

    // Paper output tray
    const trayGrad = ctx.createLinearGradient(cx, cy + CH, cx, cy + CH + TRAY_H);
    trayGrad.addColorStop(0, "#1a1c28"); trayGrad.addColorStop(1, "#111318");
    ctx.fillStyle = trayGrad;
    ctx.beginPath();
    ctx.moveTo(cx + 3,      cy + CH);
    ctx.lineTo(cx + CW - 3, cy + CH);
    ctx.lineTo(cx + CW - 6, cy + CH + TRAY_H);
    ctx.lineTo(cx + 6,      cy + CH + TRAY_H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Paper in tray
    ctx.fillStyle = "#eef2f8";
    ctx.beginPath();
    ctx.moveTo(cx + 9,      cy + CH + 1);
    ctx.lineTo(cx + CW - 12, cy + CH + 1);
    ctx.lineTo(cx + CW - 14, cy + CH + TRAY_H - 1);
    ctx.lineTo(cx + 11,     cy + CH + TRAY_H - 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d8dce8";
    ctx.fillRect(cx + 9, cy + CH + 3, CW - 22, 0.8);
    ctx.fillRect(cx + 9, cy + CH + 5, CW - 24, 0.8);

    // Control panel (right side)
    const px = cx + CW - 21, py = cy + 5, pw = 16, ph = 26;
    const panelGrad = ctx.createLinearGradient(px, py, px, py + ph);
    panelGrad.addColorStop(0, "#1e2230"); panelGrad.addColorStop(1, "#151820");
    ctx.fillStyle = panelGrad;
    drawRoundedRect(px, py, pw, ph, 3); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    drawRoundedRect(px, py, pw, ph, 3); ctx.stroke();
    // LCD
    const lcdG = ctx.createLinearGradient(px + 2, py + 3, px + 2, py + 13);
    lcdG.addColorStop(0, "#1a3a28"); lcdG.addColorStop(1, "#0e2018");
    ctx.fillStyle = lcdG;
    drawRoundedRect(px + 2, py + 3, pw - 4, 12, 2); ctx.fill();
    ctx.fillStyle = "rgba(56,209,154,0.80)";
    ctx.fillRect(px + 3, py + 5, 9, 1.2);
    ctx.fillStyle = "rgba(56,209,154,0.45)";
    ctx.fillRect(px + 3, py + 8, 7, 1);
    ctx.fillRect(px + 3, py + 10, 8, 1);
    // Buttons
    const btnC = ["#38d19a","#4aa3ff","#ff5f6d"];
    btnC.forEach((bc, bi) => {
      const bx2 = px + 3 + bi * 4, by2 = py + 19;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath(); ctx.arc(bx2 + 0.8, by2 + 0.8, 1.6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = bc;
      ctx.beginPath(); ctx.arc(bx2, by2, 1.6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.arc(bx2 - 0.5, by2 - 0.5, 0.6, 0, Math.PI*2); ctx.fill();
    });
    // Status LED blink
    const ledOn = Math.floor(Date.now() / 900) % 2 === 0;
    ctx.fillStyle = ledOn ? "#38d19a" : "#1a4030";
    ctx.beginPath(); ctx.arc(px + 8, py + 24, 1.5, 0, Math.PI*2); ctx.fill();
    if (ledOn) {
      ctx.fillStyle = "rgba(56,209,154,0.22)";
      ctx.beginPath(); ctx.arc(px + 8, py + 24, 3.5, 0, Math.PI*2); ctx.fill();
    }

    // Feed slot (top)
    ctx.fillStyle = "rgba(0,0,0,0.50)";
    ctx.fillRect(cx + 5, cy + 2, CW - 28, 3);

    // Ventilation grilles (lower left)
    for (let vi = 0; vi < 4; vi++) {
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.fillRect(cx + 5 + vi * 4, cy + CH - 8, 2, 5);
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(cx + 5 + vi * 4, cy + CH - 8, 2, 1);
    }

    // Brand text
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.font = "bold 6px ui-sans-serif,system-ui";
    ctx.fillText("COPY", cx + 6, cy + 14);

    ctx.restore();
  }

  // --- Sofa seat occluder ---
  // Redraws cushion FACES on top of agent to hide legs; head & body (y<362) untouched
  function drawSofaSeatOccluder() {
    const r = room.rest;
    const sx = r.x + 18, sy = r.y + 30;
    ctx.save();

    // Sofa body face — covers agent legs (from sy+22=352 downward)
    const sofaBodyGrad = ctx.createLinearGradient(sx, sy + 20, sx, sy + 90);
    sofaBodyGrad.addColorStop(0, "#2d2748");
    sofaBodyGrad.addColorStop(1, "#1e1a32");
    ctx.fillStyle = sofaBodyGrad;
    drawRoundedRect(sx, sy + 22, 148, 68, 12);
    ctx.fill();

    // Left cushion front
    const cL = ctx.createLinearGradient(sx + 18, sy + 32, sx + 18, sy + 82);
    cL.addColorStop(0, "#38305a");
    cL.addColorStop(1, "#252040");
    ctx.fillStyle = cL;
    drawRoundedRect(sx + 18, sy + 32, 54, 48, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    drawRoundedRect(sx + 18, sy + 32, 54, 48, 8);
    ctx.stroke();

    // Right cushion front
    const cR = ctx.createLinearGradient(sx + 76, sy + 32, sx + 76, sy + 82);
    cR.addColorStop(0, "#38305a");
    cR.addColorStop(1, "#252040");
    ctx.fillStyle = cR;
    drawRoundedRect(sx + 76, sy + 32, 54, 48, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    drawRoundedRect(sx + 76, sy + 32, 54, 48, 8);
    ctx.stroke();

    // Cushion top highlights
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    drawRoundedRect(sx + 22, sy + 34, 46, 10, 4); ctx.fill();
    drawRoundedRect(sx + 80, sy + 34, 46, 10, 4); ctx.fill();

    // Throw pillow (accent)
    const pilG = ctx.createLinearGradient(sx + 28, sy + 36, sx + 28, sy + 58);
    pilG.addColorStop(0, "#8860c8");
    pilG.addColorStop(1, "#5a3a90");
    ctx.fillStyle = pilG;
    drawRoundedRect(sx + 28, sy + 36, 26, 22, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    drawRoundedRect(sx + 28, sy + 36, 26, 22, 6);
    ctx.stroke();

    ctx.restore();
  }

  // --- Bookshelf ---
  function drawBookshelf() {
    ctx.save();
    const bx = 18, by = 48;
    const BW = 50, BH = 130;

    // Drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(bx + 4, by + 6, BW, BH);

    // Side panel (right face - 3D depth illusion)
    const sideGrad = ctx.createLinearGradient(bx + BW, by, bx + BW + 8, by);
    sideGrad.addColorStop(0, "#1a1208");
    sideGrad.addColorStop(1, "#0e0c06");
    ctx.fillStyle = sideGrad;
    ctx.beginPath();
    ctx.moveTo(bx + BW, by);
    ctx.lineTo(bx + BW + 8, by - 5);
    ctx.lineTo(bx + BW + 8, by + BH - 5);
    ctx.lineTo(bx + BW, by + BH);
    ctx.closePath();
    ctx.fill();

    // Top face (3D top)
    const topGrad = ctx.createLinearGradient(bx, by, bx, by - 5);
    topGrad.addColorStop(0, "#3a2e1c");
    topGrad.addColorStop(1, "#2a2014");
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + BW, by);
    ctx.lineTo(bx + BW + 8, by - 5);
    ctx.lineTo(bx + 8, by - 5);
    ctx.closePath();
    ctx.fill();

    // Main cabinet body
    const bodyGrad = ctx.createLinearGradient(bx, by, bx + BW, by);
    bodyGrad.addColorStop(0, "#2c2214");
    bodyGrad.addColorStop(0.4, "#342a18");
    bodyGrad.addColorStop(1, "#221a0e");
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(bx, by, BW, BH);

    // Wood grain lines
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, BW, BH); ctx.clip();
    ctx.strokeStyle = "rgba(10,6,2,0.18)";
    ctx.lineWidth = 1;
    for (let gi = 0; gi < 6; gi++) {
      ctx.beginPath();
      ctx.moveTo(bx + gi * 10, by);
      ctx.lineTo(bx + gi * 10 + 2, by + BH);
      ctx.stroke();
    }
    ctx.restore();

    // Outer border
    ctx.strokeStyle = "#4a3820";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, BW, BH);

    // Book data per shelf [color, width, hasTitle]
    const shelfBooks = [
      [ ["#b03030","#3a6aaa","#2a8840","#9a6020","#5a3a88","#c08020"], [7,8,6,9,7,6] ],
      [ ["#1a5a8a","#a04040","#4a7a30","#7a3a6a","#308060","#c04428"], [8,6,9,7,6,8] ],
      [ ["#8a2828","#2a4a8a","#3a6a28","#8a6818","#4a2a78","#208858"], [6,9,7,8,6,9] ],
      [ ["#aa3820","#286898","#5a8030","#9a5014","#3a3080","#1a7850"], [9,7,6,7,8,6] ],
    ];

    shelfBooks.forEach(([colors, widths], row) => {
      const shelfY = by + 8 + row * 30;
      const shelfH = 22;

      // Shelf board (wooden)
      const shelfGrad = ctx.createLinearGradient(bx + 2, shelfY + shelfH, bx + 2, shelfY + shelfH + 4);
      shelfGrad.addColorStop(0, "#1a1208");
      shelfGrad.addColorStop(1, "#2a2010");
      ctx.fillStyle = shelfGrad;
      ctx.fillRect(bx + 2, shelfY + shelfH, BW - 4, 4);

      // Draw books
      let bookX = bx + 4;
      colors.forEach((color, j) => {
        const bkW = widths[j];
        const tilt = (j % 3 === 1) ? 1 : 0; // slight lean for middle books

        // Book shadow (thin right edge)
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(bookX + bkW - 1, shelfY + tilt, 2, shelfH - tilt);

        // Book body gradient
        const bkGrad = ctx.createLinearGradient(bookX, shelfY, bookX + bkW, shelfY);
        bkGrad.addColorStop(0, shadeColor(color, -20));
        bkGrad.addColorStop(0.3, color);
        bkGrad.addColorStop(1, shadeColor(color, -10));
        ctx.fillStyle = bkGrad;
        ctx.fillRect(bookX, shelfY + tilt, bkW, shelfH - tilt);

        // Book top highlight
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(bookX, shelfY + tilt, bkW, 2);

        // Spine line detail (thin vertical)
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.fillRect(bookX, shelfY + tilt, 1, shelfH - tilt);

        // Title line (horizontal stripe on spine)
        if (bkW >= 7) {
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.fillRect(bookX + 1, shelfY + tilt + 5, bkW - 2, 1.5);
          ctx.fillRect(bookX + 1, shelfY + tilt + 8, bkW - 2, 1);
        }

        bookX += bkW + 1;
      });

      // Small decorative object at end of some shelves
      if (row === 0) {
        // Tiny clock
        ctx.fillStyle = "#1a1a2e";
        drawRoundedRect(bookX + 1, shelfY, 8, shelfH, 2); ctx.fill();
        ctx.fillStyle = "rgba(76,168,255,0.6)";
        ctx.beginPath(); ctx.arc(bookX + 5, shelfY + 11, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(bookX + 5, shelfY + 11); ctx.lineTo(bookX + 5, shelfY + 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bookX + 5, shelfY + 11); ctx.lineTo(bookX + 7, shelfY + 12); ctx.stroke();
      } else if (row === 2) {
        // Tiny plant
        ctx.fillStyle = "#5a3010";
        ctx.fillRect(bookX + 2, shelfY + 14, 7, 8);
        ctx.fillStyle = "#2a6a30";
        ctx.beginPath(); ctx.arc(bookX + 5, shelfY + 11, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3a8040";
        ctx.beginPath(); ctx.arc(bookX + 3, shelfY + 9, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bookX + 7, shelfY + 9, 3, 0, Math.PI * 2); ctx.fill();
      }
    });

    // Front trim (bottom base)
    const baseGrad = ctx.createLinearGradient(bx, by + BH, bx, by + BH + 5);
    baseGrad.addColorStop(0, "#1a1208");
    baseGrad.addColorStop(1, "#0e0c06");
    ctx.fillStyle = baseGrad;
    ctx.fillRect(bx, by + BH, BW, 5);

    // Inner shadow (left side, gives depth)
    const innerShad = ctx.createLinearGradient(bx, by, bx + 8, by);
    innerShad.addColorStop(0, "rgba(0,0,0,0.30)");
    innerShad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = innerShad;
    ctx.fillRect(bx, by, 8, BH);

    ctx.restore();
  }

  // --- Draw Agent (character with traits from IDENTITY.md) ---
  
  function drawAgentSittingBack(c, bob) {
    // Sitting on chair, back to viewer.
    // agent.y = chairY + 10 → body (chairY-2 to chairY+13) mostly behind backrest occluder ✓
    // head (chairY-8) clears above backrest top ✓
    const g = getMyChairGeom();
    const seatSurfY = g.seatY;
    const thighStartY = agent.y + 3 + bob;   // hip / trouser-seat level
    const thighEndY   = seatSurfY + bob;      // where knee meets the seat edge

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(agent.x, seatSurfY + 10, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── THIGHS — horizontal, resting on seat, going outward ──────
    // (drawn before body so body overlaps)
    const bodyColor = c;
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(agent.x - 7, thighStartY);
    ctx.lineTo(agent.x - 22, thighEndY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(agent.x + 7, thighStartY);
    ctx.lineTo(agent.x + 22, thighEndY);
    ctx.stroke();

    // Lower legs dangling down from knee
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(agent.x - 22, thighEndY);
    ctx.lineTo(agent.x - 20, thighEndY + 10 + bob);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(agent.x + 22, thighEndY);
    ctx.lineTo(agent.x + 20, thighEndY + 10 + bob);
    ctx.stroke();

    // ── BODY (back view) ─────────────────────────────────────────
    const by = agent.y + bob;
    ctx.fillStyle = bodyColor;
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

    // ── ARMS — reaching forward to keyboard ───────────────────────
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 3;
    const t = agent.frame * 6;
    ctx.beginPath();
    ctx.moveTo(agent.x - 10, by - 2);
    ctx.lineTo(agent.x - 16, by - 12 + Math.sin(t) * 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(agent.x + 10, by - 2);
    ctx.lineTo(agent.x + 16, by - 12 + Math.sin(t + 1) * 1.2);
    ctx.stroke();

    // ── CHAIR BACKREST OCCLUDER (covers torso, keeps head visible) ─
    drawMyChairBackOccluder();

    // ── HEAD ─────────────────────────────────────────────────────
    ctx.fillStyle = traits.skinColor;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y - 18 + bob, 11, 0, Math.PI * 2);
    ctx.fill();

    // ── HAIR (back view — full cover) ─────────────────────────────
    ctx.fillStyle = traits.hairColor;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y - 19 + bob, 12, 0, Math.PI * 2);
    ctx.fill();
    // long side strands
    ctx.fillRect(agent.x - 12, agent.y - 19 + bob, 4, 20);
    ctx.fillRect(agent.x + 8,  agent.y - 19 + bob, 4, 20);
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
    // ── same flat pixel art style as the walking agent ──

    const bodyColor = traits.dressColor || c;
    const t = agent.frame * 2.2;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(agent.x, agent.y + 22, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs (bent, same stroke style as walking)
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(agent.x - 6, agent.y + 8 + bob);
    ctx.lineTo(agent.x - 10, agent.y + 18 + bob);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(agent.x + 6, agent.y + 8 + bob);
    ctx.lineTo(agent.x + 10, agent.y + 18 + bob);
    ctx.stroke();

    // Body — same flat polygon as walking
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(agent.x - 12, agent.y + 10 + bob);
    ctx.lineTo(agent.x + 12, agent.y + 10 + bob);
    ctx.lineTo(agent.x + 10, agent.y - 8 + bob);
    ctx.lineTo(agent.x - 10, agent.y - 8 + bob);
    ctx.closePath();
    ctx.fill();

    // Arms resting outward on sofa armrests
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(agent.x - 11, agent.y - 2 + bob);
    ctx.lineTo(agent.x - 20, agent.y + 2 + bob + Math.sin(t) * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(agent.x + 11, agent.y - 2 + bob);
    ctx.lineTo(agent.x + 20, agent.y + 2 + bob + Math.sin(t + 1) * 0.4);
    ctx.stroke();

    // Head — same plain circle as walking
    ctx.fillStyle = traits.skinColor;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y - 18 + bob, 11, 0, Math.PI * 2);
    ctx.fill();

    // Hair — same arc + rects + tip circles as walking
    ctx.fillStyle = traits.hairColor;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y - 22 + bob, 12, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.fillRect(agent.x - 12, agent.y - 22 + bob, 4, 18);
    ctx.fillRect(agent.x + 8,  agent.y - 22 + bob, 4, 18);
    ctx.beginPath();
    ctx.arc(agent.x - 11, agent.y - 4 + bob, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(agent.x + 11, agent.y - 4 + bob, 3, 0, Math.PI * 2);
    ctx.fill();

    // Eyes — same ellipse blink as walking
    ctx.fillStyle = traits.eyeColor;
    const blink = Math.sin(agent.frame * 0.8) > 0.95 ? 0.5 : 2;
    ctx.beginPath();
    ctx.ellipse(agent.x - 4, agent.y - 19 + bob, 1.5, blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(agent.x + 4, agent.y - 19 + bob, 1.5, blink, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mouth — same arc stroke as walking
    ctx.strokeStyle = traits.lipColor || "#a0705a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y - 14 + bob, 3, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    // Earrings — same plain circles as walking
    ctx.fillStyle = traits.earringColor;
    ctx.beginPath();
    ctx.arc(agent.x - 11, agent.y - 14 + bob, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(agent.x + 11, agent.y - 14 + bob, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Helper: shade a hex color (kept for desk accessories)
  function shadeColor(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
    const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
    return `rgb(${r},${g},${b})`;
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

    // Copiers — right of bookshelf, against back wall
    drawCopier(120, 58);
    drawCopier(255, 58);

    room.desks.forEach((d, i) => drawGuestDesk(d, i));

    drawMyDesk();
    drawRestArea();
    drawAgent();

    // Redraw sofa seat cushions on top of agent when sitting — hides legs
    {
      const _st = status.state;
      const _mv = Math.hypot(agent.vx, agent.vy) > 5;
      if ((_st === "idle" || _st === "rate_limited") && !_mv) {
        drawSofaSeatOccluder();
      }
    }

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
