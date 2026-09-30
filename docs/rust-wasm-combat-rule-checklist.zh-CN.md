# Rust/WASM 战斗规则迁移检查表

依据：2026-09-30 的 JS 引擎 `2783b09`。P0 建立清单，P2/P3 按本表补全迁移及针对性对照。事件计数只能证明该类型出现过，不能证明其内部所有分支通过；未迁移前不能勾选为 Rust 已完成。

## 事件处理

| 事件类型 | JS 位置 | P0 九场景观察 | Rust 验收 |
| --- | --- | --- | --- |
| combatStart | combatSimulator.processCombatStartEvent | 已出现 | 首次永久增益、后续重置、迷宫重置与初始 RNG |
| playerRespawn | processPlayerRespawnEvent | 待针对性补充 | 身份、HP/MP、增益/控制清理、攻击恢复 |
| enemyRespawn | processEnemyRespawnEvent | 已出现 | 新遭遇、Boss、换波与目标身份 |
| autoAttack | processAutoAttackEvent | 已出现 | 目标选择、招架、mayhem、pierce、死亡顺序 |
| consumableTick | processConsumableTickEvent | 已出现 | 逐跳取整、最后一跳与死亡后事件 |
| damageOverTime | processDamageOverTimeTickEvent | 已出现 | 来源/目标、逐跳分配、死亡和清理 |
| checkBuffExpiration | processCheckBuffExpirationEvent | 已出现 | 过期边界、有序移除及属性重算 |
| regenTick | processRegenTickEvent | 已出现 | HP/MP 取整、死亡角色与全队遍历 |
| stunExpiration | processStunExpirationEvent | 已出现 | 相同时间触发条件与恢复攻击 |
| blindExpiration | processBlindExpirationEvent | 已出现 | 相同时间条件与目标选择 |
| silenceExpiration | processSilenceExpirationEvent | 已出现 | 技能/普攻恢复顺序 |
| curseExpiration | processCurseExpirationEvent | 已出现 | 层数、属性和边界 |
| weakenExpiration | processWeakenExpirationEvent | 待针对性补充 | 减益与命中属性恢复 |
| furyExpiration | processFuryExpirationEvent | 待针对性补充 | 增益、层数和属性恢复 |
| enrageTick | processEnrageTickEvent | 已出现 | 时间换算、层数上限和更新 |
| abilityCastEndEvent | tryUseAbility | 已出现 | 释放结束、耗蓝失败、控制及死亡 |
| awaitCooldownEvent | addNextAttackEvent | 已出现 | 等待结束与技能/普攻交错 |
| cooldownReady | checkTriggers | 已出现 | 仅检查触发器，不增添攻击效果 |

## 战斗计算与效果

每项都需要包括边界值和第一次不同事件的定位能力；完整结果对齐仍是共同验收要求。

- [ ] `combatUtilities.randomInt` 的两个尾数、整数区间、相邻区间与每条分支的 RNG 次数。
- [ ] stab/slash/smash/ranged/magic 五种战斗风格；physical/water/nature/fire 四种伤害。
- [ ] 命中、暴击、弱化、基础伤害、技能比例/固定值、装备/任务/承伤倍率、取整和 HP 上限。
- [ ] 正/零/负抗性、穿透、护甲伤害、物理/元素反伤、反击；伤害为零时的 RNG 顺序。
- [ ] 吸血、HP drain、吸蓝、治疗增幅、单体/全体/最低血量治疗与复活。
- [ ] buff/damage/heal/spend_hp/revive/promote 六种技能效果及执行顺序。
- [ ] self/enemy/allEnemies/allAllies/lowestHpAlly/deadAlly 等实际目标选择路径，死亡/复活后身份。
- [ ] 技能初始随机冷却、释放时间、冷却、蓝量不足、攻击等待、触发器短路检查。
- [ ] 控制概率和韧性、控制过期同时间事件、被控制时攻击与技能行为。
- [ ] parry/mayhem/pierce/curse/weaken/fury/blaze/bloom/ripple 及派生技能；零概率路径也保留原 RNG 调用。
- [ ] 晋升的替代对象、随机选型、怪物技能与统计身份，不以 HRID 等同对象身份。

## 属性与触发器

- [ ] 装备/强化、缓存失效、基础等级、等级差惩罚、房屋、成就、公会神龛和非内置公会增益。
- [ ] 地图/迷宫箱子、通行证、社区与印章增益；叠加次序和可选字段回退。
- [ ] 初始永久增益、临时增益、过期移除与属性重新计算；浮点累加顺序。
- [ ] self、targeted_enemy、all_allies、all_enemies 四种触发依赖。
- [ ] 活跃/死亡数量、最低血量比例、当前/缺失 HP/MP、各增益状态与控制状态条件。
- [ ] greater_than_equal、less_than_equal、is_active、is_inactive 四种比较器及相等边界。
- [ ] JS 的 Number/default/undefined/null、负半数 round 与数学函数 `pow(..., 1.4)`。

## 场景、队列与统计

- [ ] 四地下城各有效难度、固定/随机波、Boss、完成/失败、最后波与时间统计。
- [ ] 普通地图怪物加权抽取、最大强度终止、每 10 场 Boss、复活与全队团灭。
- [ ] 迷宫怪物等级、技能缩放、箱子叠加、尝试计数与严格大于 120 秒超时。
- [x] P1 独立队列：堆插入/弹出/删除、匹配查询、同时间事件、按身份清理，逐操作顺序对齐；真实战斗对象代次和事件处理仍待 P2/P3。
- [ ] f64 时间、超过模拟上限的最后事件、固定种子跨段连续推进。
- [x] P1 独立 RNG：JS Number 累积状态、ToUint32 和 Math.imul，四种子各 600 万次，覆盖种子 1 第 4,917,760 次分歧边界；本地、实际 WASM、浏览器 Worker 均通过。整场战斗的调用顺序仍待 P2/P3。
- [ ] 完整统计、存活时间、法力不足、掉落基础倍率、地下城/迷宫字段与旧拼写。
- [ ] 200 条团灭环形日志、日志顺序与内容；仅现实时间戳可忽略。
- [ ] HP/MP 每 1000 事件采样、进度节流与最终 100%。

P0 已观察 18 种分派事件中的 15 种；其余三种和上面的内部边界留待迁移阶段补针对性案例。P0 的单人团灭、HP/MP、迷宫重复尝试及成功通关场景均设置最低覆盖要求，避免案例虽然“相等”但没有走到要验证的过程。

P1 的队列/RNG/round/余数原型与根路径、Pages 子路径 Worker 验收已通过。round 覆盖负半数、负零、大整数和非有限数；完整数值转换、pow 与战斗属性仍未通过，属性与事件处理清单保持未勾选。见 [P1 结果](./rust-wasm-combat-p1-results.zh-CN.md)。
