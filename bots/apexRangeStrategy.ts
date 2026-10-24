/**
 * Apex Range AI Strategy (Clean-room TypeScript Implementation)
 * Extracted from digittools.pro (dtool/Apex Range AI.xml)
 *
 * Strategy Overview:
 * - Market: Volatility 25 (1s) Index ('1HZ25V') or 'R_25'
 * - Duration: 1 Tick
 * - Normal Mode:
 *     - If last 2 digits <= 2: Buy DIGITOVER with barrier 2 (~70% nominal win rate)
 *     - If last 2 digits >= 7: Buy DIGITUNDER with barrier 7 (~70% nominal win rate)
 * - Recovery Mode (after a loss):
 *     - If last 3 digits <= 2: Buy DIGITOVER with barrier 4 (~50% win rate, ~95-100% payout)
 *     - If last 3 digits >= 7: Buy DIGITUNDER with barrier 5 (~50% win rate, ~95-100% payout)
 *     - Martingale multiplier applied to recover loss faster
 */

export interface ApexRangeConfig {
  symbol?: string; // Default '1HZ25V'
  initialStake: number;
  takeProfit: number;
  stopLoss: number;
  useMartingale?: boolean; // Default true
  martingaleMultiplier?: number; // Default 2.5
}

export interface TradeSignal {
  contractType: 'DIGITOVER' | 'DIGITUNDER';
  barrier: number;
  stake: number;
  symbol: string;
  duration: number;
  durationUnit: 't';
}

export class ApexRangeStrategy {
  private config: Required<ApexRangeConfig>;
  private currentStake: number;
  private isRecoveryMode = false;
  private totalProfit = 0;
  private digitHistory: number[] = [];

  constructor(config: ApexRangeConfig) {
    this.config = {
      symbol: config.symbol ?? '1HZ25V',
      initialStake: config.initialStake,
      takeProfit: config.takeProfit,
      stopLoss: config.stopLoss,
      useMartingale: config.useMartingale ?? true,
      martingaleMultiplier: config.martingaleMultiplier ?? 2.5,
    };
    this.currentStake = this.config.initialStake;
  }

  /**
   * Helper to extract the last digit of a spot quote based on decimal precision
   */
  public static extractLastDigit(quote: number, decimals = 2): number {
    const str = quote.toFixed(decimals);
    return parseInt(str.charAt(str.length - 1), 10);
  }

  /**
   * Process an incoming tick. Returns a TradeSignal if entry condition is satisfied, or null.
   */
  public onTick(lastDigit: number): TradeSignal | null {
    this.digitHistory.push(lastDigit);
    if (this.digitHistory.length > 20) {
      this.digitHistory.shift();
    }

    if (this.isSessionComplete()) {
      return null;
    }

    if (!this.isRecoveryMode) {
      // Normal Mode: Check last 2 digits
      if (this.digitHistory.length < 2) return null;
      const [d1, d2] = this.digitHistory.slice(-2);

      if (d1 <= 2 && d2 <= 2) {
        return this.createSignal('DIGITOVER', 2);
      }
      if (d1 >= 7 && d2 >= 7) {
        return this.createSignal('DIGITUNDER', 7);
      }
    } else {
      // Recovery Mode: Check last 3 digits
      if (this.digitHistory.length < 3) return null;
      const [d1, d2, d3] = this.digitHistory.slice(-3);

      if (d1 <= 2 && d2 <= 2 && d3 <= 2) {
        return this.createSignal('DIGITOVER', 4);
      }
      if (d1 >= 7 && d2 >= 7 && d3 >= 7) {
        return this.createSignal('DIGITUNDER', 5);
      }
    }

    return null;
  }

  /**
   * Updates state after a contract is closed.
   */
  public onContractSettled(won: boolean, profit: number): void {
    this.totalProfit += profit;

    if (won) {
      this.currentStake = this.config.initialStake;
      this.isRecoveryMode = false;
    } else {
      this.isRecoveryMode = true;
      if (this.config.useMartingale) {
        this.currentStake = +(this.currentStake * this.config.martingaleMultiplier).toFixed(2);
      } else {
        this.currentStake = this.config.initialStake;
      }
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
      digitHistory: [...this.digitHistory],
    };
  }

  private createSignal(contractType: 'DIGITOVER' | 'DIGITUNDER', barrier: number): TradeSignal {
    return {
      contractType,
      barrier,
      stake: this.currentStake,
      symbol: this.config.symbol,
      duration: 1,
      durationUnit: 't',
    };
  }
}
