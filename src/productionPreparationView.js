import { calculateProductionPreparation, DEFAULT_PRODUCTION_SETTINGS } from './productionPreparation.js';

// Keep controls mounted while typing/selecting. Only replace calculated output.
export function createProductionPreparationView({ snapshot, consumables, combatHours = 0, settings = {}, onChange, onResult, context = 'plan', inventory = null,
    data, language = 'zh', itemName = value => value }) {
    const zh = language.startsWith('zh');
    if (context === 'plan') consumables = Object.fromEntries(Object.entries(consumables || {})
        .map(([hrid, count]) => [hrid, Math.ceil(count)]));
    const t = (cn, en) => zh ? cn : en;
    const names = { milking: '挤奶', foraging: '采摘', woodcutting: '伐木', cooking: '烹饪', brewing: '冲泡', cheesesmithing: '奶酪锻造', crafting: '制作', tailoring: '缝纫', alchemy: '炼金' };
    const el = (tag, className = '', text = '') => { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; };
    const root = el('section', 'border rounded p-3 mb-3 production-preparation');
    root.append(el('h6', '', t('消耗品准备时间', 'Consumable preparation time')));
    if (!snapshot) {
        root.append(el('p', 'text-warning mb-0', t('这条历史没有新版专业资料。更新主电脑插件、重新导入配装并模拟后，选择新记录即可计算。',
            'This history has no production snapshot. Update the simulator userscript, reimport and simulate, then select the new record.')));
        return root;
    }
    root.append(el('p', 'small text-secondary', (context === 'result'
        ? t('来源：本次模拟时的专业快照；以下按每战斗 1 小时所需补给计算。采集于：', 'Source: simulation snapshot; supplies per combat hour. Captured: ')
        : t('来源：该角色首次选中记录的专业快照。采集于：', 'Source: first selected history snapshot. Captured: ')) + new Date(snapshot.capturedAt).toLocaleString()));
    const output = el('div');
    const details = el('details', 'mt-2');
    details.append(el('summary', '', t('专业配装与社区增益设置', 'Profession loadouts and fixed community buffs')));
    const settingsGrid = el('div', 'row g-2 my-2');
    const save = () => { onChange?.(settings); render(); };
    if (context === 'plan') {
        const label = el('label', 'd-block small mb-2', t('库存抵扣模式', 'Inventory deduction'));
        const mode = el('select', 'form-select form-select-sm');
        mode.setAttribute('aria-label', t('库存抵扣模式', 'Inventory deduction'));
        for (const [value, cn, en] of [['all','成品和原材料','Finished goods and ingredients'],
            ['finished','仅成品','Finished goods only'], ['none','不扣库存（全部从零制作）','No inventory (produce everything)']]) {
            const option = el('option', '', t(cn, en)); option.value = value; mode.append(option);
        }
        mode.value = settings.inventoryMode || 'all';
        mode.addEventListener('change', () => { settings.inventoryMode = mode.value; save(); });
        label.append(mode); root.append(label);
        root.append(el('p', 'small text-warning', inventory
            ? t('库存快照采集于：', 'Inventory captured: ') + new Date(inventory.capturedAt).toLocaleString()
                + t('。非实时库存，各角色独立；整个计划只扣一次。', '. Not live; separate per character, deducted once across the whole plan.')
            : t('尚无有效库存：目前按全部需求估计准备时间，不代表库存为零。请读取库存或更新主电脑插件。', 'No valid inventory: preparation currently uses full demand, not an assumption of zero stock. Read inventory or update the simulator userscript.')));
    }
    for (const [key, cn, en] of [['gatheringPercent', '社区采集数量（%）', 'Community gathering (%)'],
        ['efficiencyPercent', '社区生产效率（%）', 'Community production efficiency (%)']]) {
        const label = el('label', 'col-sm-6 small', t(cn, en));
        const input = el('input', 'form-control form-control-sm');
        input.type = 'number'; input.min = '0'; input.max = '100'; input.step = '0.1';
        input.setAttribute('aria-label', t(cn, en));
        input.value = settings[key] ?? DEFAULT_PRODUCTION_SETTINGS[key];
        input.addEventListener('input', () => {
            if (!input.checkValidity() || input.value === '') return;
            settings[key] = Number(input.value); save();
        });
        label.append(input); settingsGrid.append(label);
    }
    details.append(settingsGrid);
    const teaLabel = el('label', 'd-block small mb-2');
    const teaCheck = el('input', 'form-check-input me-2'); teaCheck.type = 'checkbox';
    teaCheck.checked = settings.includeTeaSupply === true;
    teaLabel.append(teaCheck, document.createTextNode(t('计入专业饮料补给耗时（关闭则假设已提前备好）', 'Include professional tea supply (off: assumes tea is already prepared)')));
    teaCheck.addEventListener('change', () => { settings.includeTeaSupply = teaCheck.checked; save(); }); details.append(teaLabel);
    const initial = calculateProductionPreparation({ snapshot, settings, consumables, inventory, ...data });
    for (const action of ['milking', 'foraging', 'woodcutting', 'cooking', 'brewing', ...initial.usedActions.map(a => a.split('/').pop())].filter((x, i, all) => all.indexOf(x) === i)) {
        const hrid = `/action_types/${action}`, setup = initial.setups[hrid];
        if (!setup) continue;
        const label = el('label', 'd-block small mb-2', zh ? names[action] : action);
        const select = el('select', 'form-select form-select-sm');
        select.setAttribute('aria-label', t('专业配装：', 'Profession loadout: ') + (zh ? names[action] : action));
        const auto = el('option', '', t('自动（专业默认 → 全部行动）', 'Auto (profession default → all actions)')); auto.value = ''; select.append(auto);
        for (const loadout of setup.candidates) {
            const option = el('option', '', loadout.loadoutName); option.value = loadout.loadoutId; select.append(option);
        }
        select.value = settings.choices?.[hrid] ?? snapshot.productionChoices?.[hrid] ?? '';
        select.addEventListener('change', () => { settings.choices ||= {}; settings.choices[hrid] = select.value; });
        label.append(select); details.append(label);
        const drinkRow = el('div', 'row g-1 mb-2');
        const currentDrinks = settings.drinks?.[hrid] || (setup.selected?.actionTypeHrid === hrid && setup.selected.drinks !== null
            ? setup.selected?.drinks : snapshot.drinks?.[hrid]) || [];
        const drinkSelects = [];
        for (let slot = 0; slot < Math.max(3, currentDrinks.length); slot++) {
            const column = el('div', 'col'); const drinkSelect = el('select', 'form-select form-select-sm');
            drinkSelect.setAttribute('aria-label', t('专业饮料：', 'Profession drink: ') + action + ` ${slot + 1}`);
            const none = el('option', '', t('无饮料', 'No drink')); none.value = ''; drinkSelect.append(none);
            for (const [item, detail] of Object.entries(data.itemDetailMap)) if (detail.consumableDetail?.usableInActionTypeMap?.[hrid]) {
                const option = el('option', '', itemName(item)); option.value = item; drinkSelect.append(option);
            }
            drinkSelect.value = currentDrinks[slot]?.itemHrid || '';
            drinkSelect.addEventListener('change', () => {
                settings.drinks ||= {}; settings.drinks[hrid] = drinkSelects.map(control => ({ itemHrid: control.value })); save();
            });
            drinkSelects.push(drinkSelect); column.append(drinkSelect); drinkRow.append(column);
        }
        details.append(drinkRow);
        select.addEventListener('change', () => {
            delete settings.drinks?.[hrid];
            const updated = calculateProductionPreparation({ snapshot, settings, consumables, inventory, ...data }).setups[hrid];
            const newDrinks = updated.selected?.actionTypeHrid === hrid && updated.selected.drinks !== null
                ? updated.selected?.drinks : snapshot.drinks?.[hrid];
            drinkSelects.forEach((control, i) => { control.value = newDrinks?.[i]?.itemHrid || ''; }); save();
        });
    }
    root.append(output, details);
    root.append(el('p', 'small text-secondary mt-2 mb-0', t(
        '按期望连续生产计时，专业饮料补给可选；房屋、成就、公会神龛和哞卡使用快照。社区增益为固定百分比；不计个人卷轴、迷宫升级和换装操作时间。各材料独立采集，不抵扣副产物；加工茶按连续期望扣减原料产出。',
        'Continuous expectations; optional tea supply. Permanent bonuses use the snapshot; community percentages are fixed. Excludes scrolls, labyrinth upgrades and switching time. Independent gathering, no coproduct credit; processing reduces raw output in expectation.') + (context === 'result'
        ? t('主界面碎片成本不扣一次性库存。设置按角色保存在本机；不修改历史或已有计划。', 'Main-page steady-state rates do not deduct one-time inventory. Settings are saved per character, without changing history or existing plans.')
        : t('设置仅修改本计划，不改历史。', 'Settings affect this plan only, never history.'))));
    function render() {
        const result = calculateProductionPreparation({ snapshot, settings, consumables, inventory, ...data });
        const duration = minutes => minutes === null || !Number.isFinite(minutes) ? '—'
            : context === 'result' ? `${minutes.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t('分钟', 'min')}`
                : `${(minutes / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })} h`;
        const grid = el('div', 'row g-2');
        for (const [label, value] of [
            [t('战斗耗时', 'Combat'), combatHours * 60], [t('采集原料', 'Gathering'), result.minutes.gathering],
            [t('制作食物', 'Cooking'), result.minutes.cooking], [t('制作饮料', 'Brewing'), result.minutes.brewing],
            [t('其他加工', 'Other production'), result.minutes.other], [t('总准备时间', 'Total preparation'), result.totalMinutes],
        ]) { const cell = el('div', 'col-6 col-lg-4'); cell.append(el('div', 'small text-secondary', label), el('strong', '', duration(value))); grid.append(cell); }
        output.replaceChildren(grid);
        if (settings.includeTeaSupply !== true) output.append(el('p', 'small text-warning mt-2 mb-0', t('当前假设：专业饮料提前备好，未计补给时间。', 'Assumption: professional tea is already prepared; its supply time is excluded.')));
        if (Object.keys(result.preparedMaterials).length) output.append(el('p', 'small text-warning mt-2 mb-0',
            t('以下材料视为提前备好，未计获取耗时（不代表库存充足）：', 'Assumed already prepared; acquisition time excluded (inventory not checked): ')
            + Object.entries(result.preparedMaterials).map(([hrid, qty]) => `${itemName(hrid)} × ${qty.toLocaleString(undefined, { maximumSignificantDigits: 4 })}`).join('、')));
        if (inventory && context === 'plan' && settings.inventoryMode !== 'none') {
            const balanceDetails = el('details', 'mt-2');
            balanceDetails.append(el('summary', '', t('原材料 / 中间产物抵扣明细', 'Ingredient / intermediate inventory details')));
            const scroll = el('div', 'table-responsive'); const table = el('table', 'table table-sm small');
            const header = el('tr');
            for (const label of [t('物品', 'Item'), t('需求', 'Required'), t('使用库存', 'Stock used'), t('剩余需求', 'Remaining')]) header.append(el('th', '', label));
            const head = el('thead'); head.append(header); table.append(head);
            const body = el('tbody');
            for (const [hrid, balance] of Object.entries(result.materialBalance)) {
                if (Object.hasOwn(consumables, hrid) || !(balance.required > 1e-10)) continue;
                const row = el('tr'); row.append(el('td', '', itemName(hrid)));
                for (const qty of [balance.required, balance.used, balance.remaining]) row.append(el('td', '', qty.toLocaleString(undefined, { maximumFractionDigits: 2 })));
                body.append(row);
            }
            table.append(body); scroll.append(table); balanceDetails.append(scroll); output.append(balanceDetails);
        }
        const description = result.usedActions.map(hrid => {
            const setup = result.setups[hrid];
            const action = hrid.split('/').pop();
            return `${zh ? names[action] : action}: ${setup.selected?.loadoutName || '—'} / Lv.${setup.baseLevel ?? '?'} / ${t('饮料', 'drinks')}: ${(setup.drinks || []).map(d => itemName(d.itemHrid)).join(', ') || '—'}`;
        });
        output.append(el('p', 'small text-secondary mt-2 mb-0', description.join(' · ')));
        if (!result.complete) {
            const warning = el('div', 'alert alert-warning small mt-2 mb-0', t('资料或生产链不完整：仅展示已知部分耗时，总准备时间暂不提供。', 'Incomplete data or supply chain: only known partial times are shown; total is unavailable.'));
            const list = el('ul', 'mb-0');
            const issueNames = { 'missing-profile': ['缺少专业资料', 'Missing production profile'], 'incomplete-profile': ['人物资料不完整', 'Incomplete character profile'],
                'choose-loadout': ['请选择专业配装', 'Choose a loadout'], 'missing-loadout': ['缺少专业配装', 'No profession loadout'],
                'missing-skill': ['缺少专业等级', 'Missing skill'], 'missing-drinks': ['未采集专业饮料槽', 'Missing drinks'],
                'missing-buffs': ['缺少常驻增益', 'Missing permanent buffs'], 'unknown-equipment': ['装备数据未知', 'Unknown equipment'],
                'unavailable-equipment': ['配装装备不在已采集物品中', 'Loadout item unavailable'], 'invalid-drink': ['饮料不适用', 'Invalid drink'],
                'duplicate-drink': ['同一专业不能重复选择相同饮料', 'Duplicate profession drink'],
                'unknown-duration': ['饮料持续时间未知', 'Unknown drink duration'], 'missing-source': ['无可计算来源', 'No production source'],
                'level-too-low': ['专业等级不足', 'Insufficient skill level'], 'invalid-output': ['该配置无法产出所需原料', 'This setup cannot produce the required material'],
                'nonconvergent-supply': ['饮料补给循环无法收敛', 'Supply cycle does not converge'] };
            for (const issue of result.issues) { const [key, ...rest] = issue.split(':'); const value = rest.join(':'); list.append(el('li', '', (issueNames[key]?.[zh ? 0 : 1] || key) + (value ? `: ${itemName(value)}` : ''))); }
            warning.append(list); output.append(warning);
        }
        onResult?.(result);
    }
    render();
    return root;
}
