const state = {
  walletCents: 0,
  token: localStorage.getItem('apexbet_token'),
  selections: [],
};

const money = (cents) => `$${(Number(cents) / 100).toFixed(2)}`;
const wallet = document.querySelector('#wallet-balance');
const fixtures = document.querySelector('#fixtures');
const betslip = document.querySelector('#betslip-content');
const history = document.querySelector('#history-content');

function setWallet() {
  wallet.textContent = money(state.walletCents);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function renderFixtures(items) {
  fixtures.innerHTML = items.map((fixture) => `
    <article class="fixture-card">
      <div class="fixture-header"><span>${fixture.league}</span><span>${new Date(fixture.start_time).toLocaleString()}</span></div>
      <div class="market-row">
        <div class="match-teams"><div>${fixture.home_team}</div><div>${fixture.away_team}</div></div>
        <div class="odds-group">${(fixture.markets || []).map((market) => `
          <button class="odd-button ${state.selections.some((s) => s.marketId === market.id) ? 'selected' : ''}"
            data-market-id="${market.id}" data-match="${fixture.home_team} vs ${fixture.away_team}"
            data-label="${market.label}" data-odds="${market.odds}" data-outcome="${market.outcome_name}">
            <span class="odd-label">${market.label}</span><span class="odd-value">${Number(market.odds).toFixed(2)}</span>
          </button>`).join('')}</div>
      </div>
    </article>`).join('') || '<div class="empty-state">No fixtures available.</div>';

  document.querySelectorAll('.odd-button').forEach((button) => button.addEventListener('click', () => {
    const match = button.dataset.match;
    state.selections = state.selections.filter((selection) => selection.match !== match);
    state.selections.push({
      marketId: Number(button.dataset.marketId), match,
      label: button.dataset.label, odds: Number(button.dataset.odds), outcome: button.dataset.outcome,
    });
    renderFixtures(items); renderBetslip();
  }));
}

function renderBetslip() {
  if (!state.selections.length) {
    betslip.innerHTML = '<div class="empty-state">No selections yet. Choose an odd to begin.</div>';
    return;
  }
  const odds = state.selections.reduce((total, selection) => total * selection.odds, 1);
  betslip.innerHTML = `
    ${state.selections.map((selection, index) => `<div class="bet-item"><div class="bet-item-head"><strong>${selection.outcome} (${selection.label})</strong><span>${selection.odds.toFixed(2)}</span></div><small>${selection.match}</small><button data-remove="${index}" style="margin-top:10px;background:none;color:#fca5a5;border:0">Remove</button></div>`).join('')}
    <div class="stake-control"><label>Stake Amount</label><input id="stake-input" type="number" min="1" value="50"></div>
    <div class="summary"><div class="summary-row"><span>Total Odds</span><span>${odds.toFixed(2)}</span></div><div class="summary-row total"><span>Est. Returns</span><span id="estimated-return">${money(5000 * odds / 100)}</span></div></div>
    <button id="place-bet-btn" class="place-bet-btn">Place Bet</button>`;

  const stake = document.querySelector('#stake-input');
  stake.addEventListener('input', () => {
    document.querySelector('#estimated-return').textContent = money(Math.round((Number(stake.value) || 0) * 100 * odds));
  });
  document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    state.selections.splice(Number(button.dataset.remove), 1); renderBetslip();
  }));
  document.querySelector('#place-bet-btn').addEventListener('click', async () => {
    if (!state.token) return alert('Please log in first.');
    try {
      const result = await api('/api/bets', { method: 'POST', body: JSON.stringify({ marketId: state.selections[0].marketId, stakeCents: Math.round(Number(stake.value) * 100) }) });
      alert(`Bet placed. Potential return: ${money(result.bet.potential_payout_cents)}`);
      state.selections = []; await loadUser(); renderBetslip();
    } catch (error) { alert(error.message); }
  });
}

async function loadUser() {
  if (!state.token) return;
  try { const data = await api('/api/me'); state.walletCents = data.user.balanceCents; setWallet(); }
  catch { localStorage.removeItem('apexbet_token'); state.token = null; }
}

async function loadHistory() {
  if (!state.token) return (history.innerHTML = '<div class="empty-state">Login to view bet history.</div>');
  try {
    const data = await api('/api/bets');
    history.innerHTML = data.bets.length ? data.bets.map((bet) => `<div class="bet-item"><div class="bet-item-head"><strong>${bet.outcome_name}</strong><span>${Number(bet.odds).toFixed(2)}</span></div><small>Stake: ${money(bet.stake_cents)} · ${bet.home_team} vs ${bet.away_team}</small></div>`).join('') : '<div class="empty-state">No bets placed yet.</div>';
  } catch (error) { history.innerHTML = `<div class="empty-state">${error.message}</div>`; }
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));
  tab.classList.add('active'); document.querySelector(`#${tab.dataset.tab}-content`).classList.add('active');
  if (tab.dataset.tab === 'history') loadHistory();
}));

document.querySelector('#deposit-btn').addEventListener('click', async () => {
  const amount = Number(prompt('Demo deposit amount:', '100'));
  if (!Number.isFinite(amount) || amount <= 0) return;
  try { const data = await api('/api/deposit', { method: 'POST', body: JSON.stringify({ amountCents: Math.round(amount * 100) }) }); state.walletCents = data.balanceCents; setWallet(); }
  catch (error) { alert(error.message); }
});

async function init() {
  setWallet();
  try {
    const matches = await api('/api/matches'); renderFixtures(matches.fixtures);
    if (!state.token) {
      const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo@apexbet.com', password: 'password123' }) });
      state.token = login.token; localStorage.setItem('apexbet_token', state.token);
    }
    await loadUser(); renderBetslip();
  } catch (error) { fixtures.innerHTML = `<div class="empty-state">${error.message}</div>`; }
}
init();
