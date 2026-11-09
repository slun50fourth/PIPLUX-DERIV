import { runInvisibleEvents } from '../utils';

window.Blockly.FieldDropdown.prototype.updateOptions = function (dropdown_options, options = {}) {
    if (window.Blockly.DropDownDiv.isVisible()) {
        window.Blockly.DropDownDiv.hideWithoutAnimation();
    }

    let previous_value = this.getValue();
    const fallback_val = options.default_value || previous_value;
    const valid_options = Array.isArray(dropdown_options)
        ? dropdown_options.filter(item => Array.isArray(item) && item[1] !== '' && item[1] !== 'na')
        : [];

    if (valid_options.length === 0 && fallback_val) {
        this.menuGenerator_ = [[String(fallback_val), String(fallback_val)]];
    } else if (Array.isArray(dropdown_options) && dropdown_options.length > 0) {
        this.menuGenerator_ = dropdown_options;
    } else {
        this.menuGenerator_ = [['', '']];
    }

    if (options.should_pretend_empty) {
        previous_value = '';
    }

    // Set a flag indicating whether the default value passed to this function is available in the newly
    // set dropdown options, if false the default option will be the first available one.
    const has_default_value =
        this.menuGenerator_.findIndex(item => Array.isArray(item) && item[1] === options.default_value) !== -1;

    runInvisibleEvents(() => {
        if (has_default_value) {
            this.setValue(options.default_value);
        } else if (valid_options.length === 0 && fallback_val) {
            this.setValue(fallback_val);
        } else if (this.menuGenerator_.length > 0) {
            // Default to first if option isn't available.
            this.setValue(this.menuGenerator_[0][1]);
        } else {
            this.setValue(previous_value);
        }
    });

    // If "should_trigger_event" prop is omitted or set to true, fire an event.
    if (!options.should_trigger_event || options.should_trigger_event === true) {
        const event = new window.Blockly.Events.BlockChange(
            this.sourceBlock_,
            'field',
            this.name,
            previous_value,
            this.getValue()
        );
        event.recordUndo = false;
        event.group = options.event_group;
        window.Blockly.Events.fire(event);
    }
};
