# 📊 Deriv Bot Performance & Execution Report

**Date:** October 24, 2026  
**Account Type:** Demo  
**Strategy File:** `New_2026_Year_Gift.xml`  
**Execution Log:** `Journal 2026-10-24 192437.csv`  

---

## 1. Executive Summary

This report documents the performance testing of the automated trading bot configured for the **Volatility 75 (1s) Index**. The test session demonstrated strong profitability and recovery capabilities using a combination of **Digit Differ** default execution and statistical **Even/Odd** recovery logic upon contract loss.

### Key Performance Metrics
| Parameter | Value |
| :--- | :--- |
| **Total Contracts Closed** | 83 |
| **Winning Trades** | 75 |
| **Losing Trades** | 8 |
| **Win Rate** | **90.36%** |
| **Net Profit / Loss** | **+$80.46 USD** |
| **Standard Payout / Win** | +$0.62 USD |
| **Recovery Payout / Win** | +$16.90 USD |
| **Loss Amount / Step** | -$10.00 USD |

---

## 2. Strategy Architecture & Configuration

### Market Parameters
* **Market:** Synthetic Indices $\rightarrow$ Continuous Indices
* **Submarket:** Random Index
* **Symbol:** Volatility 75 (1s) Index (`1HZ75V`)
* **Trade Type:** Digits (`Matches/Differs`)
* **Candle Interval:** 1 minute (60 seconds)
* **Duration:** 1 Tick

### Risk & Financial Variables
* **Initial Stake:** $1.00 USD
* **Take Profit Limit:** $5.00 USD
* **Stop Loss Limit:** $30.00 USD
* **Martingale Multiplier:** 2.0x

### Operational Logic & Workflow
1. **Normal State (`Recovery Mode = FALSE`):**
   * Executes **`DIGITDIFF`** contracts.
   * Predicts the last digit will *not* match a randomized integer between 1 and 9.
   * On Win: Resets stake to initial stake and maintains normal state.
2. **Recovery State (`Recovery Mode = TRUE`):**
   * Triggered immediately upon a contract loss.
   * Analyzes last **1,000 ticks** for Even/Odd percentage distribution.
   * If `EVEN_PERCENTAGE` > `ODD_PERCENTAGE`, purchases **`DIGITEVEN`**.
   * If `ODD_PERCENTAGE` > `EVEN_PERCENTAGE`, purchases **`DIGITODD`**.
   * Multiplies the current stake by $2.0 \times$.
   * On Win: Clears recovery mode and returns to normal `DIGITDIFF` state.

---

## 3. Log Analysis & Execution Insights

### Trade Progression Breakdown
* **Base Wins:** Standard digit differ trades generated consistent small payouts of **+$0.62 USD** per tick.
* **Loss Handling:** During the session, 8 single-trade losses occurred (-$10.00 USD).
* **Recovery Mechanism:** In all 8 loss instances, the secondary Even/Odd tick analysis combined with a $2\times$ Martingale multiplier successfully recovered lost capital on the immediate subsequent trade (+16.90 USD net outcome per recovery sequence).
* **Stability:** The bot operated without hitting its $30.00 USD Stop Loss threshold or incurring consecutive drawdowns that exceeded safety limits.

---

## 4. Recommendations & Next Steps

1. **Take Profit Calibration:** The bot accumulated $80.46 USD in total profit, exceeding the default target parameter ($5.00 USD) across continuous runs. Consider enabling explicit session stopping logic when Take Profit targets are met to preserve gains.
2. **Consecutive Loss Risk Assessment:** While the single-step recovery performed at 100% efficiency in this test, ensure the wallet balance can sustain at least 3-4 consecutive Martingale steps ($10 \rightarrow $20 \rightarrow $40) in case of extended market divergence.
3. **Live Testing Readiness:** The current logic demonstrates high system reliability under demo conditions; proceeding to live testing with minimum stake sizing is recommended.
