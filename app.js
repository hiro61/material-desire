const STORAGE_KEY = "material-desire-state-v2";
const APP_VERSION = "2.0.0";
const GOAL_AMOUNT = 240000;
const GOAL_RING_RADIUS = 96;
const GOAL_RING_CIRCUMFERENCE = 2 * Math.PI * GOAL_RING_RADIUS;
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
    lastGoalUnlockUnits: 0,
    goalUnlockBaselineReady: false,
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
let goalRingAnimationTimer = null;
let previousGoalRingValue = null;

const refs = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheRefs();
  populateSelectOptions();
  bindEvents();
  syncSettingsForm();
  syncRecordDefaults();
  updateCompassionNote();
  renderGoalDay();
  await registerServiceWorker();
  await syncGoalUnlockTracker(false);
  renderAll();
  scheduleNotifications();
});

function cacheRefs() {
  refs.headerStats = document.querySelector("#headerStats");
  refs.goalPanelDay = document.querySelector("#goalPanelDay");
  refs.goalCelebrate = document.querySelector("#goalCelebrate");
  refs.goalHeading = document.querySelector("#goalHeading");
  refs.goalRing = document.querySelector("#goalRing");
  refs.goalCompletedRing = document.querySelector("#goalCompletedRing");
  refs.goalProgressRing = document.querySelector("#goalProgressRing");
  refs.goalAmount = document.querySelector("#goalAmount");
  refs.goalPercent = document.querySelector("#goalPercent");
  refs.goalLapBadge = document.querySelector("#goalLapBadge");
  refs.goalSupport = document.querySelector("#goalSupport");
  refs.goalStatRow = document.querySelector("#goalStatRow");
  refs.goalBanner = document.querySelector("#goalBanner");
  refs.wishCardGrid = document.querySelector("#wishCardGrid");
  refs.metricGrid = document.querySelector("#metricGrid");
  refs.waitingList = document.querySelector("#waitingList");
  refs.readyList = document.querySelector("#readyList");
  refs.insightStack = document.querySelector("#insightStack");
  refs.barStack = document.querySelector("#barStack");
  refs.trendChart = document.querySelector("#trendChart");
  refs.trendCaption = document.querySelector("#trendCaption");
  refs.recordForm = document.querySelector("#recordForm");
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

function renderGoalDay() {
  refs.goalPanelDay.textContent = formatJapaneseDate(new Date());
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
}

function syncRecordDefaults() {
  refs.waitHours.value = state.settings.defaultWaitHours;
}

async function handleRecordSubmit(event) {
  event.preventDefault();

  const name = document.querySelector("#itemName").value.trim();
  const price = Number(document.querySelector("#itemPrice").value);
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
    desireLevel: 0,
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
  await syncGoalUnlockTracker(true);

  refs.recordForm.reset();
  refs.itemSource.value = "SNS";
  refs.itemEmotion.value = "落ち着いている";
  refs.waitHours.value = state.settings.defaultWaitHours;
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
    window.alert("このブラウザでは通知が使えんようじゃ。画面上の案内で見るのが安全じゃのう。");
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
    state.settings.goalUnlockBaselineReady = false;
    persistState();
    syncSettingsForm();
    syncRecordDefaults();
    updateCompassionNote();
    await syncGoalUnlockTracker(false);
    renderAll();
    scheduleNotifications();
  } catch (error) {
    console.error(error);
    window.alert("JSON の読み込みに失敗したぞい。形式を確認してくれい。");
  } finally {
    refs.importFile.value = "";
  }
}

async function resetData() {
  const confirmed = window.confirm("全データを削除する。書き出し前なら戻せんが、本当に実行するかのう？");
  if (!confirmed) {
    return;
  }

  state = structuredClone(DEFAULT_STATE);
  persistState();
  syncSettingsForm();
  syncRecordDefaults();
  updateCompassionNote();
  await syncGoalUnlockTracker(false);
  renderAll();
  scheduleNotifications();
}

function renderAll() {
  renderHeaderStats();
  renderGoalRing();
  renderWishCards();
  renderMetrics();
  renderTrendChart();
  renderWaitingList();
  renderReadyList();
  renderInsights();
}

function renderHeaderStats() {
  const goalState = getGoalState();
  const skippedCount = state.entries.filter((entry) => entry.status === "skipped").length;
  const boughtCount = state.entries.filter((entry) => entry.status === "bought").length;

  refs.headerStats.innerHTML = [
    statCard("保留中", `${goalState.waitingEntries.length}件`),
    statCard("保留合計", formatCurrency(goalState.totalWaiting)),
    statCard("購入目安", `${goalState.unlockableUnits}点分`),
    statCard("購入済み", `${boughtCount}件`),
    statCard("見送り", `${skippedCount}件`),
  ].join("");
}

function statCard(label, value) {
  return `<div class="header-stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderGoalRing() {
  const goalState = getGoalState();
  const remainingText = goalState.remainingToNext === 0
    ? "今は1つぶんの購入目安に到達しておる。どれを本当に買うか、保留カードを見返して選ぶのじゃ。"
    : `あと ${formatCurrency(goalState.remainingToNext)} で 1つぶんの購入目安に届く。`;

  updateRingStroke(refs.goalCompletedRing, goalState.completedRingRatio);
  updateRingStroke(refs.goalProgressRing, goalState.activeRingRatio);
  refs.goalRing.dataset.lapMode = goalState.totalWaiting > GOAL_AMOUNT ? "multi" : "single";
  refs.goalRing.setAttribute(
    "aria-label",
    `保留中合計 ${formatCurrency(goalState.totalWaiting)}。${goalState.lapLabel}、24万円で1周の進捗リング`
  );
  refs.goalAmount.textContent = formatCurrency(goalState.totalWaiting);
  refs.goalPercent.textContent = `${goalState.currentLapPercent}%`;
  refs.goalLapBadge.textContent = goalState.lapLabel;
  refs.goalSupport.textContent = remainingText;

  if (previousGoalRingValue !== null && previousGoalRingValue !== goalState.totalWaiting) {
    triggerGoalRingAnimation();
  }
  previousGoalRingValue = goalState.totalWaiting;

  if (goalState.unlockableUnits > 0) {
    refs.goalCelebrate.textContent = "Congrats!";
    refs.goalHeading.textContent = `${goalState.unlockableUnits}点分の購入目安に到達です`;
    refs.goalBanner.textContent = `保留合計が ${formatCurrency(goalState.totalWaiting)} に到達。今なら目安として ${goalState.unlockableUnits} 点ぶん買える水準じゃ。`;
    refs.goalBanner.classList.add("is-unlocked");
  } else {
    refs.goalCelebrate.textContent = "Steady build";
    refs.goalHeading.textContent = "保留金額を積み上げる";
    refs.goalBanner.textContent = "リングは保留中の合計金額だけで進む。24万円で1周し、1つ買う前に積み上がりを見返す設計じゃ。";
    refs.goalBanner.classList.remove("is-unlocked");
  }

  refs.goalStatRow.innerHTML = [
    goalStat("保留中件数", `${goalState.waitingEntries.length}件`),
    goalStat("残り金額", goalState.remainingToNext === 0 ? "達成済み" : formatCurrency(goalState.remainingToNext)),
    goalStat("購入目安", `${goalState.unlockableUnits}点分`),
  ].join("");
}

function updateRingStroke(element, ratio) {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  const dashoffset = GOAL_RING_CIRCUMFERENCE * (1 - safeRatio);
  element.style.strokeDasharray = `${GOAL_RING_CIRCUMFERENCE}`;
  element.style.strokeDashoffset = `${dashoffset}`;
  element.style.opacity = safeRatio > 0 ? "1" : "0";
}

function triggerGoalRingAnimation() {
  refs.goalRing.classList.remove("is-animating");
  void refs.goalRing.offsetWidth;
  refs.goalRing.classList.add("is-animating");
  window.clearTimeout(goalRingAnimationTimer);
  goalRingAnimationTimer = window.setTimeout(() => {
    refs.goalRing.classList.remove("is-animating");
  }, 640);
}

function goalStat(label, value) {
  return `
    <article class="goal-stat">
      <span class="goal-stat__label">${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function renderWishCards() {
  if (!state.entries.length) {
    refs.wishCardGrid.innerHTML = `<p class="empty-state">まだ記録が無い。欲しい物と価格を入れると、ここへ横長カードで並ぶぞい。</p>`;
    return;
  }

  const entries = [...state.entries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  refs.wishCardGrid.innerHTML = entries.map((entry) => `
    <article class="wish-card ${entry.status === "waiting" ? "" : "is-dimmed"}">
      <div class="wish-card__top">
        <span class="wish-card__title">${escapeHtml(entry.name)}</span>
        <span class="wish-card__price">${formatCurrency(entry.price)}</span>
      </div>
      <div class="wish-card__meta">
        <span>欲しくなった日 ${formatDisplayDate(entry.createdAt)}</span>
        <span class="wish-card__status ${entry.status === "bought" ? "is-bought" : entry.status === "skipped" ? "is-skipped" : ""}">${formatStatus(entry.status)}</span>
      </div>
    </article>
  `).join("");
}

function renderMetrics() {
  const entriesThisMonth = state.entries.filter((entry) => isCurrentMonth(entry.createdAt));
  const totalRecordedThisMonth = entriesThisMonth.reduce((sum, entry) => sum + entry.price, 0);
  const goalState = getGoalState();
  const boughtThisMonth = entriesThisMonth.filter((entry) => entry.status === "bought");

  const metrics = [
    { label: "今月の記録", value: `${entriesThisMonth.length}件` },
    { label: "今月の記録額", value: formatCurrency(totalRecordedThisMonth) },
    { label: "保留中合計", value: formatCurrency(goalState.totalWaiting) },
    { label: "購入済み金額", value: formatCurrency(boughtThisMonth.reduce((sum, entry) => sum + entry.price, 0)) },
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
    return {
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      value: dayEntries.reduce((sum, entry) => sum + entry.price, 0),
    };
  });

  const width = 320;
  const height = 180;
  const padding = 24;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const hasData = points.some((point) => point.value > 0);
  const totalWeek = points.reduce((sum, point) => sum + point.value, 0);

  refs.trendCaption.textContent = hasData ? `7日合計 ${formatCurrency(totalWeek)}` : "記録なし";

  if (!hasData) {
    refs.trendChart.innerHTML = `
      <line class="chart-axis" x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}"></line>
      <text class="chart-label" x="${width / 2}" y="${height / 2}" text-anchor="middle">まだ金額推移が出るほど記録がないのう</text>
    `;
    return;
  }

  const maxValue = Math.max(...points.map((point) => point.value), 1000);
  const coordinates = points.map((point, index) => {
    const x = padding + (usableWidth / (points.length - 1)) * index;
    const y = height - padding - (point.value / maxValue) * usableHeight;
    return { x, y, label: point.label };
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
    refs.waitingList.innerHTML = `<p class="empty-state">保留中の案件はまだ無い。1件記録すると、ここへ詳細が並ぶぞい。</p>`;
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
          <span class="tag">${formatDisplayDate(entry.createdAt)}</span>
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
    refs.insightStack.innerHTML = `<p class="empty-state">記録が溜まると、どの感情や流入元で高額になりやすいかをここで見られるぞい。</p>`;
    refs.barStack.innerHTML = "";
    return;
  }

  const emotionStats = topCategory(entries, "emotion");
  const sourceStats = topCategory(entries, "source");
  const averagePrice = entries.reduce((sum, entry) => sum + entry.price, 0) / entries.length;
  const highPriceEntries = entries.filter((entry) => entry.price >= averagePrice);
  const highPriceSource = highPriceEntries.length ? topCategory(highPriceEntries, "source") : null;
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
      "平均以上の価格帯",
      highPriceSource ? `平均価格 ${formatCurrency(averagePrice)} 以上の記録は ${highPriceSource.label} が最多じゃ。高額化の入口をここから見直せるぞい。` : "まだ高額帯の偏りは十分に出ておらん。"
    ),
    buildInsight(
      "判断の質",
      `見送り ${skipped.length} 件、購入 ${bought.length} 件。今の保留合計は ${formatCurrency(getGoalState().totalWaiting)} じゃ。`
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

async function handleWaitingAction(action, id) {
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
  await syncGoalUnlockTracker(false);
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

async function handleReevaluationSubmit(event) {
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
  await syncGoalUnlockTracker(false);
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
  return state.entries
    .filter((entry) => entry.status === "waiting")
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
}

function getReadyEntries() {
  return getWaitingEntries().filter(isReady);
}

function getWaitingTotal() {
  return getWaitingEntries().reduce((sum, entry) => sum + entry.price, 0);
}

function getGoalState() {
  const waitingEntries = getWaitingEntries();
  const totalWaiting = waitingEntries.reduce((sum, entry) => sum + entry.price, 0);
  const unlockableUnits = Math.floor(totalWaiting / GOAL_AMOUNT);
  const remainder = totalWaiting % GOAL_AMOUNT;
  const hasProgress = totalWaiting > 0;
  const isExactLapCompletion = hasProgress && remainder === 0;
  const completedRingRatio = unlockableUnits > 0 ? 1 : 0;
  const activeRingRatio = !hasProgress
    ? 0
    : unlockableUnits > 0 && isExactLapCompletion
      ? 0
      : remainder === 0
        ? 1
        : remainder / GOAL_AMOUNT;
  const currentLapIndex = !hasProgress
    ? 1
    : isExactLapCompletion
      ? Math.max(1, unlockableUnits)
      : unlockableUnits + 1;
  const currentLapPercent = !hasProgress
    ? 0
    : isExactLapCompletion
      ? 100
      : Math.round((remainder / GOAL_AMOUNT) * 100);
  const remainingToNext = totalWaiting === 0
    ? GOAL_AMOUNT
    : remainder === 0
      ? 0
      : GOAL_AMOUNT - remainder;

  return {
    waitingEntries,
    totalWaiting,
    unlockableUnits,
    remainder,
    isExactLapCompletion,
    completedRingRatio,
    activeRingRatio,
    currentLapIndex,
    currentLapPercent,
    lapLabel: isExactLapCompletion && hasProgress ? `${currentLapIndex}周達成` : `${currentLapIndex}周目`,
    remainingToNext,
    totalProgressPercent: Math.round((totalWaiting / GOAL_AMOUNT) * 100),
  };
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

async function syncGoalUnlockTracker(allowNotify) {
  const goalState = getGoalState();
  const currentUnits = goalState.unlockableUnits;

  if (!state.settings.goalUnlockBaselineReady) {
    state.settings.goalUnlockBaselineReady = true;
    state.settings.lastGoalUnlockUnits = currentUnits;
    persistState();
    return;
  }

  if (currentUnits < state.settings.lastGoalUnlockUnits) {
    state.settings.lastGoalUnlockUnits = currentUnits;
    persistState();
    return;
  }

  if (allowNotify && currentUnits > state.settings.lastGoalUnlockUnits) {
    state.settings.lastGoalUnlockUnits = currentUnits;
    persistState();
    await notifyGoalUnlock(currentUnits, goalState.totalWaiting);
    return;
  }

  if (!allowNotify && currentUnits !== state.settings.lastGoalUnlockUnits) {
    state.settings.lastGoalUnlockUnits = currentUnits;
    persistState();
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
      void notifyEntry(entry);
      return;
    }

    const delay = Math.min(dueMs, 2147483647);
    const timerId = window.setTimeout(() => {
      void notifyEntry(entry);
    }, delay);
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

  const body = `「${freshEntry.name}」を静かに見直す時間じゃ。今すぐ買う前に、保留中の合計金額も見てから決めるのじゃ。`;
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

async function notifyGoalUnlock(units, totalWaiting) {
  if (!state.settings.notificationsEnabled || Notification.permission !== "granted") {
    return;
  }

  const body = units === 1
    ? `保留中合計が ${formatCurrency(totalWaiting)} に到達した。今なら目安として 1 点ぶん買えるぞい。`
    : `保留中合計が ${formatCurrency(totalWaiting)}。今なら目安として ${units} 点ぶん買える水準じゃ。`;

  if (swRegistration?.showNotification) {
    await swRegistration.showNotification("Material Desire", {
      body,
      tag: `goal-unlock-${units}`,
      data: { unlockableUnits: units },
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
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateForFile(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(isoString) {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatJapaneseDate(date) {
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getMonth() + 1}月${date.getDate()}日 (${weekdays[date.getDay()]})`;
}

function formatStatus(status) {
  if (status === "bought") return "購入済み";
  if (status === "skipped") return "見送り";
  return "保留中";
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
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current) {
      return sanitizeImportedState(JSON.parse(current));
    }

    const legacy = window.localStorage.getItem("material-desire-state-v1");
    if (legacy) {
      return sanitizeImportedState(JSON.parse(legacy));
    }

    return structuredClone(DEFAULT_STATE);
  } catch (error) {
    console.error("Failed to load state", error);
    return structuredClone(DEFAULT_STATE);
  }
}

function sanitizeImportedState(data) {
  return {
    version: APP_VERSION,
    settings: {
      defaultWaitHours: Number(data.settings?.defaultWaitHours || DEFAULT_STATE.settings.defaultWaitHours),
      monthlyIncome: data.settings?.monthlyIncome ?? "",
      hourlyRate: data.settings?.hourlyRate ?? "",
      notificationsEnabled: Boolean(data.settings?.notificationsEnabled),
      lastGoalUnlockUnits: Number(data.settings?.lastGoalUnlockUnits || 0),
      goalUnlockBaselineReady: Boolean(data.settings?.goalUnlockBaselineReady),
    },
    entries: Array.isArray(data.entries)
      ? data.entries.map((entry) => ({
          id: entry.id || crypto.randomUUID(),
          name: entry.name || "名称未設定",
          price: Number(entry.price || 0),
          source: entry.source || "SNS",
          emotion: entry.emotion || "落ち着いている",
          desireLevel: Number(entry.desireLevel || 0),
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
