/**
 * New 2026 Year Gift / 2026 Bot Strategy (Clean-room TypeScript Implementation)
 * Extracted from digittools.pro (@@@New 2026 Year Gift 🎁.xml / #2026bot)
 *
 * Strategy Overview:
 * - Market: Volatility 75 (1s) Index ('1HZ75V')
 * - Duration: 1 Tick
 * - Normal Mode:
 *     - Buys DIGITDIFF (Differs from selected barrier digit, ~90% nominal win rate)
 * - Recovery Mode (after a loss):
 *     - Scans the last 1000 ticks for Even vs Odd distribution:
 *         - If Even % > Odd %: Buys DIGITEVEN
 *         - If Odd % > Even %: Buys DIGITODD
 *     - Applies a progressive Martingale multiplier to recover the lost stake
 */

export interface Differs2026Config {
  symbol?: string; // Default '1HZ75V'
  initialStake: number;
  takeProfit: number;
  stopLoss: number;
  predictionBarrier?: number; // Barrier digit for DIGITDIFF (0-9, default 5)
  martingaleMultiplier?: number; // Default 11.5 for Differs, or progressive
}

export interface DiffersTradeSignal {
  contractType: 'DIGITDIFF' | 'DIGITEVEN' | 'DIGITODD';
  barrier?: number;
  stake: number;
  symbol: string;
  duration: number;
  durationUnit: 't';
}

export class Differs2026Strategy {
  private config: Required<Differs2026Config>;
  private currentStake: number;
  private isRecoveryMode = false;
  private totalProfit = 0;
  private digitBuffer: number[] = [];

  constructor(config: Differs2026Config) {
    this.config = {
      symbol: config.symbol ?? '1HZ75V',
      initialStake: config.initialStake,
      takeProfit: config.takeProfit,
      stopLoss: config.stopLoss,
      predictionBarrier: config.predictionBarrier ?? 5,
      martingaleMultiplier: config.martingaleMultiplier ?? 11.5,
    };
    this.currentStake = this.config.initialStake;
  }

  /**
   * Process an incoming tick.
   */
  public onTick(lastDigit: number): DiffersTradeSignal | null {
    this.digitBuffer.push(lastDigit);
    if (this.digitBuffer.length > 1000) {
      this.digitBuffer.shift();
    }

    if (this.isSessionComplete()) {
      return null;
    }

    if (!this.isRecoveryMode) {
      // Normal Mode: Purchase DIGITDIFF
      return {
        contractType: 'DIGITDIFF',
        barrier: this.config.predictionBarrier,
        stake: this.currentStake,
        symbol: this.config.symbol,
        duration: 1,
        durationUnit: 't',
      };
    } else {
      // Recovery Mode: Check Even / Odd percentages over available historical ticks
      let evenCount = 0;
      let oddCount = 0;
      for (const d of this.digitBuffer) {
        if (d % 2 === 0) evenCount++;
        else oddCount++;
      }

      if (evenCount > oddCount) {
        return {
          contractType: 'DIGITEVEN',
          stake: this.currentStake,
          symbol: this.config.symbol,
          duration: 1,
          durationUnit: 't',
        };
      } else if (oddCount > evenCount) {
        return {
          contractType: 'DIGITODD',
          stake: this.currentStake,
          symbol: this.config.symbol,
          duration: 1,
          durationUnit: 't',
        };
      } else {
        // Equal distribution: default to DIGITEVEN
        return {
          contractType: 'DIGITEVEN',
          stake: this.currentStake,
          symbol: this.config.symbol,
          duration: 1,
          durationUnit: 't',
        };
      }
    }
  }

  /**
   * Updates state after contract settlement.
   */
  public onContractSettled(won: boolean, profit: number): void {
    this.totalProfit += profit;

    if (won) {
      this.currentStake = this.config.initialStake;
      this.isRecoveryMode = false;
    } else {
      this.isRecoveryMode = true;
      this.currentStake = +(this.currentStake * this.config.martingaleMultiplier).toFixed(2);
    }
  }

  public isSessionComplete(): boolean {
    return (
      this.totalProfit >= this.config.takeProfit ||
      this.totalProfit <= -Math.abs(this.config.stopLoss)
    );
  }

  public getStatus() {
    return {
      currentStake: this.currentStake,
      isRecoveryMode: this.isRecoveryMode,
      totalProfit: this.totalProfit,
      isCompleted: this.isSessionComplete(),
      samplesCollected: this.digitBuffer.length,
    };
  }
}
