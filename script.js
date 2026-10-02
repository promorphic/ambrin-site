// Ambrin: site behaviour. No dependencies, no build step.
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ------------------------------------------------------------------
     Nav: light/dark state over sections, mobile menu
     ------------------------------------------------------------------ */
  const nav = $("#nav");
  const toggle = $("#navToggle");
  const links = $("#navLinks");
  const lightSections = $$('[data-nav="light"]');

  let navTick = false;
  const updateNav = () => {
    navTick = false;
    const probe = nav.getBoundingClientRect().bottom - 8;
    const onLight = lightSections.some((s) => {
      const r = s.getBoundingClientRect();
      return r.top <= probe && r.bottom >= probe;
    });
    nav.classList.toggle("on-light", onLight);
  };
  window.addEventListener("scroll", () => { if (!navTick) { navTick = true; requestAnimationFrame(updateNav); } }, { passive: true });
  window.addEventListener("resize", updateNav);
  updateNav();

  const setMenu = (open) => {
    links.classList.toggle("open", open);
    nav.classList.toggle("menu", open);
    document.body.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
  links.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") { setMenu(false); toggle.focus(); }
  });
  window.matchMedia("(min-width: 960px)").addEventListener("change", (e) => { if (e.matches) setMenu(false); });

  /* ------------------------------------------------------------------
     Tabs (WAI-ARIA, automatic activation, arrow keys + Home/End)
     ------------------------------------------------------------------ */
  $$("[data-tabs]").forEach((root) => {
    const list = $('[role="tablist"]', root);
    const tabs = $$('[role="tab"]', list);
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) {
          panel.hidden = !on;
          if (on) { panel.classList.remove("fade"); void panel.offsetWidth; panel.classList.add("fade"); }
        }
      });
      if (focus) tab.focus();
      root.dispatchEvent(new CustomEvent("tabchange", { detail: tab }));
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(tab, false));
      tab.addEventListener("keydown", (e) => {
        let j = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); select(tabs[j], true); }
      });
    });
  });

  /* ------------------------------------------------------------------
     Syntax highlighting (hand-rolled, three grammars)
     ------------------------------------------------------------------ */
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const KEYWORDS = {
    ts: /^(?:import|from|const|let|var|await|async|new|return|export|function|if|else|true|false|null|undefined)$/,
    py: /^(?:import|from|as|def|return|if|else|for|in|None|True|False|await|async|with|lambda)$/,
    json: /^(?:true|false|null)$/,
  };
  const GRAMMAR = {
    c: /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)|([{}()[\];,.:=<>+\-*/])/g,
    py: /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d[\d_.]*\b)|([A-Za-z_]\w*)|([{}()[\];,.:=<>+\-*/])/g,
  };
  const highlight = (src, lang) => {
    const re = new RegExp((lang === "py" ? GRAMMAR.py : GRAMMAR.c).source, "g");
    let out = "", last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      const [tok, com, str, num, id, punc] = m;
      const next = src.slice(re.lastIndex, re.lastIndex + 3);
      const prev = src[m.index - 1];
      let cls = "";
      if (com) cls = "c";
      else if (str) cls = lang === "json" && /^\s*:/.test(next) ? "a" : "s";
      else if (num) cls = "n";
      else if (id) {
        if (KEYWORDS[lang].test(id)) cls = "k";
        else if (next[0] === "(") cls = /^[A-Z]/.test(id) ? "t" : "f";
        else if (lang === "py" && /^=[^=]/.test(next)) cls = "a";
        else if (lang === "ts" && next[0] === ":") cls = "a";
        else if (prev === ".") cls = "v";
        else if (/^[A-Z]/.test(id)) cls = "t";
      } else if (punc) cls = "p";
      out += cls ? `<span class="tk-${cls}">${esc(tok)}</span>` : esc(tok);
      last = re.lastIndex;
    }
    out += esc(src.slice(last));
    return out.split("\n").map((l) => `<span class="line">${l || " "}</span>`).join("");
  };
  $$("pre.code[data-lang]").forEach((pre) => {
    const code = $("code", pre);
    const raw = code.textContent.replace(/\s+$/, "");
    pre.dataset.raw = raw;
    code.innerHTML = highlight(raw, pre.dataset.lang);
  });

  // Copy button on the editor
  const copyBtn = $("#copyBtn");
  if (copyBtn) {
    const labelEl = $("span", copyBtn);
    copyBtn.addEventListener("click", async () => {
      const pre = $('.editor [role="tabpanel"]:not([hidden]) pre');
      if (!pre) return;
      let ok = true;
      try { await navigator.clipboard.writeText(pre.dataset.raw); } catch (_) { ok = false; }
      labelEl.textContent = ok ? "Copied" : "Press Ctrl+C";
      copyBtn.classList.toggle("done", ok);
      if (!ok) { const sel = getSelection(); const range = document.createRange(); range.selectNodeContents(pre); sel.removeAllRanges(); sel.addRange(range); }
      setTimeout(() => { labelEl.textContent = "Copy"; copyBtn.classList.remove("done"); }, 1800);
    });
  }

  /* ------------------------------------------------------------------
     Small generated visuals
     ------------------------------------------------------------------ */
  $$(".cells").forEach((el) => {
    const n = +el.dataset.n || 0, on = +el.dataset.on || 0;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) { const c = document.createElement("i"); if (i < on) c.className = "on"; frag.appendChild(c); }
    el.appendChild(frag);
  });

  // Provider node in "How it works": capacity being sold, one cell at a time
  const provCells = $(".flow .cells");
  if (provCells && !reduceMotion) {
    const base = +provCells.dataset.on || 0;
    let on = base;
    setInterval(() => {
      if (document.hidden) return;
      on = on >= base + 12 ? base : on + 1;
      Array.from(provCells.children).forEach((cell, i) => cell.classList.toggle("on", i < on));
    }, 1500);
  }

  /* ------------------------------------------------------------------
     Receipt: view as buyer / provider / anyone else
     ------------------------------------------------------------------ */
  const receipt = $("#receiptCard");
  const viewNote = $("#viewNote");
  const VIEW_NOTES = {
    buyer: "The buyer sees the full receipt, plus its own wallet balance after the call.",
    provider: "The provider sees the same receipt. It does not see the buyer's wallet, budget, or calls to other providers.",
    other: "Everyone else sees nothing. Not the amount, not the parties, not the fact that a call was made.",
  };
  $$('#viewAs input[name="viewas"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      receipt.dataset.view = input.value;
      viewNote.textContent = VIEW_NOTES[input.value];
    });
  });

  /* ------------------------------------------------------------------
     Reveal on scroll
     ------------------------------------------------------------------ */
  const revealGroups = [".head", ".meter", ".trio > li", ".flow-step", ".prod", ".fineprint", ".rc-copy", ".rc-stage", ".dash", ".notes > li",
    ".dev-copy", ".editor", ".side", ".timeline", ".reasons > div", ".faq-head", ".faq-list", ".cta-copy"];
  const revealEls = $$(revealGroups.join(","));
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("in"));
  } else {
    revealEls.forEach((el) => {
      el.classList.add("reveal");
      const sibs = Array.from(el.parentElement.children).filter((c) => c.matches(revealGroups.join(",")));
      const idx = sibs.indexOf(el);
      if (idx > 0) el.style.transitionDelay = Math.min(idx * 80, 320) + "ms";
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
    revealEls.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------------
     Glyph field: a hex-packed matrix of small symbols, lit by a shape.
     Used for the hero dial and the closing mark.
     ------------------------------------------------------------------ */
  const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

  function glyphField(canvas, shape) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1, cells = [], raf = 0, visible = false, lastDraw = 0;
    const state = { fill: 0.34, pulse: -1 };

    const build = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      w = r.width; h = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      const pitch = w < 520 ? 9 : 11;
      const rowH = pitch * 0.866;
      const geo = shape.setup(w, h);
      cells = [];
      const rows = Math.ceil(h / rowH) + 1, cols = Math.ceil(w / pitch) + 1;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x = i * pitch + (j % 2 ? pitch / 2 : 0), y = j * rowH;
          const rnd = hash(i, j);
          const v = shape.at(x, y, geo, rnd);
          if (!v || v.a < 0.03) continue;
          const k = hash(j + 7, i + 3);
          // solid shapes carry the form; outlines and asterisks are texture
          const kind = v.z === 1 ? (k < 0.42 ? 0 : k < 0.66 ? 2 : k < 0.84 ? 4 : k < 0.93 ? 1 : 3) : Math.floor(k * 5);
          cells.push({ x, y, a: v.a, u: v.u, z: v.z || 0, kind, ph: rnd * 6.283, sp: 0.6 + hash(i + 11, j + 5) * 1.6, s: pitch });
        }
      }
      draw(performance.now());
    };

    const glyph = (c, size) => {
      const { x, y } = c;
      switch (c.kind) {
        case 0: ctx.beginPath(); ctx.arc(x, y, size, 0, 6.283); ctx.fill(); break;
        case 1: ctx.beginPath(); ctx.arc(x, y, size * 0.9, 0, 6.283); ctx.stroke(); break;
        case 2: ctx.beginPath();
          for (let k = 0; k < 6; k++) { const ang = 1.0472 * k + 0.5236; ctx[k ? "lineTo" : "moveTo"](x + Math.cos(ang) * size * 1.15, y + Math.sin(ang) * size * 1.15); }
          ctx.closePath(); ctx.fill(); break;
        case 3: ctx.beginPath();
          for (let k = 0; k < 3; k++) { const ang = 1.0472 * k + 0.5236; const dx = Math.cos(ang) * size * 1.2, dy = Math.sin(ang) * size * 1.2; ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); }
          ctx.stroke(); break;
        default: ctx.beginPath(); ctx.moveTo(x, y - size * 1.2); ctx.lineTo(x + size * 1.2, y); ctx.lineTo(x, y + size * 1.2); ctx.lineTo(x - size * 1.2, y); ctx.closePath(); ctx.fill();
      }
    };

    const draw = (t) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      const time = t / 1000;
      const paint = (c, a) => {
        const hot = clamp((a - 0.25) / 0.55, 0, 1), white = clamp((a - 0.92) / 0.33, 0, 1);
        const r = Math.round(150 + 105 * hot), g = Math.round(138 + 30 * hot + 52 * white), b = Math.round(120 - 82 * hot + 96 * white);
        const alpha = clamp(0.14 + a * 0.86, 0, 1);
        ctx.fillStyle = ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
        glyph(c, c.s * (0.2 + 0.15 * Math.min(a, 1)));
      };
      const bright = [];
      ctx.shadowBlur = 0;
      for (const c of cells) {
        let a = c.a * shape.mod(c, state, time);
        if (!reduceMotion) a *= 0.8 + 0.2 * Math.sin(time * c.sp + c.ph);
        if (a < 0.03) continue;
        a = Math.min(a, 1.25);
        if (a > 0.62) bright.push(c, a); else paint(c, a);
      }
      // lit cells get a soft bloom
      ctx.shadowColor = "rgba(255, 150, 20, 0.85)";
      ctx.shadowBlur = 9 * dpr;
      for (let i = 0; i < bright.length; i += 2) paint(bright[i], bright[i + 1]);
      ctx.shadowBlur = 0;
    };

    const loop = (t) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (t - lastDraw > 60) { draw(t); lastDraw = t; }
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (!raf && !reduceMotion) raf = requestAnimationFrame(loop); };

    let resizeTimer = 0;
    window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(build, 120); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }, { rootMargin: "80px" }).observe(canvas);
    } else { visible = true; }
    document.addEventListener("visibilitychange", start);
    build();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
    start();

    return {
      setFill(f) { state.fill = clamp(f, 0, 1); if (reduceMotion) draw(0); },
      pulse() {
        if (reduceMotion) return;
        const t0 = performance.now();
        const step = (t) => { const p = (t - t0) / 1100; state.pulse = p < 1 ? p : -1; if (p < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      },
    };
  }

  // Hero: a wide gauge arc rising behind the product panel. Fill = share of the daily budget spent.
  const dialShape = {
    setup(w) {
      const R = w * 0.86, T = clamp(w * 0.044, 26, 58);
      return { cx: w / 2, cy: T / 2 + 30 + R, R, T, w };
    },
    at(x, y, g, rnd) {
      const dx = x - g.cx, dy = y - g.cy, d = Math.hypot(dx, dy);
      if (dy > 0) return null;
      const u = 0.5 + Math.atan2(dx, -dy) / (2 * Math.asin(Math.min(1, (g.w * 0.5) / g.R)));  // 0 at left edge, 1 at right edge
      const edge = 1 - smooth(0.43, 0.5, Math.abs(dx) / g.w);
      const e = Math.abs(d - g.R) / (g.T / 2);
      let a = 0, z = 0;
      if (e < 1) { a = 1 - smooth(0.62, 1, e) * 0.85; z = 1; }
      else {
        const out = d - g.R - g.T / 2;      // outside the band (above)
        const inn = g.R - g.T / 2 - d;      // inside the band (below)
        if (out > 6 && out < 24) {
          const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
          const step = 2.5, near = Math.abs(deg / step - Math.round(deg / step)) * step * (Math.PI / 180) * d;
          const major = Math.round(deg / step) % 4 === 0;
          if (near < 3.2 && (major || out < 15)) { a = major ? 0.5 : 0.3; z = 2; }
        } else if (inn > 0 && inn < 150) {
          const fall = 1 - inn / 150;
          if (rnd < 0.5 * fall * fall) { a = 0.12 + 0.3 * fall * fall; z = 3; }
        }
      }
      return { a: a * edge, u, z };
    },
    mod(c, s) {
      let m;
      if (c.z === 1) {
        const lead = smooth(s.fill + 0.012, s.fill - 0.012, c.u);        // 1 where filled
        m = 0.3 + 0.7 * lead;
        const front = Math.abs(c.u - s.fill);
        if (front < 0.02) m += 0.5 * (1 - front / 0.02);
      } else if (c.z === 2) m = c.u <= s.fill ? 1 : 0.55;
      else m = c.u <= s.fill ? 1 : 0.45;
      if (s.pulse >= 0) {
        const p = s.pulse * (s.fill + 0.1);
        const dist = Math.abs(c.u - p);
        if (dist < 0.05 && c.u <= s.fill + 0.02) m += (c.z === 1 ? 0.55 : 0.9) * (1 - dist / 0.05) * (1 - s.pulse * 0.4);
      }
      return m;
    },
  };

  // Closing section: the Ambrin mark, drawn in the same matrix.
  const markShape = {
    setup(w, h) {
      const S = Math.min(h * 0.74, w * 0.62);
      return { cx: w * (w > 700 ? 0.56 : 0.5), cy: h * 0.52, S, w, h };
    },
    at(x, y, g, rnd) {
      const px = (x - g.cx) / g.S, py = (y - g.cy) / g.S;
      const seg = (ax, ay, bx, by) => {
        const vx = bx - ax, vy = by - ay; const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy), 0, 1);
        return Math.hypot(px - ax - vx * t, py - ay - vy * t);
      };
      const dStroke = Math.min(seg(-0.42, 0.5, 0, -0.5), seg(0.42, 0.5, 0, -0.5));
      const dDia = Math.abs(px) + Math.abs(py - 0.27) - 0.15;
      let a = 0, z = 0;
      if (dStroke < 0.075) { a = 1 - smooth(0.045, 0.075, dStroke) * 0.8; z = 1; }
      else if (dDia < 0) { a = 1; z = 1; }
      else {
        const near = Math.min(dStroke - 0.075, dDia);
        const fall = 1 - clamp(near / 0.34, 0, 1);
        if (rnd < 0.42 * fall * fall) { a = 0.1 + 0.3 * fall * fall; z = 3; }
      }
      const fadeY = 1 - smooth(0.3, 0.62, py);
      const fadeX = 1 - smooth(0.34, 0.5, Math.abs(x - g.w / 2) / g.w) * (g.w > 700 ? 0 : 1);
      return { a: a * fadeY * fadeX, u: (px + py) * 0.5 + 0.5, z };
    },
    mod(c, s, time) {
      const wave = 0.5 + 0.5 * Math.sin(c.u * 7 - time * 0.9);
      return c.z === 1 ? 0.74 + 0.46 * wave * wave : 0.75 + 0.5 * wave;
    },
  };

  const heroDial = $("#heroDial") ? glyphField($("#heroDial"), dialShape) : null;
  if ($("#ctaArt")) glyphField($("#ctaArt"), markShape);

  /* ------------------------------------------------------------------
     Live meter: simulated calls, a balance that ticks down, receipts.
     ------------------------------------------------------------------ */
  const term = $("#term"), rcpts = $("#rcpts"), balanceEl = $("#balance"), budgetUsedEl = $("#budgetUsed"), budgetBar = $("#budgetBar");
  const meter = $("#meter");
  const BUDGET = 25;
  const wallet = { balance: 249.7614, used: 8.43 };
  if (heroDial) heroDial.setFill(wallet.used / BUDGET);

  const KINDS = [
    { weight: 6, provider: "inference.north", path: "inference.north/chat", glyph: "hex", cls: "g-inf", unit: "tok", price: 0.000002, units: () => 420 + Math.floor(Math.random() * 3900) },
    { weight: 3, provider: "feeds.lantern", path: "feeds.lantern/fx-spot", glyph: "diamond", cls: "g-data", unit: "query", price: 0.0004, units: () => 1 },
    { weight: 1, provider: "gpu-pool-eu", path: "gpu-pool-eu/a-class", glyph: "square", cls: "g-gpu", unit: "GPU-s", price: 0.0125, units: () => 6 + Math.floor(Math.random() * 22) },
  ];
  const pickKind = () => {
    let r = Math.random() * KINDS.reduce((s, k) => s + k.weight, 0);
    for (const k of KINDS) { if ((r -= k.weight) < 0) return k; }
    return KINDS[0];
  };
  const hexId = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  const fmtInt = (n) => n.toLocaleString("en-US");

  const trimTerm = () => { while (term.children.length > 22) term.firstElementChild.remove(); };
  const addLine = (html, cls) => {
    const el = document.createElement("div");
    el.className = "tl" + (cls ? " " + cls : "");
    el.innerHTML = html;
    term.appendChild(el);
    trimTerm();
    return el;
  };

  const animateNumber = (el, from, to, digits, ms) => {
    const t0 = performance.now();
    const step = (t) => {
      const p = clamp((t - t0) / ms, 0, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = (from + (to - from) * e).toFixed(digits);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  let meterVisible = true;
  if ("IntersectionObserver" in window && meter) {
    new IntersectionObserver(([e]) => { meterVisible = e.isIntersecting; }, { threshold: 0.15 }).observe(meter);
  }
  const whenActive = async () => { while (!meterVisible || document.hidden) await sleep(400); };

  async function runMeter() {
    await sleep(1400);
    for (;;) {
      await whenActive();
      const k = pickKind();
      const units = k.units();
      const cost = units * k.price;
      const id = "rcpt_" + hexId(6);

      // 1. the agent makes the call
      const line = addLine('<span class="t-p">$</span> <span class="typed"></span><span class="caret"></span>');
      const typed = $(".typed", line);
      const text = "call " + k.path;
      for (let i = 1; i <= text.length; i++) { typed.textContent = text.slice(0, i); await sleep(i <= 5 ? 34 : 20 + Math.random() * 26); }
      await sleep(420);
      line.innerHTML = `<span class="t-p">$</span> <span class="t-k">call</span> <span class="t-c">${k.path}</span>`;

      // 2. it settles: credits move, a receipt exists
      addLine(`  <span class="t-g">✓</span> ${fmtInt(units)} ${k.unit} · <b>${cost.toFixed(6)} cr</b>`, "t-ok");
      const before = wallet.balance;
      wallet.balance -= cost; wallet.used += cost;
      if (wallet.used > BUDGET * 0.92) { wallet.used = 6.2; wallet.balance = 250; }   // keep the demo inside its budget
      animateNumber(balanceEl, before, wallet.balance, 4, 520);
      balanceEl.parentElement.classList.remove("tick"); void balanceEl.offsetWidth; balanceEl.parentElement.classList.add("tick");
      budgetUsedEl.textContent = wallet.used.toFixed(2);
      budgetBar.style.width = ((wallet.used / BUDGET) * 100).toFixed(1) + "%";

      const li = document.createElement("li");
      li.className = "new";
      li.innerHTML = `<svg class="g ${k.cls}"><use href="#g-${k.glyph}"/></svg><div><b>${k.provider}</b><small>${fmtInt(units)} ${k.unit} · ${id}</small></div><span class="amt">−${cost.toFixed(6)}</span>`;
      rcpts.prepend(li);
      while (rcpts.children.length > 5) rcpts.lastElementChild.remove();

      if (heroDial) { heroDial.setFill(wallet.used / BUDGET); heroDial.pulse(); }
      await sleep(1500 + Math.random() * 1100);
    }
  }
  if (term && !reduceMotion) runMeter();

  /* ------------------------------------------------------------------
     Request-access form
     ------------------------------------------------------------------ */
  const form = $("#ctaForm");
  if (form) {
    const msg = $("#formMsg");
    const email = $("#email");
    email.addEventListener("input", () => { msg.textContent = ""; email.removeAttribute("aria-invalid"); });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        msg.textContent = "Enter a valid email address.";
        email.setAttribute("aria-invalid", "true");
        email.focus();
        return;
      }
      const role = (form.querySelector('input[name="role"]:checked') || {}).value;
      // TODO: wire to form backend (send { email: value, role })
      void role;
      const thanks = document.createElement("div");
      thanks.className = "thanks";
      thanks.setAttribute("role", "status");
      thanks.tabIndex = -1;
      thanks.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-check"/></svg><div><b>Thanks. You’re on the list.</b><span>We’ll email you when your access is ready.</span></div>';
      form.replaceWith(thanks);
      thanks.focus({ preventScroll: true });
    });
  }
})();
