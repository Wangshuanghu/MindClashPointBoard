// ===== Constants =====
const SEQUENCE = [1, 3, 4, 6, 7, 9, 10, 12, 13, 15, 16];
const MAX_SEQ_INDEX = SEQUENCE.length - 1;
const MAX_BASE = SEQUENCE[MAX_SEQ_INDEX]; // 16
const STORAGE_KEY = 'kards_tracker_v3';

// ===== State =====
let state = null;

function createInitialState(hp1, hp2, firstPlayer) {
    return {
        phase: 'playing',
        round: 1,
        firstPlayer: firstPlayer,
        activePlayer: firstPlayer,
        players: {
            1: { hp: hp1, maxHp: hp1, base: SEQUENCE[0], bonus: 0, pendingBonus: 0, turnEnded: false, seqIndex: 0 },
            2: { hp: hp2, maxHp: hp2, base: SEQUENCE[0], bonus: 0, pendingBonus: 0, turnEnded: false, seqIndex: 0 },
        },
        log: [
            {
                round: 1,
                player: 0,
                text: `游戏开始 · P1 血量 ${hp1} / P2 血量 ${hp2} · 先手方 P${firstPlayer}`,
                time: getTimeStr(),
            },
        ],
    };
}

// ===== Utility =====
function getTotal(player) {
    return state.players[player].base + state.players[player].bonus;
}

function getNextBase(player) {
    const p = state.players[player];
    if (p.seqIndex >= MAX_SEQ_INDEX) return SEQUENCE[MAX_SEQ_INDEX];
    return SEQUENCE[p.seqIndex + 1];
}

function getNextTotal(player) {
    // Projected total next round = nextBase + bonus + pendingBonus
    return getNextBase(player) + state.players[player].bonus + state.players[player].pendingBonus;
}

function getTimeStr() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function addLog(player, text) {
    state.log.push({
        round: state.round,
        player: player,
        text: text,
        time: getTimeStr(),
    });
}

// ===== Persistence =====
function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.phase === 'playing' && parsed.players) {
                return parsed;
            }
        }
    } catch (e) { /* ignore */ }
    return null;
}

// ===== Toast =====
let toastTimer = null;
function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ===== Setup Screen =====
function startGame() {
    const hp1 = parseInt(document.getElementById('setup-hp-1').value, 10);
    const hp2 = parseInt(document.getElementById('setup-hp-2').value, 10);

    if (isNaN(hp1) || hp1 < 1 || hp1 > 99) {
        showToast('P1 血量请输入 1-99');
        return;
    }
    if (isNaN(hp2) || hp2 < 1 || hp2 > 99) {
        showToast('P2 血量请输入 1-99');
        return;
    }

    const firstPlayer = Math.random() < 0.5 ? 1 : 2;
    state = createInitialState(hp1, hp2, firstPlayer);
    saveState();

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');

    buildSequenceBars();
    updateUI();
    showToast(`先手方: P${firstPlayer} (${firstPlayer === 1 ? '正方' : '反方'})`, 2500);
}

// ===== Game Logic =====
function endTurn(player) {
    // Only the active player can end their turn
    if (player !== state.activePlayer) return;

    const p = state.players[player];
    if (p.turnEnded) return;

    p.turnEnded = true;
    addLog(player, `<span class="player-tag p${player}-tag">P${player}</span> 结束回合`);

    // Check if both players have ended their turn
    if (state.players[1].turnEnded && state.players[2].turnEnded) {
        setTimeout(() => nextRound(), 900);
    } else {
        // Switch to the other player
        state.activePlayer = state.activePlayer === 1 ? 2 : 1;
        addLog(0, `轮到 <span class="player-tag p${state.activePlayer}-tag">P${state.activePlayer}</span> 行动`);
    }

    saveState();
    updateUI();
}

function nextRound() {
    state.round++;

    // Apply pending bonus and advance sequence for both players
    for (const num of [1, 2]) {
        const p = state.players[num];
        p.turnEnded = false;

        // Apply pending bonus
        if (p.pendingBonus > 0) {
            p.bonus += p.pendingBonus;
            addLog(num, `<span class="player-tag p${num}-tag">P${num}</span> 额外费用 +${p.pendingBonus} 生效 → 总额外 ${p.bonus}`);
            p.pendingBonus = 0;
        }

        // Advance sequence
        if (p.seqIndex < MAX_SEQ_INDEX) {
            p.seqIndex++;
            p.base = SEQUENCE[p.seqIndex];
        }
    }

    // First player goes first again
    state.activePlayer = state.firstPlayer;

    const newBase = state.players[1].base;
    addLog(0, `第 ${state.round} 回合开始 · 基础费用 ${newBase}` + (newBase >= MAX_BASE ? ' (已封顶)' : ''));

    showRoundOverlay(state.round, newBase, state.firstPlayer);
    saveState();
    setTimeout(() => updateUI(), 100);
}

function addCost(player) {
    // Only the active player can add cost
    if (player !== state.activePlayer) return;

    const input = document.querySelector(`[data-input="${player}"]`);
    const raw = input.value.trim();
    const val = parseInt(raw, 10);

    if (raw === '' || isNaN(val) || val < 1 || val > 100) {
        showToast('请输入 1-100 之间的数字');
        input.focus();
        return;
    }

    // Add to pendingBonus — takes effect next round
    state.players[player].pendingBonus += val;
    input.value = '';

    addLog(player, `<span class="player-tag p${player}-tag">P${player}</span> 增加费用 +${val} (下回合生效) → 待加 ${state.players[player].pendingBonus}`);

    saveState();
    updateUI();
}

function adjustHP(player, delta) {
    const p = state.players[player];
    const oldHp = p.hp;
    p.hp = Math.max(0, p.hp + delta);

    if (p.hp === oldHp) return;

    const sign = delta > 0 ? '+' : '';
    const action = delta > 0 ? '恢复' : '受到伤害';
    addLog(player, `<span class="player-tag p${player}-tag">P${player}</span> ${action} ${sign}${delta} HP → ${oldHp} → ${p.hp}`);

    animateHPChange(player, delta > 0);
    saveState();
    updateUI();

    if (p.hp === 0) {
        const winner = player === 1 ? 2 : 1;
        setTimeout(() => {
            showToast(`P${winner} 获胜！`, 4000);
            addLog(0, `🏆 P${winner} 获胜！P${player} 总部被摧毁`);
            saveState();
            renderLog();
        }, 300);
    }
}

function restartGame() {
    if (!confirm('确定要重新开始吗？将回到设置界面，所有进度将丢失。')) return;

    state = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}

    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('log-panel').classList.add('hidden');

    document.getElementById('setup-hp-1').value = '20';
    document.getElementById('setup-hp-2').value = '20';
}

function resetGame() {
    if (!confirm('确定要重开当前游戏吗？所有费用和记录将清零，血量保留初始值。')) return;

    const hp1 = state.players[1].maxHp;
    const hp2 = state.players[2].maxHp;
    const firstPlayer = Math.random() < 0.5 ? 1 : 2;
    state = createInitialState(hp1, hp2, firstPlayer);
    saveState();

    buildSequenceBars();
    updateUI();
    showToast(`游戏已重开 · 先手方: P${firstPlayer}`, 2500);
}

// ===== Round Overlay =====
function showRoundOverlay(round, baseCost, firstPlayer) {
    const overlay = document.getElementById('round-overlay');
    document.getElementById('overlay-round').textContent = round;
    document.getElementById('overlay-cost').textContent = baseCost;
    document.getElementById('overlay-first').textContent = firstPlayer;
    overlay.classList.remove('hidden', 'fade-out');

    setTimeout(() => {
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.classList.remove('fade-out');
        }, 400);
    }, 1200);
}

// ===== Animations =====
function animateCostChange(player) {
    const el = document.querySelector(`[data-cost="${player}"]`);
    el.classList.remove('changing');
    void el.offsetWidth;
    el.classList.add('changing');
    setTimeout(() => el.classList.remove('changing'), 500);
}

function animateHPChange(player, isHeal) {
    const el = document.querySelector(`[data-hp-num="${player}"]`);
    const cls = isHeal ? 'healed' : 'damaged';
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 400);
}

// ===== Sequence Bar =====
function buildSequenceBars() {
    for (const p of [1, 2]) {
        const bar = document.querySelector(`[data-sequence="${p}"]`);
        bar.innerHTML = '';
        SEQUENCE.forEach((val, idx) => {
            const step = document.createElement('div');
            step.className = 'seq-step';
            step.dataset.index = idx;
            step.textContent = val;
            bar.appendChild(step);
        });
    }
}

function updateSequenceBar(player) {
    const bar = document.querySelector(`[data-sequence="${player}"]`);
    const currentIdx = state.players[player].seqIndex;
    const isMax = currentIdx >= MAX_SEQ_INDEX;

    bar.querySelectorAll('.seq-step').forEach((step, idx) => {
        step.classList.remove('done', 'active', 'max-active');
        if (idx < currentIdx) {
            step.classList.add('done');
        } else if (idx === currentIdx) {
            step.classList.add(isMax ? 'max-active' : 'active');
        }
    });
}

// ===== Log Panel =====
function renderLog() {
    const body = document.getElementById('log-body');

    if (state.log.length === 0) {
        body.innerHTML = '<div class="log-empty">暂无记录</div>';
    } else {
        body.innerHTML = state.log.slice().reverse().map(entry => {
            const cls = entry.player === 0 ? 'system' : `p${entry.player}`;
            return `<div class="log-entry ${cls}">
                <span class="log-entry-round">R${entry.round}</span>
                <span class="log-entry-text">${entry.text}</span>
            </div>`;
        }).join('');
    }

    // Update stats
    document.getElementById('log-total-rounds').textContent = state.round;
    document.getElementById('log-p1-cost').textContent = getTotal(1);
    document.getElementById('log-p2-cost').textContent = getTotal(2);
    document.getElementById('log-p1-hp').textContent = state.players[1].hp;
    document.getElementById('log-p2-hp').textContent = state.players[2].hp;
}

function toggleLogPanel() {
    const panel = document.getElementById('log-panel');
    if (panel.classList.contains('hidden')) {
        renderLog();
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

// ===== UI Update =====
function updateUI() {
    for (const p of [1, 2]) {
        const player = state.players[p];
        const total = getTotal(p);
        const nextTotal = getNextTotal(p);
        const isAtMax = player.seqIndex >= MAX_SEQ_INDEX;
        const isActive = state.activePlayer === p;

        // Cost number
        const costEl = document.querySelector(`[data-cost="${p}"]`);
        costEl.textContent = total;
        costEl.classList.toggle('over-max', total > MAX_BASE);

        // Base / Bonus / Pending
        document.querySelector(`[data-base="${p}"]`).textContent = player.base;
        document.querySelector(`[data-bonus="${p}"]`).textContent = player.bonus;
        document.querySelector(`[data-pending="${p}"]`).textContent = player.pendingBonus;

        // Pending highlight
        const pendingWrap = document.querySelector(`[data-pending-wrap="${p}"]`);
        pendingWrap.classList.toggle('has-pending', player.pendingBonus > 0);

        // Round
        document.querySelector(`[data-round="${p}"]`).textContent = state.round;

        // HP
        const hpEl = document.querySelector(`[data-hp-num="${p}"]`);
        hpEl.textContent = player.hp;
        hpEl.classList.toggle('zero', player.hp === 0);

        document.querySelector(`[data-hp-max="${p}"]`).textContent = player.maxHp;

        // Next ball — shows projected total next round
        const nextEl = document.querySelector(`[data-next="${p}"]`);
        nextEl.textContent = nextTotal;
        const nextBall = document.querySelector(`[data-next-ball="${p}"]`);
        nextBall.classList.toggle('at-max', isAtMax && nextTotal >= MAX_BASE);

        // Cost cap indicator
        const capEl = document.querySelector(`[data-cap="${p}"]`);
        if (total > MAX_BASE) {
            capEl.textContent = `⚠超${MAX_BASE}`;
        } else if (isAtMax) {
            capEl.textContent = `上限${MAX_BASE}`;
        } else {
            capEl.textContent = '';
        }

        // First player badge
        const badge = document.querySelector(`[data-first="${p}"]`);
        badge.classList.toggle('first', state.firstPlayer === p);

        // Active/inactive states
        const side = document.getElementById(`player${p}`);
        const tapZone = document.querySelector(`[data-player="${p}"]`);
        const indicator = document.querySelector(`[data-turn-indicator="${p}"]`);
        const inputSection = document.querySelector(`[data-input-section="${p}"]`);
        const input = document.querySelector(`[data-input="${p}"]`);
        const addBtn = document.querySelector(`[data-add="${p}"]`);
        const turnText = indicator.querySelector('.turn-text');

        side.classList.toggle('inactive', !isActive);
        tapZone.classList.remove('active');
        indicator.classList.remove('active', 'waiting');

        if (isActive) {
            tapZone.classList.add('active');
            indicator.classList.add('active');
            turnText.textContent = '点击结束回合';
            inputSection.classList.remove('disabled');
            input.disabled = false;
            addBtn.disabled = false;
        } else {
            indicator.classList.add('waiting');
            turnText.textContent = '等待对方行动...';
            inputSection.classList.add('disabled');
            input.disabled = true;
            addBtn.disabled = true;
        }

        // Sequence bar
        updateSequenceBar(p);
    }

    // Center info
    document.getElementById('center-round').textContent = state.round;
    document.getElementById('center-turn').textContent = `P${state.activePlayer} 回合`;
}

// ===== Event Setup =====
function setupEvents() {
    // Start button
    document.getElementById('start-btn').addEventListener('click', startGame);

    ['setup-hp-1', 'setup-hp-2'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', (e) => {
            if (e.key === 'Enter') startGame();
        });
    });

    // Tap zones — end turn (only works for active player)
    document.querySelectorAll('.tap-zone').forEach(zone => {
        zone.addEventListener('click', () => {
            const player = parseInt(zone.dataset.player, 10);
            endTurn(player);
        });
    });

    // Add cost buttons (only works for active player)
    document.querySelectorAll('[data-add]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const player = parseInt(btn.dataset.add, 10);
            addCost(player);
        });
    });

    // HP buttons — always available
    document.querySelectorAll('[data-hp]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const player = parseInt(btn.dataset.hp, 10);
            const delta = parseInt(btn.dataset.delta, 10);
            adjustHP(player, delta);
        });
    });

    // Input — Enter key
    document.querySelectorAll('.cost-input').forEach(input => {
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const player = parseInt(input.dataset.input, 10);
                addCost(player);
            }
        });
        input.addEventListener('blur', () => {
            const val = parseInt(input.value, 10);
            if (isNaN(val) || val < 1) input.value = '';
            else if (val > 100) input.value = '100';
        });
    });

    // Center buttons
    document.getElementById('restart-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        restartGame();
    });

    document.getElementById('reset-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        resetGame();
    });

    document.getElementById('log-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLogPanel();
    });

    document.getElementById('log-close').addEventListener('click', () => {
        document.getElementById('log-panel').classList.add('hidden');
    });

    // Prevent context menu
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    // Prevent pinch zoom
    document.addEventListener('gesturestart', (e) => e.preventDefault());
}

// ===== PWA Service Worker =====
function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

// ===== Init =====
function init() {
    setupEvents();
    registerSW();

    const loaded = loadState();
    if (loaded) {
        state = loaded;
        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('game-container').classList.remove('hidden');
        buildSequenceBars();
        updateUI();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
