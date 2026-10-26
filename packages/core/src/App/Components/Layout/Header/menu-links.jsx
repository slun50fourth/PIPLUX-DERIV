import { Text } from '@deriv/components';
import { LegacyReportsIcon, StandaloneChartAreaRegularIcon } from '@deriv/quill-icons';
import { routes } from '@deriv/shared';
import { observer, useStore } from '@deriv/stores';
import { useTranslations } from '@deriv-com/translations';

import { BinaryLink } from '../../Routes';

import './menu-links.scss';

const BotIcon = () => (
    <svg
        width='16'
        height='16'
        viewBox='0 0 24 24'
        fill='none'
        stroke='var(--color-text-primary, #ffffff)'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
        className='header__icon'
        style={{ fill: 'none' }}
    >
        <rect x='3' y='11' width='18' height='10' rx='2' />
        <circle cx='12' cy='5' r='2' />
        <path d='M12 7v4' />
        <line x1='8' y1='16' x2='8.01' y2='16' />
        <line x1='16' y1='16' x2='16.01' y2='16' />
    </svg>
);

const MenuItems = ({ id, text, icon, link_to }) => {
    return (
        <BinaryLink
            id={id}
            key={icon}
            to={link_to}
            className='header__menu-link'
            active_class='header__menu-link--active'
        >
            <Text size='m' line_height='xs' title={text} className='header__menu-link-text'>
                {icon}
                {text}
            </Text>
        </BinaryLink>
    );
};

const ReportTab = () => {
    const { localize } = useTranslations();
    return (
        <MenuItems
            id={'dt_reports_tab'}
            icon={<LegacyReportsIcon className='header__icon' iconSize='xs' fill='var(--color-text-primary)' />}
            text={localize('Reports')}
            link_to={routes.reports}
        />
    );
};

const TradeTab = () => {
    const { localize } = useTranslations();
    return (
        <MenuItems
            id={'dt_trade_tab'}
            icon={<StandaloneChartAreaRegularIcon iconSize='sm' fill='var(--color-text-primary)' className='header__icon' />}
            text={localize('Trade')}
            link_to={routes.trader}
        />
    );
};

const BotTab = () => {
    const { localize } = useTranslations();
    return (
        <MenuItems
            id={'dt_bot_tab'}
            icon={<BotIcon />}
            text={localize('Bot Builder')}
            link_to={routes.bot}
        />
    );
};

const MenuLinks = observer(({ is_traders_hub_routes = false }) => {
    const { currentLang } = useTranslations();
    const { client } = useStore();
    const { is_logged_in } = client;

    if (!is_logged_in) return <></>;

    return (
        <div key={`menu-links__${currentLang}`} className='header__menu-links'>
            {!is_traders_hub_routes && (
                <>
                    <TradeTab />
                    <BotTab />
                    <ReportTab />
                </>
            )}
        </div>
    );
});

export default MenuLinks;
