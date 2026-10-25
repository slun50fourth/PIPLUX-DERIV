import { getPlatformName, getPlatformDescription, getPlatformLogo, routes } from '@deriv/shared';
import { localize } from '@deriv-com/translations';

type TPlatformConfig = {
    description: () => string;
    href?: string;
    icon: string;
    link_to?: string;
    name: string;
    title: () => string;
};

// Simplified platform config to only include trader platform
const platform_config: TPlatformConfig[] = [
    {
        icon: getPlatformLogo(),
        title: () => getPlatformName(),
        name: getPlatformName(),
        // [AI]
        description: () =>
            getPlatformDescription() ||
            localize('A whole new trading experience on a powerful yet easy to use platform.'),
        // [/AI]
        link_to: routes.index,
    },
    {
        icon: 'IcBrandDbot',
        title: () => localize('Bot Builder'),
        name: 'DBot',
        description: () => localize('Automated trading at your fingertips. Build and run bots without coding.'),
        link_to: routes.bot,
    },
];

export default platform_config;
