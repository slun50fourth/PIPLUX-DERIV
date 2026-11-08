import { localize } from '@deriv-com/translations';

const purchaseChoices = [
    ['Over', 'DIGITOVER'],
    ['Under', 'DIGITUNDER'],
    ['Even', 'DIGITEVEN'],
    ['Odd', 'DIGITODD'],
    ['Matches', 'DIGITMATCH'],
    ['Differs', 'DIGITDIFF'],
    ['Rise', 'CALL'],
    ['Fall', 'PUT'],
    ['Touch', 'ONETOUCH'],
    ['No Touch', 'NOTOUCH'],
];

// Register apollo_purchase and apollo_purchase2
['apollo_purchase', 'apollo_purchase2'].forEach(blockName => {
    window.Blockly.Blocks[blockName] = {
        init() {
            this.appendDummyInput()
                .appendField(localize('Purchase'))
                .appendField(new window.Blockly.FieldDropdown(purchaseChoices), 'PURCHASE_LIST');
            this.appendValueInput('PREDICTION').setCheck('Number').appendField(localize('Prediction'));
            this.setPreviousStatement(true, null);
            this.setNextStatement(false, null);
            this.setColour('#f29c1f');
        },
        meta() {
            return {
                display_name: localize('Purchase'),
                description: localize('Purchases the selected contract type with optional prediction.'),
            };
        },
    };

    const generator = block => {
        const ctype = block.getFieldValue('PURCHASE_LIST') || 'CALL';
        return `Bot.purchase('${ctype}');\n`;
    };

    if (window.Blockly.JavaScript) {
        window.Blockly.JavaScript[blockName] = generator;
        if (window.Blockly.JavaScript.javascriptGenerator?.forBlock) {
            window.Blockly.JavaScript.javascriptGenerator.forBlock[blockName] = generator;
        }
    }
});

// Register last_digits_condition
window.Blockly.Blocks.last_digits_condition = {
    init() {
        this.appendValueInput('N').setCheck('Number').appendField(localize('Last'));
        this.appendDummyInput()
            .appendField(localize('digits are'))
            .appendField(
                new window.Blockly.FieldDropdown([
                    ['<=', 'LESS_OR_EQUAL'],
                    ['>=', 'GREATER_OR_EQUAL'],
                    ['<', 'LESS'],
                    ['>', 'GREATER'],
                    ['=', 'EQUAL'],
                    ['All Even', 'ALL_EVEN'],
                    ['All Odd', 'ALL_ODD'],
                ]),
                'CONDITION'
            );
        this.appendValueInput('COMPARE_VALUE').setCheck('Number');
        this.setInputsInline(true);
        this.setOutput(true, 'Boolean');
        this.setColour('#dedede');
    },
    meta() {
        return {
            display_name: localize('Last Digits Condition'),
            description: localize('Tests whether the last N digits meet a comparison condition.'),
        };
    },
};

const lastDigitsGenerator = block => {
    const js = window.Blockly.JavaScript;
    const n = js.valueToCode(block, 'N', js.ORDER_ATOMIC) || '1';
    const cond = block.getFieldValue('CONDITION') || 'LESS_OR_EQUAL';
    const cmp = js.valueToCode(block, 'COMPARE_VALUE', js.ORDER_ATOMIC) || '0';
    let predicate = `return d === (${cmp});`;
    if (cond === 'LESS_OR_EQUAL') predicate = `return d <= (${cmp});`;
    else if (cond === 'GREATER_OR_EQUAL') predicate = `return d >= (${cmp});`;
    else if (cond === 'LESS') predicate = `return d < (${cmp});`;
    else if (cond === 'GREATER') predicate = `return d > (${cmp});`;
    else if (cond === 'ALL_EVEN') predicate = `return d % 2 === 0;`;
    else if (cond === 'ALL_ODD') predicate = `return d % 2 !== 0;`;

    const code = `(Bot.getLastDigitList().slice(-(${n})).every(function(d) { ${predicate} }))`;
    return [code, js.ORDER_FUNCTION_CALL];
};

if (window.Blockly.JavaScript) {
    window.Blockly.JavaScript.last_digits_condition = lastDigitsGenerator;
    if (window.Blockly.JavaScript.javascriptGenerator?.forBlock) {
        window.Blockly.JavaScript.javascriptGenerator.forBlock.last_digits_condition = lastDigitsGenerator;
    }
}

// Register even_odd_analysis
window.Blockly.Blocks.even_odd_analysis = {
    init() {
        this.appendDummyInput()
            .appendField(
                new window.Blockly.FieldDropdown([
                    [localize('Even %'), 'EVEN_PERCENTAGE'],
                    [localize('Odd %'), 'ODD_PERCENTAGE'],
                ]),
                'ANALYSIS_TYPE'
            );
        this.appendValueInput('N').setCheck('Number').appendField(localize('in last'));
        this.appendDummyInput().appendField(localize('ticks'));
        this.setInputsInline(true);
        this.setOutput(true, 'Number');
        this.setColour('#dedede');
    },
    meta() {
        return {
            display_name: localize('Even/Odd Analysis'),
            description: localize('Returns the percentage of even or odd digits in the last N ticks.'),
        };
    },
};

const evenOddGenerator = block => {
    const js = window.Blockly.JavaScript;
    const type = block.getFieldValue('ANALYSIS_TYPE') || 'EVEN_PERCENTAGE';
    const n = js.valueToCode(block, 'N', js.ORDER_ATOMIC) || '1000';
    const isEven = type === 'EVEN_PERCENTAGE';
    const code = `(function() {
        var list = Bot.getLastDigitList().slice(-(${n}));
        if (!list.length) return 0;
        var count = list.filter(function(d) { return ${isEven ? 'd % 2 === 0' : 'd % 2 !== 0'}; }).length;
        return (count / list.length) * 100;
    })()`;
    return [code, js.ORDER_FUNCTION_CALL];
};

if (window.Blockly.JavaScript) {
    window.Blockly.JavaScript.even_odd_analysis = evenOddGenerator;
    if (window.Blockly.JavaScript.javascriptGenerator?.forBlock) {
        window.Blockly.JavaScript.javascriptGenerator.forBlock.even_odd_analysis = evenOddGenerator;
    }
}

// Ensure math_number_positive is aliased to math_number if not already present
if (!window.Blockly.Blocks.math_number_positive && window.Blockly.Blocks.math_number) {
    window.Blockly.Blocks.math_number_positive = window.Blockly.Blocks.math_number;
    if (window.Blockly.JavaScript) {
        window.Blockly.JavaScript.math_number_positive = window.Blockly.JavaScript.math_number;
        if (window.Blockly.JavaScript.javascriptGenerator?.forBlock) {
            window.Blockly.JavaScript.javascriptGenerator.forBlock.math_number_positive =
                window.Blockly.JavaScript.javascriptGenerator.forBlock.math_number;
        }
    }
}
