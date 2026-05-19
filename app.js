const STORAGE_KEY = "material-desire-state-v1";
const APP_VERSION = "1.0.0";
const SOURCES = ["SNS", "ECサイト", "店舗", "知人の紹介", "動画", "広告"];
const EMOTIONS = ["落ち着いている", "高揚", "退屈", "イライラ", "悲しい", "疲れている"];
const VALUE_TAGS = ["自由", "安心", "成長", "関係性", "健康", "創造性"];
const YES_NO_OPTIONS = [
  { value: "", label: "選択する" },
  { value: "yes", label: "はい" },
  { value: "no", label: "いいえ" },
];
const HIGH_STRESS_EMOTIONS = new Set(["イライラ", "悲しい", "疲れている"]);

const DEFAULT_STATE = {
  version: APP_VERSION,
  settings: {
    defaultWaitHours: 72,
    monthlyIncome: "",
    hourlyRate: "",
    notificationsEnabled: false,
  },
  entries: [],
};

let state = loadState();
let selectedNecessity = "need";
let currentEntryId = null;
let selectedValueTags = new Set();
let reevalDecision = "rewait";
let scheduledTimers = [];
let swRegistration = null;

const refs = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheRefs();
  populateSelectOptions();
  bindEvents();
  syncSettingsForm();
  syncRecordDefaults();
  updateDial(Number(refs.desireRange.value));
  await registerServiceWorker();
  renderAll();
  scheduleNotifications();
});

function cacheRefs() {
  refs.headerStats = document.querySelector("#headerStats");
  refs.metricGrid = document.querySelector("#metricGrid");
  refs.waitingList = document.querySelector("#waitingList");
  refs.readyList = document.querySelector("#readyList");
  refs.insightStack = document.querySelector("#insightStack");
  refs.barStack = document.querySelector("#barStack");
  refs.trendChart = document.querySelector("#trendChart");
  refs.trendCaption = document.querySelector("#trendCaption");
  refs.recordForm = document.querySelector("#recordForm");
  refs.desireRange = document.querySelector("#desireRange");
  refs.desireDial = document.querySelector("#desireDial");
  refs.dialValue = document.querySelector("#dialValue");
  refs.dialGuidance = document.querySelector("#dialGuidance");
  refs.compassionNote = document.querySelector("#compassionNote");
  refs.itemSource = document.querySelector("#itemSource");
  refs.itemEmotion = document.querySelector("#itemEmotion");
  refs.waitHours = document.querySelector("#waitHours");
  refs.defaultWaitHours = document.querySelector("#defaultWaitHours");
  refs.monthlyIncome = document.querySelector("#monthlyIncome");
  refs.hourlyRate = document.querySelector("#hourlyRate");
  refs.notifyButton = document.querySelector("#notifyButton");
  refs.saveSettingsButton = document.querySelector("#saveSettingsButton");
  refs.exportButton = document.querySelector("#exportButton");
  refs.importButton = document.querySelector("#importButton");
  refs.importFile = document.querySelector("#importFile");
  refs.resetButton = document.querySelector("#resetButton");
  refs.mobileButtons = Array.from(document.querySelectorAll(".mobile-nav__button"));
  refs.screens = Array.from(document.querySelectorAll(".screen-card"));
  refs.necessityButtons = Array.from(document.querySelectorAll("#necessityGroup .chip"));
  refs.reevalDialog = document.querySelector("#reevalDialog");
  refs.reevalForm = document.querySelector("#reevalForm");
  refs.reevalTitle = document.querySelector("#reevalTitle");
  refs.saleIndependent = document.querySelector("#saleIndependent");
  refs.similarOwned = document.querySelector("#similarOwned");
  refs.stillStrong = document.querySelector("#stillStrong");
  refs.reviewChecked = document.querySelector("#reviewChecked");
  refs.boredomDays = document.querySelector("#boredomDays");
  refs.alternativeUse = document.querySelector("#alternativeUse");
  refs.valueTagGroup = document.querySelector("#valueTagGroup");
  refs.reevalResult = document.querySelector("#reevalResult");
  refs.closeDialogButton = document.querySelector("#closeDialogButton");
}

function populateSelectOptions() {
  populateSelect(refs.itemSource, SOURCES, "SNS");
  populateSelect(refs.itemEmotion, EMOTIONS, "落ち着いている");
  [refs.saleIndependent, refs.similarOwned, refs.stillStrong, refs.reviewChecked].forEach((select) => {
    select.innerHTML = YES_NO_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join("");
  });

  refs.valueTagGroup.innerHTML = VALUE_TAGS.map((tag) => (
    `<button class="chip" data-tag="${tag}" type="button">${tag}</button>`
  )).join("");
}

function populateSelect(select, values, selected) {
  select.innerHTML = values.map((value) => (
    `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`
  )).join("");
}

function bindEvents() {
  refs.desireRange.addEventListener("input", (event) => {
    updateDial(Number(event.target.value));
  });

  refs.itemEmotion.addEventListener("change", updateCompassionNote);
  refs.recordForm.addEventListener("submit", handleRecordSubmit);

  refs.necessityButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedNecessity = button.dataset.value;
      refs.necessityButtons.forEach((chip) => chip.classList.toggle("is-selected", chip === button));
    });
  });

  refs.mobileButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveScreen(button.dataset.target);
    });
  });

  bindDialInteractions();

  refs.notifyButton.addEventListener("click", handleNotificationSetup);
  refs.saveSettingsButton.addEventListener("click", handleSettingsSave);
  refs.exportButton.addEventListener("click", exportData);
  refs.importButton.addEventListener("click", () => refs.importFile.click());
  refs.importFile.addEventListener("change", importData);
  refs.resetButton.addEventListener("click", resetData);

  refs.valueTagGroup.addEventListener("click", (event) => {
    const target = event.target.closest("[data-tag]");
    if (!target) {
      return;
    }

    const tag = target.dataset.tag;
    if (selectedValueTags.has(tag)) {
      selectedValueTags.delete(tag);
    } else {
      selectedValueTags.add(tag);
    }

    target.classList.toggle("is-selected", selectedValueTags.has(tag));
    updateReevalRecommendation();
  });

  refs.closeDialogButton.addEventListener("click", () => refs.reevalDialog.close());

  refs.reevalForm.addEventListener("change", updateReevalRecommendation);
  refs.reevalForm.addEventListener("click", (event) => {
    const target = event.target.closest("[data-decision]");
    if (target) {
      reevalDecision = target.dataset.decision;
    }
  });
  refs.reevalForm.addEventListener("submit", handleReevaluationSubmit);
}

function bindDialInteractions() {
  let pointerActive = false;

  const syncFromPointer = (event) => {
    const rect = refs.desireDial.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    let degrees = (angle * 180) / Math.PI + 90;

    if (degrees < 0) {
      degrees += 360;
    }

    const value = Math.min(10, Math.max(1, Math.round((degrees / 360) * 9) + 1));
    refs.desireRange.value = String(value);
    updateDial(value);
  };

  refs.desireDial.addEventListener("pointerdown", (event) => {
    pointerActive = true;
    refs.desireDial.setPointerCapture(event.pointerId);
    syncFromPointer(event);
  });

  refs.desireDial.addEventListener("pointermove", (event) => {
    if (pointerActive) {
      syncFromPointer(event);
    }
  });

  refs.desireDial.addEventListener("pointerup", () => {
    pointerActive = false;
  });

  refs.desireDial.addEventListener("keydown", (event) => {
    const current = Number(refs.desireRange.value);
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      refs.desireRange.value = String(Math.min(10, current + 1));
      updateDial(Number(refs.desireRange.value));
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      refs.desireRange.value = String(Math.max(1, current - 1));
      updateDial(Number(refs.desireRange.value));
    }
  });
}

function updateDial(value) {
  const angle = ((value - 1) / 9) * 360;
  refs.desireDial.style.setProperty("--dial-angle", `${angle}deg`);
  refs.desireDial.setAttribute("aria-valuenow", String(value));
  refs.dialValue.textContent = String(value);

  const guidance = [
    "かなり静かじゃ。衝動より必要性の確認が中心になりそうじゃ。",
    "まだ落ち着いておる。機能と使い道を先に見れば足りる段階じゃ。",
    "少し気になる程度じゃ。比較より必要性の確認が先じゃのう。",
    "やや惹かれておる。今日の気分が影響していないかを見る段階じゃ。",
    "勢いが出始めておる。今は結論を急がぬほうがよい。",
    "少し勢いがある。すぐ決めず、ひと呼吸置く段階じゃ。",
    "欲求が強まっておる。待機の効果が出やすい水準じゃ。",
    "かなり欲しくなっておる。価格の現実感を戻すべき場面じゃ。",
    "ほぼ衝動に近い。別用途比較と悪いレビュー確認が効くぞい。",
    "最高潮じゃ。今すぐ買う判断は避けるのが妥当じゃ。",
  ];

  refs.dialGuidance.textContent = guidance[value - 1];
}

function updateCompassionNote() {
  const emotion = refs.itemEmotion.value;
  let message = "記録できた時点で一歩進んでおる。判断を急がず、まず状態を観察するのじゃ。";

  if (HIGH_STRESS_EMOTIONS.has(emotion)) {
    message = "今は少し消耗しておるかもしれん。買うかどうかの前に、休息と気分の揺れを切り分けるのが先じゃ。";
  } else if (emotion === "高揚") {
    message = "気分が上がっておる時は、必要以上に良く見えやすい。勢いを1日寝かせるだけでも判断は整うぞい。";
  }

  refs.compassionNote.textContent = message;
}

function syncSettingsForm() {
  refs.defaultWaitHours.value = state.settings.defaultWaitHours;
  refs.monthlyIncome.value = state.settings.monthlyIncome;
  refs.hourlyRate.value = state.settings.hourlyRate;
  updateCompassionNote();
}

function syncRecordDefaults() {
  refs.waitHours.value = state.settings.defaultWaitHours;
}

function handleRecordSubmit(event) {
  event.preventDefault();

  const name = document.querySelector("#itemName").value.trim();
  const price = Number(document.querySelector("#itemPrice").value);
  const desireLevel = Number(refs.desireRange.value);
  const emotion = refs.itemEmotion.value;
  const source = refs.itemSource.value;
  const waitHours = Number(refs.waitHours.value || state.settings.defaultWaitHours);
  const createdAt = new Date().toISOString();

  const nextWaitHours = HIGH_STRESS_EMOTIONS.has(emotion) ? Math.max(waitHours, waitHours + 12) : waitHours;
  const dueAt = new Date(Date.now() + nextWaitHours * 60 * 60 * 1000).toISOString();

  const entry = {
    id: crypto.randomUUID(),
    name,
    price,
    source,
    emotion,
    desireLevel,
    necessity: selectedNecessity,
    isSale: document.querySelector("#isSale").checked,
    isWindfall: document.querySelector("#isWindfall").checked,
    url: document.querySelector("#itemUrl").value.trim(),
    note: document.querySelector("#itemNote").value.trim(),
    createdAt,
    waitHours: nextWaitHours,
    dueAt,
    status: "waiting",
    reevaluation: null,
    satisfaction: null,
    notifiedAt: null,
  };

  state.entries.unshift(entry);
  persistState();
  refs.recordForm.reset();
  refs.itemSource.value = "SNS";
  refs.itemEmotion.value = "落ち着いている";
  refs.waitHours.value = state.settings.defaultWaitHours;
  refs.desireRange.value = "6";
  updateDial(6);
  selectedNecessity = "need";
  refs.necessityButtons.forEach((button) => button.classList.toggle("is-selected", button.dataset.value === "need"));
  updateCompassionNote();
  renderAll();
  scheduleNotifications();
}

function handleSettingsSave() {
  state.settings.defaultWaitHours = Math.max(1, Number(refs.defaultWaitHours.value || 72));
  state.settings.monthlyIncome = refs.monthlyIncome.value.trim();
  state.settings.hourlyRate = refs.hourlyRate.value.trim();
  persistState();
  syncRecordDefaults();
  renderAll();
}

async function handleNotificationSetup() {
  if (!("Notification" in window)) {
    window.alert("このブラウザでは通知が使えんようじゃ。期限表示で運用するのが安全じゃのう。");
    return;
  }

  const permission = await Notification.requestPermission();
  state.settings.notificationsEnabled = permission === "granted";
  persistState();
  renderAll();
  scheduleNotifications();
}

function exportData() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `material_desire_export_${formatDateForFile(new Date())}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.entries) || !parsed.settings) {
      throw new Error("invalid-shape");
    }

    if (!window.confirm("現在のローカルデータを、読み込んだ JSON で置き換える。続けるかのう？")) {
      refs.importFile.value = "";
      return;
    }

    state = sanitizeImportedState(parsed);
    persistState();
    syncSettingsForm();
    syncRecordDefaults();
    renderAll();
    scheduleNotifications();
  } catch (error) {
    console.error(error);
    window.alert("JSON の読み込みに失敗したぞい。形式を確認してくれい。");
  } finally {
    refs.importFile.value = "";
  }
}

function resetData() {
  const confirmed = window.confirm("全データを削除する。書き出し前なら戻せんが、本当に実行するかのう？");
  if (!confirmed) {
    return;
  }

  state = structuredClone(DEFAULT_STATE);
  persistState();
  syncSettingsForm();
  syncRecordDefaults();
  renderAll();
  scheduleNotifications();
}

function renderAll() {
  renderHeaderStats();
  renderMetrics();
  renderTrendChart();
  renderWaitingList();
  renderReadyList();
  renderInsights();
}

function renderHeaderStats() {
  const readyCount = getReadyEntries().length;
  const waitingCount = getWaitingEntries().length;
  const skippedCount = state.entries.filter((entry) => entry.status === "skipped").length;
  const boughtCount = state.entries.filter((entry) => entry.status === "bought").length;

  refs.headerStats.innerHTML = [
    statCard("待機中", `${waitingCount}件`),
    statCard("再評価待ち", `${readyCount}件`),
    statCard("見送り", `${skippedCount}件`),
    statCard("購入", `${boughtCount}件`),
  ].join("");
}

function statCard(label, value) {
  return `<div class="header-stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderMetrics() {
  const entriesThisMonth = state.entries.filter((entry) => isCurrentMonth(entry.createdAt));
  const skippedThisMonth = entriesThisMonth.filter((entry) => entry.status === "skipped");
  const boughtThisMonth = entriesThisMonth.filter((entry) => entry.status === "bought");
  const completedThisMonth = entriesThisMonth.filter((entry) => ["skipped", "bought"].includes(entry.status));
  const savedAmount = skippedThisMonth.reduce((sum, entry) => sum + entry.price, 0);
  const avgDesire = entriesThisMonth.length
    ? (entriesThisMonth.reduce((sum, entry) => sum + entry.desireLevel, 0) / entriesThisMonth.length).toFixed(1)
    : "0.0";
  const holdRate = completedThisMonth.length
    ? `${Math.round((skippedThisMonth.length / completedThisMonth.length) * 100)}%`
    : "0%";

  const metrics = [
    { label: "今月の記録", value: `${entriesThisMonth.length}件` },
    { label: "保留成功率", value: holdRate },
    { label: "平均欲求強度", value: avgDesire },
    { label: "見送り金額", value: formatCurrency(savedAmount) },
  ];

  refs.metricGrid.innerHTML = metrics.map((metric) => (
    `<div class="metric"><span>${metric.label}</span><strong>${metric.value}</strong></div>`
  )).join("");
}

function renderTrendChart() {
  const days = [...Array(7)].map((_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return date;
  });

  const points = days.map((date) => {
    const dayEntries = state.entries.filter((entry) => isSameDay(entry.createdAt, date));
    const avg = dayEntries.length
      ? dayEntries.reduce((sum, entry) => sum + entry.desireLevel, 0) / dayEntries.length
      : 0;
    return {
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      value: avg,
    };
  });

  const maxValue = 10;
  const width = 320;
  const height = 180;
  const padding = 24;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const hasData = points.some((point) => point.value > 0);

  refs.trendCaption.textContent = hasData ? "最近7日間" : "記録なし";

  if (!hasData) {
    refs.trendChart.innerHTML = `
      <line class="chart-axis" x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}"></line>
      <text class="chart-label" x="${width / 2}" y="${height / 2}" text-anchor="middle">まだ折れ線になるほど記録がないのう</text>
    `;
    return;
  }

  const coordinates = points.map((point, index) => {
    const x = padding + (usableWidth / (points.length - 1)) * index;
    const y = height - padding - (point.value / maxValue) * usableHeight;
    return { x, y, value: point.value, label: point.label };
  });

  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const fillPath = [
    `M ${coordinates[0].x} ${height - padding}`,
    ...coordinates.map((point) => `L ${point.x} ${point.y}`),
    `L ${coordinates[coordinates.length - 1].x} ${height - padding}`,
    "Z",
  ].join(" ");

  refs.trendChart.innerHTML = `
    <line class="chart-axis" x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}"></line>
    <path class="chart-fill" d="${fillPath}"></path>
    <polyline class="chart-line" points="${polyline}"></polyline>
    ${coordinates.map((point) => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4"></circle>`).join("")}
    ${coordinates.map((point) => `<text class="chart-label" x="${point.x}" y="${height - 8}" text-anchor="middle">${point.label}</text>`).join("")}
  `;
}

function renderWaitingList() {
  const waitingEntries = getWaitingEntries();

  if (!waitingEntries.length) {
    refs.waitingList.innerHTML = `<p class="empty-state">待機中の案件はまだ無い。1件記録すると、ここへ並ぶぞい。</p>`;
    return;
  }

  refs.waitingList.innerHTML = waitingEntries.map((entry) => {
    const dueText = formatDue(entry.dueAt);
    const hoursView = buildPricePerspective(entry.price);

    return `
      <article class="waiting-item">
        <div class="item-head">
          <div class="item-name">${escapeHtml(entry.name)}</div>
          <div class="item-price">${formatCurrency(entry.price)}</div>
        </div>
        <div class="item-meta">
          <span class="status-pill ${isReady(entry) ? "is-ready" : ""}">${isReady(entry) ? "再評価できる" : dueText}</span>
          <span class="tag">${entry.source}</span>
          <span class="tag">${entry.emotion}</span>
          <span class="tag">${entry.necessity === "need" ? "必要品" : "嗜好品"}</span>
          ${entry.isSale ? `<span class="tag">セール</span>` : ""}
          ${entry.isWindfall ? `<span class="tag">臨時収入</span>` : ""}
        </div>
        <div class="item-meta">
          <span>${hoursView}</span>
        </div>
        <div class="item-actions">
          <button class="secondary-button" data-action="reevaluate" data-id="${entry.id}" type="button">再評価</button>
          <button class="secondary-button" data-action="extend" data-id="${entry.id}" type="button">+24時間</button>
          <button class="secondary-button" data-action="skip" data-id="${entry.id}" type="button">見送る</button>
          <button class="secondary-button" data-action="buy" data-id="${entry.id}" type="button">買った</button>
        </div>
      </article>
    `;
  }).join("");

  refs.waitingList.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleWaitingAction(button.dataset.action, button.dataset.id));
  });
}

function renderReadyList() {
  const readyEntries = getReadyEntries();

  if (!readyEntries.length) {
    refs.readyList.innerHTML = `<p class="empty-state">まだ再評価待ちは無い。期限が来た案件や、見直したい案件がここに出るぞい。</p>`;
    return;
  }

  refs.readyList.innerHTML = readyEntries.map((entry) => `
    <article class="ready-item">
      <div class="item-head">
        <div class="item-name">${escapeHtml(entry.name)}</div>
        <div class="item-price">${formatCurrency(entry.price)}</div>
      </div>
      <div class="item-meta">
        <span class="status-pill is-ready">再評価の時刻を過ぎた</span>
        <span>${relativeFromNow(entry.dueAt)}</span>
      </div>
      <div class="item-actions">
        <button class="primary-button" data-ready-id="${entry.id}" type="button">再評価を開く</button>
      </div>
    </article>
  `).join("");

  refs.readyList.querySelectorAll("[data-ready-id]").forEach((button) => {
    button.addEventListener("click", () => openReevaluation(button.dataset.readyId));
  });
}

function renderInsights() {
  const entries = state.entries;
  if (!entries.length) {
    refs.insightStack.innerHTML = `<p class="empty-state">記録が溜まると、強まりやすい感情や流入元をここで見られるぞい。</p>`;
    refs.barStack.innerHTML = "";
    return;
  }

  const emotionStats = topCategory(entries, "emotion");
  const sourceStats = topCategory(entries, "source");
  const highDesireEntries = entries.filter((entry) => entry.desireLevel >= 8);
  const highDesireEmotion = highDesireEntries.length ? topCategory(highDesireEntries, "emotion") : null;
  const skipped = entries.filter((entry) => entry.status === "skipped");
  const bought = entries.filter((entry) => entry.status === "bought");

  const insights = [
    buildInsight(
      "最頻出の感情",
      emotionStats ? `${emotionStats.label} のときに記録が最も多い。全体の ${emotionStats.share}% を占めるぞい。` : "まだ偏りは見えぬ。"
    ),
    buildInsight(
      "最頻出の流入元",
      sourceStats ? `${sourceStats.label} からの流入が最も多い。露出を減らす工夫が効く可能性は ${estimateConfidence(sourceStats.count, entries.length)}% ほどじゃ。` : "まだ偏りは見えぬ。"
    ),
    buildInsight(
      "強い物欲の条件",
      highDesireEmotion ? `欲求強度 8 以上は ${highDesireEmotion.label} が最多じゃ。高リスク時間帯と組み合わせて見始める価値がある。` : "まだ高強度の偏りは十分に出ておらん。"
    ),
    buildInsight(
      "判断の質",
      `見送り ${skipped.length} 件、購入 ${bought.length} 件。見送り金額は ${formatCurrency(skipped.reduce((sum, entry) => sum + entry.price, 0))} じゃ。`
    ),
  ];

  refs.insightStack.innerHTML = insights.join("");

  const bars = [
    renderBar("感情: " + (emotionStats?.label || "データ不足"), emotionStats?.share || 0),
    renderBar("流入元: " + (sourceStats?.label || "データ不足"), sourceStats?.share || 0),
    renderBar("見送り率", entries.length ? Math.round((skipped.length / entries.length) * 100) : 0),
    renderBar("購入率", entries.length ? Math.round((bought.length / entries.length) * 100) : 0),
  ];
  refs.barStack.innerHTML = bars.join("");
}

function buildInsight(title, body) {
  return `<article class="insight-item"><p class="muted-label">${title}</p><p>${body}</p></article>`;
}

function renderBar(label, value) {
  return `
    <div class="bar-item">
      <div class="bar-item__head">
        <span>${label}</span>
        <span>${value}%</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${Math.max(0, Math.min(100, value))}%"></div>
      </div>
    </div>
  `;
}

function handleWaitingAction(action, id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  if (action === "extend") {
    entry.waitHours += 24;
    entry.dueAt = new Date(new Date(entry.dueAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
    entry.notifiedAt = null;
  }

  if (action === "skip") {
    entry.status = "skipped";
    entry.decidedAt = new Date().toISOString();
  }

  if (action === "buy") {
    entry.status = "bought";
    entry.decidedAt = new Date().toISOString();
  }

  if (action === "reevaluate") {
    openReevaluation(id);
    return;
  }

  persistState();
  renderAll();
  scheduleNotifications();
}

function openReevaluation(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  currentEntryId = id;
  selectedValueTags = new Set(entry.reevaluation?.valueTags || []);
  refs.reevalTitle.textContent = entry.name;
  refs.saleIndependent.value = entry.reevaluation?.saleIndependent || "";
  refs.similarOwned.value = entry.reevaluation?.similarOwned || "";
  refs.stillStrong.value = entry.reevaluation?.stillStrong || "";
  refs.reviewChecked.value = entry.reevaluation?.reviewChecked || "";
  refs.boredomDays.value = entry.reevaluation?.boredomDays ?? "";
  refs.alternativeUse.value = entry.reevaluation?.alternativeUse || "";

  refs.valueTagGroup.querySelectorAll("[data-tag]").forEach((button) => {
    button.classList.toggle("is-selected", selectedValueTags.has(button.dataset.tag));
  });

  updateReevalRecommendation();
  refs.reevalDialog.showModal();
}

function updateReevalRecommendation() {
  const recommendation = computeRecommendation();
  refs.reevalResult.textContent = recommendation.message;
  refs.reevalResult.dataset.score = String(recommendation.score);
}

function computeRecommendation() {
  let score = 0;

  if (refs.saleIndependent.value === "yes") score += 1;
  if (refs.saleIndependent.value === "no") score -= 1;
  if (refs.similarOwned.value === "yes") score -= 1;
  if (refs.similarOwned.value === "no") score += 1;
  if (refs.stillStrong.value === "yes") score += 2;
  if (refs.stillStrong.value === "no") score -= 2;
  if (refs.reviewChecked.value === "yes") score += 1;
  if (refs.reviewChecked.value === "no") score -= 1;

  const boredomDays = Number(refs.boredomDays.value || 0);
  if (boredomDays > 0 && boredomDays <= 14) score -= 1;
  if (boredomDays >= 60) score += 1;
  if (selectedValueTags.size >= 2) score += 1;

  let message = "判断材料がまだ足りん。再保留しつつ、悪いレビューと代替案を確認するのが妥当じゃ。";
  if (score <= 0) {
    message = "今は見送る提案じゃ。価格や気分より、必要性と継続利用の弱さが目立つ。";
  } else if (score >= 4) {
    message = "買ってよい寄りの提案じゃ。待機後も欲求が残り、価値観とも接続できておる。";
  } else {
    message = "24時間ほど再保留が妥当じゃ。勢いは落ち着いたが、まだ確信までは足りぬ。";
  }

  return { score, message };
}

function handleReevaluationSubmit(event) {
  event.preventDefault();
  const entry = state.entries.find((item) => item.id === currentEntryId);
  if (!entry) {
    refs.reevalDialog.close();
    return;
  }

  entry.reevaluation = {
    performedAt: new Date().toISOString(),
    saleIndependent: refs.saleIndependent.value,
    similarOwned: refs.similarOwned.value,
    stillStrong: refs.stillStrong.value,
    reviewChecked: refs.reviewChecked.value,
    boredomDays: Number(refs.boredomDays.value || 0),
    alternativeUse: refs.alternativeUse.value.trim(),
    valueTags: Array.from(selectedValueTags),
    recommendation: computeRecommendation(),
  };

  if (reevalDecision === "skip") {
    entry.status = "skipped";
    entry.decidedAt = new Date().toISOString();
  }

  if (reevalDecision === "buy") {
    entry.status = "bought";
    entry.decidedAt = new Date().toISOString();
  }

  if (reevalDecision === "rewait") {
    entry.status = "waiting";
    entry.waitHours += 24;
    entry.dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    entry.notifiedAt = null;
  }

  persistState();
  renderAll();
  scheduleNotifications();
  refs.reevalDialog.close();
}

function setActiveScreen(target) {
  refs.screens.forEach((screen) => {
    screen.classList.toggle("is-active", screen.dataset.screen === target);
  });
  refs.mobileButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.target === target);
  });
}

function getWaitingEntries() {
  return state.entries.filter((entry) => entry.status === "waiting").sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
}

function getReadyEntries() {
  return getWaitingEntries().filter(isReady);
}

function isReady(entry) {
  return new Date(entry.dueAt).getTime() <= Date.now();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    swRegistration = await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.error("Service worker registration failed", error);
  }
}

function scheduleNotifications() {
  scheduledTimers.forEach((timerId) => window.clearTimeout(timerId));
  scheduledTimers = [];

  if (!state.settings.notificationsEnabled || Notification.permission !== "granted") {
    return;
  }

  getWaitingEntries().forEach((entry) => {
    const dueMs = new Date(entry.dueAt).getTime() - Date.now();
    if (dueMs <= 0) {
      notifyEntry(entry);
      return;
    }

    const delay = Math.min(dueMs, 2147483647);
    const timerId = window.setTimeout(() => notifyEntry(entry), delay);
    scheduledTimers.push(timerId);
  });
}

async function notifyEntry(entry) {
  const freshEntry = state.entries.find((item) => item.id === entry.id);
  if (!freshEntry || freshEntry.notifiedAt || freshEntry.status !== "waiting") {
    return;
  }

  freshEntry.notifiedAt = new Date().toISOString();
  persistState();

  const body = `「${freshEntry.name}」を静かに見直す時間じゃ。結論より、必要性と代替案を先に見てみるのじゃ。`;
  if (swRegistration?.showNotification) {
    await swRegistration.showNotification("Material Desire", {
      body,
      tag: freshEntry.id,
      data: { entryId: freshEntry.id },
    });
  } else {
    new Notification("Material Desire", { body });
  }
}

function buildPricePerspective(price) {
  const perspectives = [];
  const hourlyRate = Number(state.settings.hourlyRate || 0);
  const monthlyIncome = Number(state.settings.monthlyIncome || 0);

  if (hourlyRate > 0) {
    perspectives.push(`労働時間換算 ${Math.max(0.1, price / hourlyRate).toFixed(1)} 時間`);
  }

  if (monthlyIncome > 0) {
    perspectives.push(`月収比 ${(price / monthlyIncome * 100).toFixed(1)}%`);
  }

  if (!perspectives.length) {
    perspectives.push("価格の現実感を高めるなら、時給か月収を設定するとよい。");
  }

  return perspectives.join(" / ");
}

function formatDue(isoString) {
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) {
    return "期限到来";
  }

  const hours = Math.round(diff / (1000 * 60 * 60));
  if (hours < 24) {
    return `あと ${hours} 時間`;
  }

  return `あと ${Math.ceil(hours / 24)} 日`;
}

function relativeFromNow(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const hours = Math.round(diff / (1000 * 60 * 60));
  if (hours < 24) {
    return `${hours}時間前に期限`;
  }
  return `${Math.floor(hours / 24)}日前に期限`;
}

function topCategory(entries, key) {
  if (!entries.length) {
    return null;
  }

  const counts = new Map();
  entries.forEach((entry) => {
    counts.set(entry[key], (counts.get(entry[key]) || 0) + 1);
  });

  const [label, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    label,
    count,
    share: Math.round((count / entries.length) * 100),
  };
}

function estimateConfidence(count, total) {
  if (!count || !total) {
    return 0;
  }

  const base = count / total;
  return Math.min(95, Math.max(45, Math.round(45 + base * 50)));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value || 0);
}

function formatDateForFile(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isCurrentMonth(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function isSameDay(isoString, targetDate) {
  const date = new Date(isoString);
  return (
    date.getFullYear() === targetDate.getFullYear() &&
    date.getMonth() === targetDate.getMonth() &&
    date.getDate() === targetDate.getDate()
  );
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(DEFAULT_STATE);
    }
    return sanitizeImportedState(JSON.parse(raw));
  } catch (error) {
    console.error("Failed to load state", error);
    return structuredClone(DEFAULT_STATE);
  }
}

function sanitizeImportedState(data) {
  return {
    version: APP_VERSION,
    settings: {
      defaultWaitHours: Number(data.settings.defaultWaitHours || DEFAULT_STATE.settings.defaultWaitHours),
      monthlyIncome: data.settings.monthlyIncome ?? "",
      hourlyRate: data.settings.hourlyRate ?? "",
      notificationsEnabled: Boolean(data.settings.notificationsEnabled),
    },
    entries: Array.isArray(data.entries)
      ? data.entries.map((entry) => ({
          id: entry.id || crypto.randomUUID(),
          name: entry.name || "名称未設定",
          price: Number(entry.price || 0),
          source: entry.source || "SNS",
          emotion: entry.emotion || "落ち着いている",
          desireLevel: Number(entry.desireLevel || 5),
          necessity: entry.necessity === "want" ? "want" : "need",
          isSale: Boolean(entry.isSale),
          isWindfall: Boolean(entry.isWindfall),
          url: entry.url || "",
          note: entry.note || "",
          createdAt: entry.createdAt || new Date().toISOString(),
          waitHours: Number(entry.waitHours || 72),
          dueAt: entry.dueAt || new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          status: ["waiting", "skipped", "bought"].includes(entry.status) ? entry.status : "waiting",
          reevaluation: entry.reevaluation || null,
          satisfaction: entry.satisfaction || null,
          decidedAt: entry.decidedAt || null,
          notifiedAt: entry.notifiedAt || null,
        }))
      : [],
  };
}

function persistState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
