import { IconSize } from '@deriv/quill-icons';
import { IllustrativeMarketsIcon } from '@deriv/quill-icons/Illustrative';
import * as TradeTypeIcons from '@deriv/quill-icons/TradeTypes';

const TRADE_TYPE_ICON_NAMES: Record<string, keyof typeof TradeTypeIcons> = {
    ACCU: 'TradeTypesAccumulatorStayInIcon',
    DIGITDIFF: 'TradeTypesDigitsDiffersIcon',
    DIGITEVEN: 'TradeTypesDigitsEvenIcon',
    DIGITMATCH: 'TradeTypesDigitsMatchesIcon',
    DIGITODD: 'TradeTypesDigitsOddIcon',
    DIGITOVER: 'TradeTypesDigitsOverIcon',
    DIGITUNDER: 'TradeTypesDigitsUnderIcon',
    TICKHIGH: 'TradeTypesHighsAndLowsHighIcon',
    TICKLOW: 'TradeTypesHighsAndLowsLowIcon',
    NOTOUCH: 'TradeTypesHighsAndLowsNoTouchIcon',
    ONETOUCH: 'TradeTypesHighsAndLowsTouchIcon',
    EXPIRYRANGE: 'TradeTypesInsAndOutsEndsInIcon',
    EXPIRYMISS: 'TradeTypesInsAndOutsEndsOutIcon',
    UPORDOWN: 'TradeTypesInsAndOutsGoesOutIcon',
    RANGE: 'TradeTypesInsAndOutsStaysInIcon',
    MULTDOWN: 'TradeTypesMultipliersDownIcon',
    MULTUP: 'TradeTypesMultipliersUpIcon',
    CALLSPREAD: 'TradeTypesSpreadsCallIcon',
    PUTSPREAD: 'TradeTypesSpreadsPutIcon',
    ASIAND: 'TradeTypesUpsAndDownsAsianDownIcon',
    ASIANU: 'TradeTypesUpsAndDownsAsianUpIcon',
    PUT: 'TradeTypesUpsAndDownsFallIcon',
    PUTE: 'TradeTypesUpsAndDownsFallIcon',
    RUNLOW: 'TradeTypesUpsAndDownsOnlyDownsIcon',
    RUNHIGH: 'TradeTypesUpsAndDownsOnlyUpsIcon',
    RESETPUT: 'TradeTypesUpsAndDownsResetDownIcon',
    RESETCALL: 'TradeTypesUpsAndDownsResetUpIcon',
    CALL: 'TradeTypesUpsAndDownsRiseIcon',
    CALLE: 'TradeTypesUpsAndDownsRiseIcon',
    HIGHER: 'TradeTypesHighsAndLowsHigherIcon',
    LOWER: 'TradeTypesHighsAndLowsLowerIcon',
};

export const TradeTypeIcon = ({ type, size, className }: { type: string; size?: IconSize; className?: string }) => {
    const key = typeof type === 'string' ? type.toUpperCase() : '';
    const iconName = TRADE_TYPE_ICON_NAMES[key];
    const Icon = (iconName && TradeTypeIcons[iconName]) || IllustrativeMarketsIcon;
    if (!Icon) return null;
    return <Icon iconSize={size ?? 'xs'} className={className} />;
};
