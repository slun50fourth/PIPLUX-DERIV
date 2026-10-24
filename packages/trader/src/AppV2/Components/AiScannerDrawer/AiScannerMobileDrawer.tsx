import React from 'react';
import { ActionSheet } from '@deriv-com/quill-ui';
import { Localize } from '@deriv-com/translations';
import AiScannerDrawerContent from './AiScannerDrawerContent';

type AiScannerMobileDrawerProps = {
    isOpen: boolean;
    onClose: () => void;
};

export const AiScannerMobileDrawer: React.FC<AiScannerMobileDrawerProps> = ({ isOpen, onClose }) => {
    return (
        <ActionSheet.Root isOpen={isOpen} onClose={onClose}>
            <ActionSheet.Portal shouldCloseOnDrag fullHeightOnOpen>
                <ActionSheet.Header title={<Localize i18n_default_text='AI Market Scanner' />} />
                <ActionSheet.Content style={{ height: 'calc(100dvh - 90px)', overflowY: 'auto', padding: 0 }}>
                    <AiScannerDrawerContent onClose={onClose} />
                </ActionSheet.Content>
            </ActionSheet.Portal>
        </ActionSheet.Root>
    );
};

export default AiScannerMobileDrawer;
