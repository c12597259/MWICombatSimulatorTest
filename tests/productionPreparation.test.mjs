import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/productionPreparation.js', import.meta.url), 'utf8');
const { buildProductionProfile, resolveProductionLoadout, calculateProductionPreparation } =
    await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const action = name => `/action_types/${name}`;
function profile() {
    return { schemaVersion: 1, complete: true, characterId: 'test', capturedAt: '2026-09-24T00:00:00Z',
        skills: ['cooking','brewing','foraging'].map(s => ({skillHrid:`/skills/${s}`,level:100})),
        equipment: [{itemLocationHrid:'/item_locations/cooking_tool',itemHrid:'/items/tool',enhancementLevel:2}],
        loadouts: [{loadoutId:'all',loadoutName:'All',actionTypeHrid:'',isDefault:true,equipment:[],drinks:null}],
        drinks: Object.fromEntries(['cooking','brewing','foraging'].map(s => [action(s),[]])),
        permanentBuffs: {house:{},guild:{},achievement:{},mooPass:{}},
    };
}
const settings={gatheringPercent:0,efficiencyPercent:0};
function data(){
    const recipe=(name,type,inputs=[])=>({hrid:`/actions/${type}/${name}`,type:action(type),name,baseTimeCost:10e9,
        levelRequirement:{skillHrid:`/skills/${type}`,level:100},inputItems:inputs,outputItems:[{itemHrid:`/items/${name}`,count:1}]});
    return {enhancementMultipliers:[0,1,2.1],itemDetailMap:{
        '/items/tool':{equipmentDetail:{noncombatStats:{cookingSpeed:.5},noncombatEnhancementBonuses:{cookingSpeed:.1}}},
        '/items/hat':{equipmentDetail:{noncombatStats:{cookingEfficiency:.1},noncombatEnhancementBonuses:{cookingEfficiency:.02}}},
        '/items/pouch':{equipmentDetail:{noncombatStats:{drinkConcentration:.1},noncombatEnhancementBonuses:{drinkConcentration:.01}}},
        '/items/tea':{consumableDetail:{usableInActionTypeMap:{[action('cooking')]:true,[action('brewing')]:true},buffs:[{typeHrid:'/buff_types/efficiency',flatBoost:.1,duration:300e9}]}},
    },actionDetailMap:{food:recipe('food','cooking',[{itemHrid:'/items/berry',count:2}]),
        tea:recipe('tea','brewing'),berry:{...recipe('berry','foraging'),outputItems:[],dropTable:[{itemHrid:'/items/berry',dropRate:1,minCount:1,maxCount:1}]}}};
}
test('dedicated loadout and intentional empty drinks override all-actions; tools remain when unspecified',()=>{
    const p=profile();p.drinks[action('cooking')]=[{itemHrid:'/items/tea'}];
    p.loadouts.push({loadoutId:'cook',loadoutName:'Cooking',actionTypeHrid:action('cooking'),equipment:[],drinks:[]});
    const s=resolveProductionLoadout(p,action('cooking'));
    assert.equal(s.selected.loadoutId,'cook');assert.equal(s.drinks.length,0);assert.equal(s.equipment.length,1);
    p.loadouts.push({...p.loadouts[1],loadoutId:'cook2'});
    assert.equal(resolveProductionLoadout(p,action('cooking')).status,'choose-loadout');
    assert.equal(resolveProductionLoadout(p,action('cooking'),{[action('cooking')]:'all'}).drinks.length,1);
    assert.equal(resolveProductionLoadout(p,action('cooking'),{[action('cooking')]:'deleted'}).status,'choose-loadout');
});
test('equipment uses per-stat enhancement bonuses and only the matching tool; no captured combat outfit bonuses',()=>{
    const p=profile();p.loadouts[0].equipment=[{itemLocationHrid:'/item_locations/head',itemHrid:'/items/hat',enhancementLevel:2}];
    p.permanentBuffs.equipment={[action('cooking')]:[{typeHrid:'/buff_types/efficiency',flatBoost:999}]};
    p.labyrinth={efficiency:999};p.personalBuffs={efficiency:999};
    p.permanentBuffs.house={[action('cooking')]:[{typeHrid:'/buff_types/efficiency',flatBoost:.03}]};
    p.permanentBuffs.guild={[action('cooking')]:[{typeHrid:'/buff_types/efficiency',flatBoost:.02}]};
    const s=buildProductionProfile(p,settings,data()).setups;
    assert.ok(Math.abs(s[action('cooking')].speed-.71)<1e-10);
    assert.ok(Math.abs(s[action('cooking')].efficiency-.192)<1e-10);
    assert.equal(s[action('brewing')].speed,0);
});
test('all-action drinks are concentration-scaled, including the tea supply frequency',()=>{
    const p=profile();p.loadouts[0].equipment=[{itemLocationHrid:'/item_locations/pouch',itemHrid:'/items/pouch',enhancementLevel:2}];
    p.drinks[action('cooking')]=[{itemHrid:'/items/tea'}];
    const s=buildProductionProfile(p,settings,data()).setups[action('cooking')];
    assert.ok(Math.abs(s.efficiency-.1121)<1e-10);assert.ok(Math.abs(s.drinks[0].perHour-13.452)<1e-10);
});
test('splits gathering and cooking, with zero inventory deduction and detached inputs',()=>{
    const p=profile();const before=JSON.stringify(p);
    const r=calculateProductionPreparation({snapshot:p,settings,consumables:{'/items/food':100},...data()});
    assert.equal(r.complete,true);assert.ok(Math.abs(r.minutes.gathering-2000/60)<1e-8);
    assert.ok(Math.abs(r.minutes.cooking-1000/60/1.71)<1e-8);assert.equal(JSON.stringify(p),before);
});
test('solves self-supply tea cycles rather than skipping tea used while making tea',()=>{
    const p=profile();p.equipment=[];p.drinks[action('brewing')]=[{itemHrid:'/items/tea'}];
    const r=calculateProductionPreparation({snapshot:p,settings:{...settings,includeTeaSupply:true},consumables:{'/items/tea':100},...data()});
    const unitMinutes=10/60/1.1;
    assert.equal(r.complete,true);assert.ok(Math.abs(r.totalMinutes-100*unitMinutes/(1-unitMinutes/5))<1e-6);
});

test('professional tea is supplied in advance by default, but its bonus still applies',()=>{
    const p=profile();p.drinks[action('cooking')]=[{itemHrid:'/items/tea'}];
    const d=data();delete d.actionDetailMap.tea;
    const r=calculateProductionPreparation({snapshot:p,settings,consumables:{'/items/food':100},...d});
    assert.equal(r.complete,true);assert.equal(r.minutes.brewing,0);
    assert.ok(Math.abs(r.minutes.cooking-1000/60/1.71/1.1)<1e-8);
    const supply=calculateProductionPreparation({snapshot:p,settings:{...settings,includeTeaSupply:true},consumables:{'/items/food':100},...d});
    assert.equal(supply.totalMinutes,null);assert.ok(supply.issues.includes('missing-source:/items/tea'));
    p.drinks[action('cooking')].push({itemHrid:'/items/tea'});
    const duplicate=calculateProductionPreparation({snapshot:p,settings,consumables:{'/items/food':100},...d});
    assert.equal(duplicate.totalMinutes,null);assert.ok(duplicate.issues.includes('duplicate-drink:/items/tea'));
});
test('missing/ambiguous profiles, insufficient levels and external ingredients do not silently become zero time',()=>{
    for(const change of [p=>{p.complete=false},p=>{p.drinks={}},p=>{p.skills=[]},p=>{p.loadouts=[]}]){
        const p=profile();change(p);const r=calculateProductionPreparation({snapshot:p,settings,consumables:{'/items/food':1},...data()});
        assert.equal(r.totalMinutes,null);assert.ok(r.issues.length);
    }
    const r=calculateProductionPreparation({snapshot:profile(),settings,consumables:{'/items/unknown':1},...data()});
    assert.equal(r.totalMinutes,null);assert.equal(r.externalMaterials['/items/unknown'],1);
});
test('fixed community values change estimates without personal or labyrinth buffs',()=>{
    const p=profile();const a=calculateProductionPreparation({snapshot:p,settings,consumables:{'/items/food':1},...data()});
    const b=calculateProductionPreparation({snapshot:p,settings:{gatheringPercent:50,efficiencyPercent:20},consumables:{'/items/food':1},...data()});
    assert.ok(b.minutes.gathering<a.minutes.gathering);assert.ok(b.minutes.cooking<a.minutes.cooking);
});

test('raw gems are prepared in advance, but crushing and brewing are still counted',()=>{
    const p=profile(),d=data();p.equipment=[];
    d.actionDetailMap.tea.inputItems=[{itemHrid:'/items/crushed_sunstone',count:2}];
    d.actionDetailMap.crush={hrid:'/actions/brewing/crush',type:action('brewing'),baseTimeCost:10e9,
        levelRequirement:{level:100},inputItems:[{itemHrid:'/items/sunstone',count:1}],
        outputItems:[{itemHrid:'/items/crushed_sunstone',count:10}]};
    const r=calculateProductionPreparation({snapshot:p,settings,consumables:{'/items/tea':100},...d});
    assert.equal(r.complete,true);assert.equal(r.preparedMaterials['/items/sunstone'],20);
    assert.ok(Math.abs(r.minutes.brewing-120*10/60)<1e-8);
    d.actionDetailMap.crush.inputItems=[{itemHrid:'/items/unknown',count:1}];
    const unknown=calculateProductionPreparation({snapshot:p,settings,consumables:{'/items/tea':100},...d});
    assert.equal(unknown.totalMinutes,null);assert.ok(unknown.issues.includes('missing-source:/items/unknown'));
});

test('processing tea reduces usable raw gathering output without crediting coproducts',()=>{
    const p=profile(), d=data();
    d.itemDetailMap['/items/processing_tea']={consumableDetail:{usableInActionTypeMap:{[action('foraging')]:true},
        buffs:[{typeHrid:'/buff_types/processing',flatBoost:.1,duration:300e9}]}};
    d.actionDetailMap.process={hrid:'/actions/crafting/processed',type:action('crafting'),baseTimeCost:10e9,
        inputItems:[{itemHrid:'/items/berry',count:2}],outputItems:[{itemHrid:'/items/processed',count:1}]};
    p.drinks[action('foraging')]=[{itemHrid:'/items/processing_tea'}];
    const r=calculateProductionPreparation({snapshot:p,settings,consumables:{'/items/food':100},...d});
    assert.equal(r.complete,true);assert.ok(Math.abs(r.minutes.gathering-2000/60/.9)<1e-8);
});

test('finished inventory removes only the shortfall and then shares ingredient stock once',()=>{
    const p=profile(), d=data();
    const inventory={complete:true,characterId:'test',items:{'/items/food':20,'/items/berry':100}};
    const before=JSON.stringify(inventory);
    const r=calculateProductionPreparation({snapshot:p,settings,inventory,consumables:{'/items/food':100},...d});
    assert.equal(r.complete,true);
    assert.equal(r.materialBalance['/items/food'].remaining,80);
    assert.equal(r.materialBalance['/items/berry'].required,160);
    assert.equal(r.materialBalance['/items/berry'].remaining,60);
    assert.ok(Math.abs(r.minutes.gathering-600/60)<1e-8);
    assert.ok(Math.abs(r.minutes.cooking-800/60/1.71)<1e-8);
    assert.equal(JSON.stringify(inventory),before);
    const finished=calculateProductionPreparation({snapshot:p,settings:{...settings,inventoryMode:'finished'},inventory,consumables:{'/items/food':100},...d});
    assert.equal(finished.materialBalance['/items/berry'].remaining,160);
    const off=calculateProductionPreparation({snapshot:p,settings:{...settings,inventoryMode:'none'},inventory,consumables:{'/items/food':100},...d});
    assert.equal(off.materialBalance['/items/food'].remaining,100);
    const other=calculateProductionPreparation({snapshot:p,settings,inventory:{...inventory,characterId:'other'},consumables:{'/items/food':100},...d});
    assert.equal(other.totalMinutes,off.totalMinutes);
});

test('shared materials are pooled across multiple recipes, not deducted per recipe',()=>{
    const p=profile(),d=data();d.actionDetailMap.food2={...d.actionDetailMap.food,hrid:'/actions/cooking/food2',outputItems:[{itemHrid:'/items/food2',count:1}]};
    const r=calculateProductionPreparation({snapshot:p,settings,inventory:{complete:true,characterId:'test',items:{'/items/berry':100}},
        consumables:{'/items/food':40,'/items/food2':40},...d});
    assert.equal(r.materialBalance['/items/berry'].required,160);assert.equal(r.materialBalance['/items/berry'].used,100);
    assert.equal(r.materialBalance['/items/berry'].remaining,60);
});

test('stock-covered branches do not require production levels or material sources',()=>{
    const p=profile(),d=data();p.skills=[];p.complete=false;
    const r=calculateProductionPreparation({snapshot:p,settings,inventory:{complete:true,characterId:'test',items:{'/items/food':100}},consumables:{'/items/food':100},...d});
    assert.equal(r.complete,true);assert.equal(r.totalMinutes,0);assert.deepEqual(r.usedActions,[]);
    const missing=calculateProductionPreparation({snapshot:p,settings,inventory:{complete:true,characterId:'test',items:{'/items/food':99}},consumables:{'/items/food':100},...d});
    assert.equal(missing.totalMinutes,null);
    p.complete=true;p.skills=profile().skills;d.actionDetailMap.food.inputItems=[{itemHrid:'/items/unknown',count:1}];
    const covered=calculateProductionPreparation({snapshot:p,settings,inventory:{complete:true,characterId:'test',items:{'/items/unknown':100}},consumables:{'/items/food':100},...d});
    assert.equal(covered.complete,true);assert.ok(covered.totalMinutes>0);
});

test('stock is deducted once in cyclic professional tea supply',()=>{
    const p=profile();p.equipment=[];p.drinks[action('brewing')]=[{itemHrid:'/items/tea'}];
    const r=calculateProductionPreparation({snapshot:p,settings:{...settings,includeTeaSupply:true},inventory:{complete:true,characterId:'test',items:{'/items/tea':50}},consumables:{'/items/tea':100},...data()});
    const unitMinutes=10/60/1.1;
    assert.equal(r.complete,true);assert.ok(Math.abs(r.totalMinutes-50*unitMinutes/(1-unitMinutes/5))<1e-6);
});
