/**
 * Bind pointercancel in addition to pointerup so interrupted mobile browser touches
 * always end cleanly instead of locking workspace gestures or block dragging.
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
 * Prevent cursor/touch from locking onto a dragged block if the user releases
 * the pointer outside the Bot Builder iframe or the window loses focus.
 */
if (typeof window !== 'undefined' && !window.__pipluxGestureCleanupAttached) {
    window.__pipluxGestureCleanupAttached = true;

    const releaseDanglingGesture = () => {
        const ws = window.Blockly?.derivWorkspace;
        if (ws?.currentGesture_?.isDragging?.()) {
            ws.cancelCurrentGesture();
            window.Blockly?.Touch?.clearTouchIdentifier?.();
        }
    };

    window.addEventListener('blur', releaseDanglingGesture);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) releaseDanglingGesture();
    });

    try {
        if (window.parent && window.parent !== window && window.parent.document) {
            window.parent.document.addEventListener('pointerup', releaseDanglingGesture, true);
            window.parent.document.addEventListener('pointercancel', releaseDanglingGesture, true);
        }
    } catch {
        // Ignore cross-origin access if hosted standalone
    }
}

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
