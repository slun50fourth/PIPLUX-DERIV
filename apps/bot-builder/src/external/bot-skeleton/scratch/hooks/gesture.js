import DBotStore from '../dbot-store';

/**
 * Ensure stale touch identifiers from interrupted/cancelled mobile touch gestures
 * never lock out subsequent pointerdown events on the Blockly workspace.
 */
if (window.Blockly?.Touch) {
    const originalCheckTouchIdentifier = window.Blockly.Touch.checkTouchIdentifier;
    window.Blockly.Touch.checkTouchIdentifier = function (e) {
        if (e && e.type === 'pointerdown') {
            const activeGesture = window.Blockly?.derivWorkspace?.currentGesture_;
            if (!activeGesture || !activeGesture.isDragging()) {
                window.Blockly.Touch.clearTouchIdentifier();
            }
        }
        return originalCheckTouchIdentifier.call(this, e);
    };
}

/**
 * Ensure stale non-dragging gestures on WorkspaceSvg are cleaned up on new pointerdown
 * instead of aborting the new gesture.
 */
if (window.Blockly?.WorkspaceSvg?.prototype?.getGesture) {
    const originalGetGesture = window.Blockly.WorkspaceSvg.prototype.getGesture;
    window.Blockly.WorkspaceSvg.prototype.getGesture = function (e) {
        if (e && e.type === 'pointerdown' && this.currentGesture_ && !this.currentGesture_.isDragging()) {
            try {
                this.currentGesture_.dispose();
            } catch (err) {
                // ignore disposal errors on stale gesture
            }
            this.clearGesture();
            window.Blockly?.Touch?.clearTouchIdentifier?.();
        }
        return originalGetGesture.call(this, e);
    };
}

/**
 * Bind pointercancel in addition to pointerup so mobile browser scroll/gesture cancellations
 * always clean up Blockly's active gesture and touchIdentifier.
 */
const originalBindMouseEvents = window.Blockly.Gesture.prototype.bindMouseEvents;
window.Blockly.Gesture.prototype.bindMouseEvents = function (e) {
    originalBindMouseEvents.call(this, e);
    if (window.Blockly?.browserEvents?.conditionalBind) {
        this.boundEvents.push(
            window.Blockly.browserEvents.conditionalBind(
                document,
                'pointercancel',
                null,
                this.handleUp.bind(this),
                true
            )
        );
    }
};

/**
 * Record touch start timestamp on block touch so quick swipes on mobile scroll the workspace
 * instead of accidentally dragging blocks out of position.
 */
const originalHandleBlockStart = window.Blockly.Gesture.prototype.handleBlockStart;
window.Blockly.Gesture.prototype.handleBlockStart = function (e, block) {
    this.blockTouchStartTime_ = Date.now();
    return originalHandleBlockStart.call(this, e, block);
};

/**
 * On mobile, prevent accidental dragging of the 4 main root blocks (1. Trade parameters,
 * 2. Purchase conditions, 3. Sell conditions, 4. Restart trading conditions) and route
 * quick swipe gestures (< 300ms before exceeding drag radius) to workspace scrolling.
 */
window.Blockly.Gesture.prototype.updateIsDraggingBlock = function () {
    if (!this.targetBlock) {
        return false;
    }
    if (this.flyout) {
        if (this.updateIsDraggingFromFlyout()) {
            this.startDraggingBlock();
            return true;
        }
        return false;
    }

    const is_mobile = window.innerWidth <= 768 || Boolean(DBotStore.instance?.is_mobile);
    if (is_mobile) {
        // Never drag the main root container blocks on mobile; pan/scroll the workspace instead
        if (this.targetBlock.isMainBlock?.()) {
            return false;
        }
        // For child blocks on mobile, a quick swipe (< 300ms) pans the workspace;
        // press-and-hold (>= 300ms) drags the block.
        const touchElapsed = Date.now() - (this.blockTouchStartTime_ || 0);
        if (touchElapsed < 300) {
            return false;
        }
    }

    if (this.targetBlock.isMovable()) {
        this.startDraggingBlock();
        return true;
    }
    return false;
};

/**
 * Update this gesture to record whether a block is being dragged from the
 * flyout. This function should be called on a mouse/touch move event the first time the
 * drag radius is exceeded.  It should be called no more than once per gesture.
 * If a block should be dragged from the flyout this function creates the new
 * block on the main workspace and updates targetBlock_ and startWorkspace_.
 * @return {boolean} True if a block is being dragged from the flyout.
 * @private
 */
window.Blockly.Gesture.prototype.updateIsDraggingFromFlyout = function () {
    // Disabled blocks may not be dragged from the flyout.
    if (this.targetBlock.disabled) {
        return false;
    }

    if (!this.flyout.isScrollable() || this.flyout.isDragTowardWorkspace(this.currentDragDeltaXY)) {
        this.startWorkspace_ = this.flyout.targetWorkspace;
        this.startWorkspace_.updateScreenCalculationsIfScrolled();

        // Start the event group now, so that the same event group is used for block
        // creation and block dragging.
        if (!window.Blockly.Events.getGroup()) {
            window.Blockly.Events.setGroup(true);
        }

        // This is done because when this flag is set to true inside Blockly,
        // the handleMove function is called, which also triggers handleTouchMove
        // if the flag is false. This method wont be called everything will be handled in handleMove.
        const is_mobile = window.innerWidth < 768;
        if (is_mobile) this.isMultiTouch_ = false;

        // The start block is no longer relevant, because this is a drag.
        this.startBlock.workspace.clearGesture();
        this.startBlock = null;
        this.targetBlock = this.flyout.createBlock(this.mostRecentEvent, this.targetBlock);
        this.targetBlock.select();
        return true;
    }
    return false;
};
