import { abilityEffectsText } from './abilityEffectsText.js';
import spriteUrl from './assets/abilities.svg?asset';

const learnedPreferenceKey = 'mwiAbilityPickerLearnedOnly';
const recommendationPreferenceKey = 'mwiAbilityPickerRecommendedOnly';
export function attachAbilityPicker(select, { getName, getLevels, getLearnedLevels, getRecommendation, getDescription, getDetails, effectLabel, labels }) {
    const wrap = document.createElement('div');
    wrap.className = 'ability-selection';
    select.before(wrap);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ability-picker-button';
    button.setAttribute('aria-haspopup', 'dialog');
    wrap.append(button, select);
    const makeIcon = hrid => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 50 50');
        svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS(svg.namespaceURI, 'use');
        use.setAttribute('href', `${spriteUrl}#${hrid.split('/').pop()}`);
        svg.append(use);
        return svg;
    };
    let dialog;
    const refresh = () => {
        button.disabled = select.disabled;
        button.title = labels().choose;
        button.setAttribute('aria-label', `${labels().choose}: ${getName(select.value)}`);
        button.replaceChildren();
        if (select.value && select.value !== '/abilities/promote') button.append(makeIcon(select.value));
        else button.textContent = '+';
        if (dialog?.open) dialog.close();
    };
    button.addEventListener('click', () => {
        if (select.disabled) return;
        const panel = document.createElement('dialog');
        dialog = panel;
        panel.className = 'ability-picker-dialog';
        panel.setAttribute('aria-label', labels().choose);
        const header = document.createElement('div');
        header.className = 'ability-picker-header';
        const title = document.createElement('strong');
        title.textContent = labels().choose;
        const close = document.createElement('button');
        close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', labels().close);
        close.addEventListener('click', () => panel.close());
        header.append(title, close);
        const search = document.createElement('input');
        search.type = 'search'; search.placeholder = labels().search; search.setAttribute('aria-label', labels().search);
        const filter = document.createElement('label'); filter.className = 'ability-picker-filter';
        const learnedOnly = document.createElement('input'); learnedOnly.type = 'checkbox';
        try { learnedOnly.checked = localStorage.getItem(learnedPreferenceKey) === 'true'; } catch { /* Optional preference. */ }
        filter.append(learnedOnly, document.createTextNode(labels().learned));
        const recommendationFilter = document.createElement('label'); recommendationFilter.className = 'ability-picker-filter';
        const recommendedOnly = document.createElement('input'); recommendedOnly.type = 'checkbox';
        try { recommendedOnly.checked = localStorage.getItem(recommendationPreferenceKey) === 'true'; } catch { /* Optional preference. */ }
        recommendationFilter.append(recommendedOnly, document.createTextNode(labels().recommended));
        recommendationFilter.title = labels().recommendationHint;
        const filters = document.createElement('div'); filters.className = 'ability-picker-filters'; filters.append(filter, recommendationFilter);
        const recommendation = getRecommendation();
        const recommendationNote = document.createElement('p'); recommendationNote.className = 'ability-picker-recommendation';
        recommendationNote.textContent = recommendation.description; recommendationNote.title = labels().recommendationHint;
        const grid = document.createElement('div'); grid.className = 'ability-picker-grid';
        const empty = document.createElement('p'); empty.className = 'ability-picker-empty'; empty.textContent = labels().noMatches; empty.hidden = true;
        const tooltip = document.createElement('div'); tooltip.className = 'ability-picker-tooltip';
        tooltip.id = `ability-tooltip-${select.id}`; tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;
        const positionPanel = () => {
            if (!panel.open) return;
            const margin = 8, gap = 6;
            const anchor = button.getBoundingClientRect();
            // Seven columns, including the empty slot. Fit the complete grid rather
            // than clipping it to the space above the trigger and adding a scrollbar.
            const panelStyle = getComputedStyle(panel);
            const contentWidth = panel.clientWidth - parseFloat(panelStyle.paddingLeft) - parseFloat(panelStyle.paddingRight);
            const rows = Math.ceil([...grid.children].filter(choice => !choice.hidden).length / 7);
            const horizontalSize = Math.min(66, (contentWidth - 6 * 4) / 7);
            panel.style.maxHeight = 'none';
            grid.style.setProperty('--ability-tile-size', `${horizontalSize}px`);
            const controlsHeight = panel.getBoundingClientRect().height - grid.getBoundingClientRect().height;
            const verticalSize = (innerHeight - margin * 2 - controlsHeight - Math.max(0, rows - 1) * 4) / Math.max(1, rows);
            grid.style.setProperty('--ability-tile-size', `${Math.max(1, Math.min(horizontalSize, verticalSize))}px`);
            panel.style.maxHeight = `${innerHeight - margin * 2}px`;
            const preferredHeight = panel.getBoundingClientRect().height;
            const above = Math.max(0, anchor.top - gap - margin);
            const below = Math.max(0, innerHeight - anchor.bottom - gap - margin);
            const opensAbove = above >= preferredHeight || above >= below;
            const rect = panel.getBoundingClientRect();
            panel.style.left = `${Math.max(margin, Math.min(anchor.left, innerWidth - rect.width - margin))}px`;
            const top = opensAbove ? anchor.top - gap - rect.height : anchor.bottom + gap;
            panel.style.top = `${Math.max(margin, Math.min(top, innerHeight - rect.height - margin))}px`;
            panel.dataset.placement = opensAbove ? 'above' : 'below';
        };
        const levels = getLevels(), learned = getLearnedLevels();
        let activeTooltip;
        const hideTooltip = () => { tooltip.hidden = true; activeTooltip = null; };
        const showTooltip = (choice, hrid) => {
            activeTooltip = { choice, hrid };
            tooltip.replaceChildren();
            const name = document.createElement('strong');
            name.textContent = getName(hrid) + (hrid ? ` · Lv.${levels[hrid] ?? 1}` : '');
            tooltip.append(name);
            if (hrid) {
                const description = document.createElement('p'); description.textContent = getDescription(hrid); tooltip.append(description);
                const details = getDetails(hrid);
                if (details) {
                    const stats = document.createElement('dl');
                    for (const [label, value] of [[labels().mana, details.manaCost], [labels().cooldown, `${details.cooldownDuration / 1e9}s`], [labels().cast, `${details.castDuration / 1e9}s`]]) {
                        const term = document.createElement('dt'), amount = document.createElement('dd');
                        term.textContent = label; amount.textContent = value; stats.append(term, amount);
                    }
                    tooltip.append(stats);
                    const effects = document.createElement('div'); effects.className = 'ability-picker-effects';
                    const heading = document.createElement('b'); heading.textContent = labels().effects; effects.append(heading);
                    for (const text of abilityEffectsText(details, levels[hrid] ?? 1, effectLabel)) {
                        const line = document.createElement('div'); line.textContent = text; effects.append(line);
                    }
                    tooltip.append(effects);
                }
            }
            tooltip.hidden = false;
            const rect = choice.getBoundingClientRect();
            const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
            tooltip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
            const below = rect.bottom + 8;
            tooltip.style.top = `${Math.max(8, below + height <= innerHeight - 8 ? below : rect.top - height - 8)}px`;
        };
        for (const option of select.options) {
            const hrid = option.value;
            if (hrid === '/abilities/promote') continue;
            const name = getName(hrid);
            const choice = document.createElement('button');
            choice.type = 'button'; choice.className = 'ability-picker-choice';
            choice.dataset.abilityHrid = hrid;
            choice.dataset.search = name.toLocaleLowerCase();
            choice.setAttribute('aria-label', name);
            choice.setAttribute('aria-describedby', tooltip.id);
            choice.setAttribute('aria-pressed', String(hrid === select.value));
            if (hrid) {
                choice.append(makeIcon(hrid));
                const level = document.createElement('small'); level.textContent = `Lv.${levels[hrid] ?? 1}`; choice.append(level);
            } else choice.textContent = name;
            choice.addEventListener('pointerenter', () => showTooltip(choice, hrid));
            choice.addEventListener('pointerleave', hideTooltip);
            choice.addEventListener('focus', () => showTooltip(choice, hrid));
            choice.addEventListener('blur', hideTooltip);
            choice.addEventListener('click', () => {
                if (!select.disabled && hrid !== select.value) {
                    select.value = hrid;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
                panel.close();
            });
            grid.append(choice);
        }
        const applyFilter = () => {
            const query = search.value.trim().toLocaleLowerCase();
            let visibleSkills = 0;
            for (const choice of grid.children) {
                const hrid = choice.dataset.abilityHrid;
                // Keep the empty slot available so filtering never prevents unequipping.
                choice.hidden = !!hrid && ((!choice.dataset.search.includes(query)) || (learnedOnly.checked && !learned[hrid]) || (recommendedOnly.checked && !recommendation.accepts(hrid)));
                if (hrid && !choice.hidden) visibleSkills++;
            }
            empty.hidden = visibleSkills > 0;
            recommendationNote.hidden = !recommendedOnly.checked;
            hideTooltip();
            positionPanel();
        };
        search.addEventListener('input', applyFilter);
        learnedOnly.addEventListener('change', () => {
            applyFilter();
            try { localStorage.setItem(learnedPreferenceKey, String(learnedOnly.checked)); } catch { /* Optional preference. */ }
        });
        recommendedOnly.addEventListener('change', () => {
            applyFilter();
            try { localStorage.setItem(recommendationPreferenceKey, String(recommendedOnly.checked)); } catch { /* Optional preference. */ }
        });
        const outside = event => {
            const rect = panel.getBoundingClientRect();
            return event.target === panel && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
        };
        let startedOutside = false;
        panel.addEventListener('pointerdown', event => { startedOutside = outside(event); });
        panel.addEventListener('click', event => { if (startedOutside && outside(event)) panel.close(); startedOutside = false; });
        panel.addEventListener('scroll', hideTooltip);
        const onResize = () => { hideTooltip(); positionPanel(); };
        const onPageScroll = event => { if (!panel.contains(event.target)) onResize(); };
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onPageScroll, true);
        grid.addEventListener('scroll', () => {
            if (activeTooltip && activeTooltip.choice.matches(':hover, :focus-visible')) showTooltip(activeTooltip.choice, activeTooltip.hrid);
            else hideTooltip();
        });
        panel.addEventListener('close', () => { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onPageScroll, true); panel.remove(); button.focus({ preventScroll: true }); }, { once: true });
        panel.append(header, search, filters, recommendationNote, grid, empty, tooltip);
        applyFilter(); document.body.append(panel); panel.showModal();
        positionPanel();
    });
    refresh();
    return refresh;
}
