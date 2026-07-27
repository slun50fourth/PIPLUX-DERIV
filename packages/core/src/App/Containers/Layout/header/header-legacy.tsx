import React from 'react';
import { useHistory } from 'react-router-dom';
import classNames from 'classnames';

import { observer, useStore } from '@deriv/stores';
import { routes } from '@deriv/shared';
import { useDevice } from '@deriv-com/ui';

import { AccountActions } from 'App/Components/Layout/Header';
import { AccountsInfoLoader } from 'App/Components/Layout/Header/Components/Preloader';
import NewVersionNotification from 'App/Containers/new-version-notification';

const HeaderLegacy = observer(() => {
    const history = useHistory();
    const { client, ui, notifications } = useStore();
    const { is_logged_in, is_logging_in } = client;
    const { is_app_disabled, is_route_modal_on } = ui;
    const { addNotificationMessage, client_notifications, removeNotificationMessage } = notifications;

    const { isMobile } = useDevice();

    const addUpdateNotification = () => addNotificationMessage(client_notifications?.new_version_available);
    const removeUpdateNotification = React.useCallback(
        () => removeNotificationMessage({ key: 'new_version_available' }),
        [removeNotificationMessage]
    );

    React.useEffect(() => {
        document.addEventListener('IgnorePWAUpdate', removeUpdateNotification);
        return () => document.removeEventListener('IgnorePWAUpdate', removeUpdateNotification);
    }, [removeUpdateNotification]);

    return (
        <header
            className={classNames('header', {
                'header--is-disabled': is_app_disabled || is_route_modal_on,
            })}
        >
            <div className='header__menu-items'>
                {isMobile && (
                    <div className='header__logo' onClick={() => history.push(routes.landing)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', paddingLeft: '8px' }}>
                        <div style={{ width: '32px', height: '32px', fontSize: '15px', background: 'linear-gradient(135deg, #ffd700 0%, #b8860b 100%)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#000', fontFamily: 'Ubuntu, sans-serif' }}>
                            <span>P</span>
                            <span style={{ margin: '0 1px', opacity: 0.7 }}>/</span>
                            <span>L</span>
                        </div>
                    </div>
                )}
                {is_logging_in ? (
                    <div id='dt_core_header_acc-info-preloader' className='acc-info__preloader'>
                        <AccountsInfoLoader is_logged_in={is_logged_in} />
                    </div>
                ) : (
                    <AccountActions />
                )}
            </div>
            <NewVersionNotification onUpdate={addUpdateNotification} />
        </header>
    );
});

export default HeaderLegacy;
