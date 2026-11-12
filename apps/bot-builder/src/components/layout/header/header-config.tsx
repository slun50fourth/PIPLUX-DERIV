import { ReactNode } from 'react';
import { standalone_routes } from '@/components/shared';
import { LegacyHomeNewIcon as TradershubLogo } from '@deriv/quill-icons/Legacy';
import { localize } from '@deriv-com/translations';

const PipluxWordmark = ({ height }: { height: number }) => (
    <img
        src='/deriv-bot/brand-logo-horizontal.png'
        alt='PIPLUX'
        height={height}
        style={{ height: `${height}px`, width: 'auto', objectFit: 'contain', display: 'block' }}
    />
);

export type PlatformsConfig = {
    active: boolean;
    buttonIcon: ReactNode;
    description: string;
    href: string;
    icon: ReactNode;
    showInEU: boolean;
};

export type MenuItemsConfig = {
    as: 'a' | 'button';
    href: string;
    icon: ReactNode;
    label: string;
};

export type TAccount = {
    balance: string;
    currency: string;
    icon: React.ReactNode;
    isActive: boolean;

    isVirtual: boolean;
    loginid: string;
    token: string;
    type: string;
};

export const platformsConfig: PlatformsConfig[] = [
    {
        active: false,
        buttonIcon: <PipluxWordmark height={25} />,
        description: localize(
            'PIPLUX Trading is an intuitive derivatives platform that empowers traders to navigate global markets effortlessly using smart technical analysis tools and ultra-fast execution infrastructure.'
        ),
        href: standalone_routes.trade,
        icon: <PipluxWordmark height={32} />,
        showInEU: true,
    },
    {
        active: true,
        buttonIcon: <PipluxWordmark height={25} />,
        description: localize('Automated trading at your fingertips. No coding needed.'),
        href: standalone_routes.bot,
        icon: <PipluxWordmark height={32} />,
        showInEU: false,
    },
    {
        active: false,
        buttonIcon: <PipluxWordmark height={24} />,
        description: localize('Trade the world’s markets with our popular user-friendly platform.'),
        href: standalone_routes.smarttrader,
        icon: <PipluxWordmark height={32} />,
        showInEU: false,
    },
];

export const TRADERS_HUB_LINK_CONFIG = {
    as: 'a',
    href: standalone_routes.traders_hub,
    icon: <TradershubLogo iconSize='xs' />,
    label: 'Home',
};

// ========================================
// MENU ITEMS CONFIGURATION PLACEHOLDER
// ========================================
//
// Add your custom menu items here for the desktop header.
//
// EXAMPLE:
// export const MenuItems: MenuItemsConfig[] = [
//     {
//         as: 'a',
//         href: '/your-page',
//         icon: <YourIcon />,
//         label: localize('Your Menu Item'),
//     },
// ];
//
// Empty by default for white-labeling
export const MenuItems: MenuItemsConfig[] = [];
