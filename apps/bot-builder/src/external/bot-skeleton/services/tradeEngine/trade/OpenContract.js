import { getRoundedNumber } from '@/components/shared';
import { api_base } from '../../api/api-base';
import { contract as broadcastContract, contractStatus } from '../utils/broadcast';
import { openContractReceived, sell } from './state/actions';

export default Engine =>
    class OpenContract extends Engine {
        observeOpenContract() {
            if (!api_base.api) return;
            const subscription = api_base.api.onMessage().subscribe(({ data }) => {
                if (data.msg_type === 'proposal_open_contract') {
                    const contract = data.proposal_open_contract;

                    if (!contract || !this.expectedContractId(contract?.contract_id)) {
                        return;
                    }

                    this.setContractFlags(contract);

                    // Normalize contract fields across legacy and v4 Options WebSocket payloads
                    const fallback_buy_id =
                        contract.transaction_ids?.buy ??
                        this.buyTransactionId ??
                        contract.contract_id ??
                        contract.id;
                    const fallback_sell_id =
                        contract.transaction_ids?.sell ??
                        (this.isSold ? contract.contract_id ?? contract.id ?? fallback_buy_id : undefined);
                    contract.transaction_ids = {
                        ...(contract.transaction_ids || {}),
                        buy: fallback_buy_id,
                        ...(fallback_sell_id !== undefined ? { sell: fallback_sell_id } : {}),
                    };
                    contract.underlying_symbol =
                        contract.underlying_symbol || contract.underlying || this.tradeOptions?.symbol || '';
                    contract.underlying = contract.underlying || contract.underlying_symbol;
                    contract.date_start = contract.date_start ?? contract.purchase_time;
                    contract.entry_spot = contract.entry_spot ?? contract.entry_tick;
                    contract.entry_tick = contract.entry_tick ?? contract.entry_spot;
                    contract.entry_tick_time = contract.entry_tick_time ?? contract.entry_spot_time;
                    contract.exit_spot = contract.exit_spot ?? contract.exit_tick;
                    contract.exit_tick = contract.exit_tick ?? contract.exit_spot;
                    contract.exit_tick_time = contract.exit_tick_time ?? contract.exit_spot_time;

                    this.data.contract = contract;

                    broadcastContract({ accountID: api_base.account_info.loginid, ...contract });

                    if (this.isSold) {
                        this.contractId = '';
                        clearTimeout(this.transaction_recovery_timeout);
                        this.updateTotals(contract);
                        contractStatus({
                            id: 'contract.sold',
                            data: contract.transaction_ids?.sell ?? contract.contract_id,
                            contract,
                        });

                        if (this.afterPromise) {
                            this.afterPromise();
                        }

                        this.store.dispatch(sell());
                    } else {
                        this.store.dispatch(openContractReceived());
                    }
                }
            });
            api_base.pushSubscription(subscription);
        }

        waitForAfter() {
            return new Promise(resolve => {
                this.afterPromise = resolve;
            });
        }

        setContractFlags(contract) {
            const { is_expired, is_valid_to_sell, is_sold, entry_tick } = contract;

            this.isSold = Boolean(is_sold);
            this.isSellAvailable = !this.isSold && Boolean(is_valid_to_sell);
            this.isExpired = Boolean(is_expired);
            this.hasEntryTick = Boolean(entry_tick);
        }

        expectedContractId(contractId) {
            return this.contractId && contractId === this.contractId;
        }

        getSellPrice() {
            const { bid_price: bidPrice, buy_price: buyPrice, currency } = this.data.contract;
            return getRoundedNumber(Number(bidPrice) - Number(buyPrice), currency);
        }
    };
