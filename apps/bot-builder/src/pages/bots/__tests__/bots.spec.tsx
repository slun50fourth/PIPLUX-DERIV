import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DBOT_TABS } from '@/constants/bot-contents';
import { load, save_types } from '@/external/bot-skeleton';
import BotsPage from '../bots';
import { PIPLUX_BOTS } from '../bots-catalog';

const mockLoad = load as jest.Mock;

const mockStore = {
    dashboard: {
        active_tab: DBOT_TABS.BOTS,
        setActiveTab: jest.fn(),
    },
    run_panel: {
        is_running: false,
        is_stop_button_visible: false,
        onRunButtonClick: jest.fn(),
        onStopBotClick: jest.fn(),
    },
};

jest.mock('@/hooks/useStore', () => ({
    useStore: () => mockStore,
}));

jest.mock('@/external/bot-skeleton', () => ({
    load: jest.fn().mockResolvedValue(undefined),
    save_types: { LOCAL: 'local' },
}));

describe('BotsPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStore.dashboard.active_tab = DBOT_TABS.BOTS;
        mockStore.run_panel.is_running = false;
        mockStore.run_panel.is_stop_button_visible = false;
        (window as unknown as { Blockly: { derivWorkspace: object } }).Blockly = {
            derivWorkspace: { id: 'mock-workspace' },
        };
    });

    it('renders Over 1 Under 8 Recovery Over 4 as the first featured bot with verified metadata', () => {
        render(<BotsPage />);

        const headings = screen.getAllByRole('heading', { level: 3 });
        expect(headings[0]).toHaveTextContent('Over 1 Under 8 Recovery Over 4');
        expect(PIPLUX_BOTS[0].xml).toContain('1HZ15V');
        expect(PIPLUX_BOTS[0].xml).toContain('Take Profit');
        expect(PIPLUX_BOTS[0].xml).toContain('Martangle Level');
        expect(screen.getByText('Featured Strategy')).toBeInTheDocument();
        expect(screen.getByText('$20.00')).toBeInTheDocument();
        expect(screen.getByText('$200.00')).toBeInTheDocument();
        expect(screen.getByText('Over 4 · Lvl 4')).toBeInTheDocument();
    });

    it('loads the selected bot XML into Blockly and navigates to Bot Builder on click', async () => {
        render(<BotsPage />);

        const primaryBtn = screen.getByTestId('dt-use-bot-piplux-bot-over-1-under-8-recovery-over-4');
        fireEvent.click(primaryBtn);

        await waitFor(() => {
            expect(mockLoad).toHaveBeenCalledWith({
                block_string: PIPLUX_BOTS[0].xml,
                strategy_id: PIPLUX_BOTS[0].id,
                file_name: 'Over 1 Under 8 Recovery Over 4',
                workspace: (window as unknown as { Blockly: { derivWorkspace: object } }).Blockly.derivWorkspace,
                from: save_types.LOCAL,
                drop_event: {},
                showIncompatibleStrategyDialog: false,
                show_snackbar: true,
            });
        });

        expect(mockStore.dashboard.setActiveTab).toHaveBeenCalledWith(DBOT_TABS.BOT_BUILDER);
        expect(screen.getByRole('status')).toHaveTextContent(
            'Over 1 Under 8 Recovery Over 4 loaded into Bot Builder and ready to run.'
        );
        expect(screen.getByTestId('dt-run-bot-piplux-bot-over-1-under-8-recovery-over-4')).toBeInTheDocument();
    });

    it('warns without overwriting the workspace when another bot is currently running', () => {
        mockStore.run_panel.is_running = true;
        render(<BotsPage />);

        fireEvent.click(screen.getByTestId('dt-use-bot-piplux-bot-over-1-under-8-recovery-over-4'));

        expect(mockLoad).not.toHaveBeenCalled();
        expect(mockStore.dashboard.setActiveTab).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('Stop your active bot before switching strategies.');
    });
});
