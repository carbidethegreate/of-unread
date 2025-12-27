const elAccountId = document.getElementById("accountId");
const btnLoad = document.getElementById("btnLoad");
const btnSendAll = document.getElementById("btnSendAll");
const daysInput = document.getElementById("daysInput");
const topStatus = document.getElementById("topStatus");
const messagesEl = document.getElementById("messages");

const listOptions = [
  { id: "1250617614", label: "PPV Request" },
  { id: "1250618083", label: "Custom Request" },
  { id: "1250618262", label: "Live Chat" }
];

/** @type {Map<string, any>} */
const cardUiMap = new Map();

const MIN_REQUEST_GAP_MS = 1000;
const lastRequestAt = new Map();
const inFlightKeys = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setTopStatus(message) {
  topStatus.textContent = message || "";
}

async function apiJson(path, options = {}) {
  const method = options.method || "GET";
  const key = `${method.toUpperCase()} ${path}`;

  const last = lastRequestAt.get(key) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < MIN_REQUEST_GAP_MS) {
    await sleep(MIN_REQUEST_GAP_MS - elapsed);
  }

  if (inFlightKeys.has(key)) {
    const e = new Error("Please wait for the previous request to finish.");
    e.status = 429;
    e.retryAfter = 1;
    throw e;
  }

  inFlightKeys.add(key);

  try {
    const res = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    const retryAfterHeader = res.headers.get("retry-after");
    let retryAfterSec = undefined;
    if (retryAfterHeader) {
      const asNumber = Number.parseFloat(retryAfterHeader);
      if (Number.isFinite(asNumber)) {
        retryAfterSec = asNumber;
      } else {
        const retryDate = new Date(retryAfterHeader);
        if (!Number.isNaN(retryDate.getTime())) {
          retryAfterSec = Math.max(1, Math.round((retryDate.getTime() - Date.now()) / 1000));
        }
      }
    }

    if (!res.ok) {
      const baseMessage = payload && payload.error ? payload.error : `Request failed (${res.status})`;
      const wait = payload?.retryAfterSec ?? retryAfterSec;
      const message =
        res.status === 429 && wait
          ? `${baseMessage} Please try again in about ${wait}s.`
          : baseMessage;
      const e = new Error(message);
      e.payload = payload;
      e.status = res.status;
      e.retryAfter = wait;
      throw e;
    }

    return payload;
  } finally {
    lastRequestAt.set(key, Date.now());
    inFlightKeys.delete(key);
  }
}

function formatErrorMessage(e, fallback) {
  if (!e) return fallback;
  if (e.status === 429) {
    const wait = e.retryAfter ?? 1;
    return `${e.message || "Rate limit reached."} Please wait ${wait}s before retrying.`;
  }
  return e.message || fallback;
}

function formatTimestamp(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function badge(el, text, kind) {
  el.textContent = text;
  el.classList.remove("good", "bad", "warn");
  if (kind) el.classList.add(kind);
}

function clearCards() {
  messagesEl.innerHTML = "";
  cardUiMap.clear();
}

function renderHistory(history) {
  const ul = document.createElement("ul");
  ul.className = "history";

  for (const msg of history) {
    const li = document.createElement("li");
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = msg.sender === "fan" ? "FAN" : "PARKER";

    const ts = document.createElement("span");
    ts.className = "meta";
    ts.textContent = msg.timestamp ? ` ${formatTimestamp(msg.timestamp)}` : "";

    const text = document.createElement("div");
    text.textContent = msg.text || "";

    li.appendChild(who);
    li.appendChild(ts);
    li.appendChild(text);
    ul.appendChild(li);
  }

  return ul;
}

function createCard(card) {
  const wrapper = document.createElement("div");
  wrapper.className = "card";
  wrapper.dataset.chatId = card.chatId;

  const header = document.createElement("div");
  header.className = "card-header";

  const fan = document.createElement("div");
  fan.className = "fan";
  const name = card.from?.name || "(unknown)";
  const uname = card.from?.username ? ` (@${card.from.username})` : "";
  fan.textContent = `${name}${uname}`;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `Chat ID: ${card.chatId}  |  Received: ${formatTimestamp(card.timestamp)}`;

  header.appendChild(fan);
  header.appendChild(meta);

  const msg = document.createElement("div");
  msg.className = "message";
  msg.textContent = card.text || "";

  const details = document.createElement("details");
  details.className = "details";
  const summary = document.createElement("summary");
  summary.textContent = "Show last 24 messages";
  details.appendChild(summary);
  details.appendChild(renderHistory(card.latest24Messages || []));

  const actions = document.createElement("div");
  actions.className = "actions";

  const btnDraft = document.createElement("button");
  btnDraft.className = "btn primary";
  btnDraft.textContent = "Request Draft Reply";
  btnDraft.title = "Sends anonymized context to OpenAI 4o to propose a reply in Parker’s voice.";

  const btnSend = document.createElement("button");
  btnSend.className = "btn";
  btnSend.textContent = "Send";
  btnSend.title = "Sends this draft reply now. Lists are applied first, and PPV price if set.";

  actions.appendChild(btnDraft);
  actions.appendChild(btnSend);

  const textarea = document.createElement("textarea");
  textarea.placeholder = "Draft reply will appear here. You can edit before sending.";

  const options = document.createElement("div");
  options.className = "options";

  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "User-lists";
  fieldset.appendChild(legend);
  fieldset.title = "Adds this fan to selected follow-up lists.";

  const checkRow = document.createElement("div");
  checkRow.className = "checkbox-row";

  const checkboxes = [];
  for (const opt of listOptions) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = opt.id;
    cb.dataset.listId = opt.id;
    cb.title = "Adds this fan to selected follow-up lists.";

    const span = document.createElement("span");
    span.textContent = `${opt.id} ${opt.label}`;

    label.appendChild(cb);
    label.appendChild(span);
    checkRow.appendChild(label);
    checkboxes.push(cb);
  }

  fieldset.appendChild(checkRow);

  const ppv = document.createElement("div");
  ppv.className = "ppv";

  const ppvLabel = document.createElement("label");
  ppvLabel.textContent = "PPV Price (USD)";
  ppvLabel.title =
    "Charge to unlock this message on OnlyFans. Leave blank for free. Note: media may be required by OF for paid messages.";

  const ppvInput = document.createElement("input");
  ppvInput.type = "number";
  ppvInput.step = "0.01";
  ppvInput.min = "0";
  ppvInput.placeholder = "Leave blank for free";
  ppvInput.title = ppvLabel.title;

  ppv.appendChild(ppvLabel);
  ppv.appendChild(ppvInput);

  options.appendChild(fieldset);
  options.appendChild(ppv);

  const statuses = document.createElement("div");
  statuses.className = "statuses";

  const draftLine = document.createElement("div");
  const draftBadge = document.createElement("span");
  draftBadge.className = "badge";
  draftBadge.title = "Draft status";
  badge(draftBadge, "idle", "");
  draftLine.appendChild(document.createTextNode("Draft: "));
  draftLine.appendChild(draftBadge);

  const listLine = document.createElement("div");
  const listBadge = document.createElement("span");
  listBadge.className = "badge";
  listBadge.title = "User-list add results";
  badge(listBadge, "idle", "");
  listLine.appendChild(document.createTextNode("List Add: "));
  listLine.appendChild(listBadge);

  const sendLine = document.createElement("div");
  const sendBadge = document.createElement("span");
  sendBadge.className = "badge";
  sendBadge.title = "Send status";
  badge(sendBadge, "idle", "");
  sendLine.appendChild(document.createTextNode("Send: "));
  sendLine.appendChild(sendBadge);

  statuses.appendChild(draftLine);
  statuses.appendChild(listLine);
  statuses.appendChild(sendLine);

  const error = document.createElement("div");
  error.className = "error";
  error.style.display = "none";

  wrapper.appendChild(header);
  wrapper.appendChild(msg);
  wrapper.appendChild(details);
  wrapper.appendChild(actions);
  wrapper.appendChild(textarea);
  wrapper.appendChild(options);
  wrapper.appendChild(statuses);
  wrapper.appendChild(error);

  const ui = {
    card,
    wrapper,
    textarea,
    btnDraft,
    btnSend,
    checkboxes,
    ppvInput,
    draftBadge,
    listBadge,
    sendBadge,
    error
  };

  btnDraft.addEventListener("click", async () => {
    await handleDraft(ui);
  });

  btnSend.addEventListener("click", async () => {
    await handleSend(ui);
  });

  cardUiMap.set(card.chatId, ui);
  return wrapper;
}

function showError(ui, message) {
  ui.error.style.display = message ? "block" : "none";
  ui.error.textContent = message || "";
}

function selectedListIds(ui) {
  return ui.checkboxes.filter((cb) => cb.checked).map((cb) => cb.value);
}

function parsePrice(ui) {
  const raw = ui.ppvInput.value;
  if (!raw) return undefined;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

async function handleDraft(ui) {
  showError(ui, "");
  ui.btnDraft.disabled = true;
  badge(ui.draftBadge, "generating", "warn");

  try {
    const body = {
      chatId: ui.card.chatId,
      fanName: ui.card.from?.name || ui.card.from?.username || undefined,
      history: ui.card.latest24Messages || [],
      latestMessageText: ui.card.text
    };

    const out = await apiJson("/api/draft", { method: "POST", body });
    ui.textarea.value = out.draftText || "";
    badge(ui.draftBadge, "ready", "good");
  } catch (e) {
    badge(ui.draftBadge, "error", "bad");
    showError(ui, formatErrorMessage(e, "Failed to generate draft"));
  } finally {
    ui.btnDraft.disabled = false;
  }
}

async function handleSend(ui) {
  showError(ui, "");

  const text = (ui.textarea.value || "").trim();
  if (!text) {
    showError(ui, "Draft is empty. Request a draft or type a reply before sending.");
    return;
  }

  ui.btnSend.disabled = true;
  badge(ui.sendBadge, "sending", "warn");
  badge(ui.listBadge, "working", "warn");

  try {
    const listIds = selectedListIds(ui);
    const price = parsePrice(ui);

    const out = await apiJson("/api/send", {
      method: "POST",
      body: {
        chatId: ui.card.chatId,
        text,
        price,
        listIds,
        fanUserId: ui.card.from?.id
      }
    });

    if (out.listAddResults && Object.keys(out.listAddResults).length > 0) {
      const parts = Object.entries(out.listAddResults)
        .map(([id, st]) => `${id}:${st}`)
        .join("  ");
      badge(ui.listBadge, parts, "");
    } else {
      badge(ui.listBadge, "none", "");
    }

    if (out.status === "sent") {
      badge(ui.sendBadge, "sent", "good");
    } else {
      badge(ui.sendBadge, "failed", "bad");
      showError(ui, out.error || "Send failed");
    }
  } catch (e) {
    badge(ui.sendBadge, "failed", "bad");
    badge(ui.listBadge, "error", "bad");
    showError(ui, formatErrorMessage(e, "Send failed"));
  } finally {
    ui.btnSend.disabled = false;
  }
}

async function loadUnread() {
  clearCards();
  setTopStatus("Loading unread messages...");
  btnLoad.disabled = true;
  btnSendAll.disabled = true;

  const days = daysInput.value || "10";

  try {
    const cards = await apiJson(`/api/unread?days=${encodeURIComponent(days)}`);
    if (!Array.isArray(cards) || cards.length === 0) {
      setTopStatus("No unread messages found in the selected window.");
      return;
    }

    for (const card of cards) {
      messagesEl.appendChild(createCard(card));
    }

    setTopStatus(`Loaded ${cards.length} unread message(s).`);
    btnSendAll.disabled = false;
  } catch (e) {
    setTopStatus(formatErrorMessage(e, "Failed to load unread messages"));
  } finally {
    btnLoad.disabled = false;
  }
}

async function sendAll() {
  const uis = Array.from(cardUiMap.values());
  const toSend = uis.filter((ui) => (ui.textarea.value || "").trim().length > 0);

  if (toSend.length === 0) {
    setTopStatus("No drafts to send. Request drafts or type replies first.");
    return;
  }

  btnSendAll.disabled = true;
  btnLoad.disabled = true;

  setTopStatus(`Sending ${toSend.length} message(s)...`);

  let sent = 0;
  for (const ui of toSend) {
    await handleSend(ui);
    sent += 1;
    setTopStatus(`Sent ${sent} of ${toSend.length}`);

    // Gentle rate limit: at least one second between sends.
    await sleep(1000);
  }

  setTopStatus(`Finished sending ${toSend.length} message(s).`);
  btnSendAll.disabled = false;
  btnLoad.disabled = false;
}

async function init() {
  try {
    const cfg = await apiJson("/api/config");
    if (cfg && cfg.accountId) {
      elAccountId.textContent = cfg.accountId;
    }

    if (cfg && cfg.missing) {
      const warnings = [];
      if (cfg.missing.onlyfans) warnings.push("OnlyFans credentials missing");
      if (cfg.missing.openai) warnings.push("OpenAI key missing");
      if (warnings.length > 0) {
        setTopStatus(`Config warning: ${warnings.join(". ")}.`);
      }
    }
  } catch {
    // Ignore.
  }

  btnLoad.addEventListener("click", loadUnread);
  btnSendAll.addEventListener("click", sendAll);
}

init();
