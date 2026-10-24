# PIPLUX-DERIV — Bots Directory

This directory contains Deriv DBot XML templates and TypeScript trading engines
for use within the PIPLUX-DERIV platform.

---

## Contents

| File | Type | Description |
|------|------|-------------|
| `Apex_Range_AI.xml` | XML | Over/Under boundary-reversion bot (Volatility 25 1s) |
| `Apex_AI.xml` | XML | Extended multi-contract variant (full Apex AI) |
| `New_2026_Year_Gift.xml` | XML | 2026 Bot — Matches/Differs + Even/Odd recovery (Volatility 75 1s) |
| `apexRangeStrategy.ts` | TypeScript | Engine for Apex Range AI |
| `differs2026Strategy.ts` | TypeScript | Engine for 2026 Bot |
| `aiScannerTypes.ts` | TypeScript | Shared interfaces for Entry Scanner + Pro AI |
| `entryScanner.ts` | TypeScript | Entry Scanner engine |
| `proAiEngine.ts` | TypeScript | Pro AI trading session engine |

---

## Entry Scanner (`entryScanner.ts`)

A statistical market scanner that finds the best Deriv synthetic market,
digit, and strategy profile to trade at any given moment.

### How it works
1. Fetches historical ticks for all 10 Volatility/random_index markets
2. Back-tests **4 strategy profiles** × **10 entry digits** per market
3. Scores each combination using a weighted composite formula:

```
quality = 0.50 × WilsonLB + 0.25 × RecentWinRate + 0.15 × Stability + 0.10 × SamplePenalty
```

4. Returns the single best result and generates injectable Blockly XML

### Acceptance thresholds
- Minimum sample size: **18 entry ticks**
- Minimum recent sample: **8 ticks** (last 30)
- Minimum validation win rate: **45 %**

### Strategy profiles

| ID | Primary | Recovery |
|----|---------|----------|
| `over_1_over_4` | DIGITOVER barrier 1 | DIGITOVER barrier 4 |
| `over_2_over_4` | DIGITOVER barrier 2 | DIGITOVER barrier 4 |
| `under_8_under_5` | DIGITUNDER barrier 8 | DIGITUNDER barrier 5 |
| `under_7_under_5` | DIGITUNDER barrier 7 | DIGITUNDER barrier 5 |

### Usage

```typescript
import { runEntryScan, buildBotXml, sanitiseConfig, injectXmlIntoBlockly } from './entryScanner';
import type { DerivApiClient } from './aiScannerTypes';

const api: DerivApiClient = /* your packages/api-v2 client */;

const config = sanitiseConfig({
  tickCount:    500,
  stake:        0.50,
  martingale:   2,
  numberOfWins: 5,
  stopLoss:     50,
  useMartingale: true,
});

const result = await runEntryScan(api, config, (done, total, latest) => {
  console.log(`Scanned ${done}/${total}`, latest?.symbol);
});

if (result) {
  const xml = buildBotXml(YOUR_XML_TEMPLATE, result, config);
  injectXmlIntoBlockly(xml); // browser only
}
```

---

## Pro AI (`proAiEngine.ts`)

An autonomous real-time WebSocket trading engine with dynamic market selection
and automatic recovery on loss.

### How it works
1. Scans **15 markets** (10 Volatility + 5 Jump indices)
2. Tests all PRIMARY × RECOVERY × digit combinations, scoring each:

```
edgeScore = 0.70 × (WilsonLB − d_primary) + 0.30 × (RecentWinRate − d_recovery)
where d = theoretical random win probability
```

3. Opens a live tick stream and waits for `entryDigit` to appear
4. Places a **primary 1-tick contract**
   - **Win**: increment win counter; rescan after 3 consecutive wins
   - **Loss**: place **recovery contract** at `stake × multiplier`, then rescan
5. Session ends on takeProfit / stopLoss / stop()

### Contract pools

**Primary**: Over 2, Under 8  
**Recovery**: Over 4, Under 5, Even, Odd

### Default settings

| Setting | Default |
|---------|---------|
| Stake | \$0.50 |
| Multiplier | 2× |
| Take Profit | \$5.00 |
| Stop Loss | \$10.00 |
| Tick window | 100 |

### Usage

```typescript
import { startProAi } from './proAiEngine';
import type { DerivApiClient } from './aiScannerTypes';

const api: DerivApiClient = /* your packages/api-v2 client */;

const session = startProAi(
  api,
  { stake: 0.50, multiplier: 2, takeProfit: 5, stopLoss: 10, ticks: 100 },
  {
    onScanComplete: setup  => console.log('Best setup:', setup.symbol, setup.entryDigit),
    onEntry:        digit  => console.log('Entry signal digit:', digit),
    onTradeResult:  (won, profit, balance) => console.log(won ? 'WIN' : 'LOSS', profit, balance),
    onRecovery:     (spec, stake) => console.log('Recovery:', spec.label, '@', stake),
    onSessionEnd:   (reason, pnl) => console.log('Session ended:', reason, 'PnL:', pnl),
    onError:        err    => console.error(err),
  },
  'USD'
);

// Stop later:
session.stop();
```

---

## Connecting to `packages/api-v2`

Both engines accept any object satisfying the `DerivApiClient` interface
(defined in `aiScannerTypes.ts`). The PIPLUX-DERIV monorepo already provides
a WebSocket API wrapper in `packages/api-v2` — wrap it like this:

```typescript
import { DerivAPI } from '@deriv/api-v2';
import type { DerivApiClient } from './bots/aiScannerTypes';

function adaptDerivApi(derivApi: DerivAPI): DerivApiClient {
  return {
    send:      (req)              => derivApi.send(req),
    subscribe: (req, onMessage)   => derivApi.subscribe(req, onMessage),
  };
}
```

---

## Notes

- All engines are **clean-room TypeScript** implementations — no minified
  source code was copied. They were written from a behavioural understanding
  of the original site.
- The engines are **browser-agnostic** except for `injectXmlIntoBlockly()`
  which requires `window.Blockly` (DBot context).
- Both engines implement `stop()` / `stopped` guards so they can be safely
  unmounted from React components.
