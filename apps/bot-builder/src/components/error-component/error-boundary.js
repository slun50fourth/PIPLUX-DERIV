import React from 'react';
import PropTypes from 'prop-types';
import ErrorComponent from './index';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, info: null };
    }

    componentDidCatch = (error, info) => {
        console.error('[ErrorBoundary caught]', error, info);
        if (window.TrackJS) window.TrackJS.console.log(this.props.root_store);

        this.setState({
            hasError: true,
            error,
            info,
        });
    };

    resetError = () => {
        this.setState({ hasError: false, error: null, info: null });
    };

    render = () =>
        this.state.hasError ? (
            <ErrorComponent
                should_show_refresh={true}
                redirectOnClick={this.resetError}
                redirect_label='Retry'
            />
        ) : (
            this.props.children
        );
}

ErrorBoundary.propTypes = {
    root_store: PropTypes.object,
    children: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.node), PropTypes.node]),
};

export default ErrorBoundary;
