import React from 'react';
import { useHistory } from 'react-router-dom';
import classNames from 'classnames';

import { observer, useStore } from '@deriv/stores';
import { routes } from '@deriv/shared';
import { useDevice } from '@deriv-com/ui';

import { AccountActions, MenuLinks } from 'App/Components/Layout/Header';
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
                <div
                    className='header__logo'
                    onClick={() => history.push(routes.landing)}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', paddingLeft: '8px' }}
                >
                    <img
                        src={isMobile ? '/brand/platform-logo.png' : '/brand/logo-horizontal.png'}
                        alt='PIPLUX'
                        data-testid='dt_header_brand_logo'
                        style={
                            isMobile
                                ? {
                                      width: '34px',
                                      height: '34px',
                                      borderRadius: '7px',
                                      border: '1px solid rgba(212, 175, 55, 0.35)',
                                      objectFit: 'contain',
                                      display: 'block',
                                  }
                                : {
                                      height: '34px',
                                      width: 'auto',
                                      objectFit: 'contain',
                                      display: 'block',
                                  }
                        }
                    />
                </div>
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
