# Rust/WASM P2.2 战斗事件与效果结果

日期：2026-10-01。P2.2 已完成固定遭遇的战斗事件迁移；整个 P2 尚未完成。正式模拟器仍使用原 JS，本步没有生产构建、推送或部署。

## 实现范围

P1 队列现在泛型承载真实战斗事件，保持 heap-js 的同时间堆顺序和删除行为。`EncounterRun` 持有属性、独立对象身份、连续 RNG、事件队列和运行状态；`advance` 按事件数分段推进，同一运行不重新开战或重新播种。

| 模块 | 内容 |
| --- | --- |
| `actions.rs` / `runtime_unit.rs` | 技能、消耗品、触发器、释放/冷却/耗蓝、控制状态、初始怪物冷却 RNG、玩家与怪物重置 |
| `combat_math.rs` / `js_pow.rs` | 五种战斗风格、四种伤害、命中/暴击/抗性/穿透、技能伤害、反伤/反击、吸血/吸蓝/治疗、随机整数与逐跳分配 |
| `encounter.rs` | 普攻，buff/damage/heal/spend_hp/revive/promote 六种效果，DOT/HOT/回复，控制到期，curse/weaken/fury/enrage，parry/mayhem/pierce/blaze/bloom/ripple |
| 身份与清理 | 复活保留对象 ID，晋升分配新 ID 并保留旧引用；持续伤害来源采用单独 `sourceRef`，来源死亡后继续生效 |
| 开发入口 | CLI `math` / `encounters`，WASM `math_trace` / `encounter_trace` / `create_encounter`，真实 Worker 分段任务与活句柄计数 |

本步运行固定的一次遭遇，结束、团灭或达到事件/时间上限后停止。死亡与经验等以原始统计操作序列对齐，尚未实现完整 SimResult 汇总、地图抽怪/换波、地下城/迷宫进度、团灭日志和 HP/MP 时序。

诊断用 `setup` / `scheduled` 可安排 HP/MP、已知属性、控制和到期事件，仅用于人工边界测试。未知 combatStats 字段、控制字段和无效身份拒绝；执行中出错后该运行不可继续，需释放并重新创建。无效 chunk 不改变状态。批量上限为 1,000 案例、合计 100,000 个事件；分段上限为 10,000 事件。运行共享持有定义，即使原引擎释放也可完成，随后显式释放运行。

## 冻结参考与精确对照

参考仍为 P0 的 `.bench/js-reference-2783b09-p0.sources`，逐份核对源码/数据 SHA256，并检查 Webpack 模块列表，禁止混入当前 src。参考执行冻结的实际 CombatSimulator、技能、触发器、CombatUtilities 和队列；仅使用固定遭遇提供器、诊断设置及原始统计操作记录。没有用 Rust 输出生成预期值，P0 原固定结果未覆盖。

参考生成固定使用 Node 18.16.1 / V8 10.2.154.26-node.26；其他运行时在编译前拒绝，以免原生数学库升级改变基准。人工队伍和公开定义是全部输入，没有读取私有角色快照。

| 组 | 案例 | 事件快照 | 范围 |
| --- | ---: | ---: | --- |
| natural | 177 | 5,106 | 87 种怪物各两个种子，五人组合遭遇三个种子 |
| skills | 114 | 2,280 | 57 种公开技能各等级 1/20，复活和晋升身份 |
| mechanics | 55 | 2,808 | 装备机制、五种风格与正/零/负抗性、元素反伤、控制同时间边界、复活、DOT 来源死亡、怒气/虚弱到期和回蓝等待 |
| triggers | 840 | 2,520 | 54 种条件、四依赖与四比较器的有效组合，增益对象/缺失值和控制条件 |
| 合计 | 1,186 | 12,714 | 本机 Rust release、Node 实际 WASM、Edge 真实 Worker 均精确一致 |

每个快照比较当前事件、所有对象 HP/MP/属性/增益/控制/冷却/耗蓝记录、对象 ID、完整待执行堆、原始统计操作及 RNG 调用数。数组顺序和缺失字段必须相同，无浮点容差；失败输出案例名和第一个不同的标量路径。

最低覆盖审计要求实际执行 17 种事件（`enemyRespawn` 换遭遇留给 P2.3），以及招架、物理/元素反伤、反击、blaze、bloom、ripple、复活、耗血、法力不足、死亡、晋升新身份、来源死亡后的 DOT。该要求检查执行快照，不能仅以“配了技能”充当覆盖。

数学专项另含 65 案例：20,012 个 `pow(x, 1.4)` 输入，40 个区间/种子组合共 5,120 次随机整数，以及 24 种回复逐跳分配。Rust 与实际 WASM 均精确对齐。测试发现通用 libm pow 最后校正与冻结 V8 的运算顺序不同，因此采用冻结 V8 的 1.4 指数专用实现；锁定 libm 0.2.8 仅提供 `scalbn`。第三方许可已加入源码和原型资源。来源：[V8 10.2 数学实现](https://github.com/v8/v8/blob/10.2.154.26/src/base/ieee754.cc)、[libm 0.2.8](https://github.com/rust-lang/libm/tree/libm-v0.2.8)。

保留冻结 JS 的细节：零概率路径的随机调用；过期时间恰等于当前时间时控制条件仍可有效；触发条件循环不因一次失败提前结束；enrage 增益可无 startTime；晋升只替换局部 source 而不改旧 enemies 列表。迁移不顺便修正这些行为。

## 浏览器验证与运行时差异

Playwright 启动独立 Edge 154.0.4258.37 进程和临时上下文，只访问本机原型。没有控制用户登录的游戏浏览器或修改其配置。

| 路径 | 结果 |
| --- | --- |
| `/`、`/MWICombatSimulatorTest/dist/` | P1 各 12/12 |
| `/attributes.html`、`/MWICombatSimulatorTest/dist/attributes.html` | P2.1 各 7/7，3,473 案例 / 7,459 快照 |
| `/encounters.html`、`/MWICombatSimulatorTest/dist/encounters.html` | P2.2 各 11/11，全部事件/数学案例、分段、BUSY 拒绝、执行错误恢复、运行中取消/重建、复用/释放 |

三个报告验证脚本核对参考与服务资源字节、当前构建指纹、报告新鲜度、根/Pages 资源路径和生命周期。任务后 liveEncounters/liveProbes 为零，释放后 liveEngines 为零；每个复用 Worker 的模块、定义和引擎各初始化一次。

**额外审计发现当前 Edge 原生 `Math.pow` 与冻结 Node/V8 参考不同：20,012 个输入中 2,037 个出现末位差异。** 例如 `x=2.2857142857142856`，冻结参考为 `3.18149115152125`，Edge 为 `3.1814911515212496`。保存于 `.bench/rust-wasm-p2-events/browser-pow-audit.json`，可用 `audit-browser-pow.cjs` 复现。WASM 在浏览器中对齐的是冻结参考；本报告不等于证明当前浏览器 JS 完整战斗与 WASM 一致，也未证明这些末位差异会改变战斗结果。

P2.3 必须增加当前浏览器实际 JS 与 WASM 的连续战斗比较，定位这些数学差异是否影响分支、随机调用和结果；如影响，先实施并验证明确的数学兼容方案。不得改参考值、扩大浮点容差或通过发布规避差异。跨浏览器数值兼容仍是 P3/P5 的必过项。

## 其他验证和产物

| 验证 | 结果 |
| --- | --- |
| 原业务/战斗/对照工具 | 97 + 11 + 10 项通过 |
| 当前 JS 对 P0 冻结 JS | 九场景完整结果、RNG 次数和事件计数通过 |
| Rust | 9 项单元测试、fmt、Clippy 通过 |
| Node 实际 WASM | P1 7 项、P2.1 11 项、P2.2 14 项子测试通过 |
| 独立原型构建与浏览器报告 | 六页及三个报告验证脚本通过 |
| 参考运行时门禁 | Node 18 可生成；Node 24 在编译前拒绝 |

WASM 为 823,812 字节，SHA256 `6d34f287c7b72a29c22854a0bc1de9f4d752a532d0bb862191b285955b5e3339`。原 JS 引擎 SHA256 仍为 `c02aa7ba0d14cd16da73c65baf91c681be3a8a7800958b722437fb25610d8c0a`；数据指纹仍为 `dd2169d14584689aa7d0880bd220edb41e71a9a27430731e8db0a8d8b0bddd37`。

事件快照测试后 WASM 线性内存为 107,216,896 字节，释放后不自动缩小。大量完整诊断快照与序列化占用内存；这不是正常完整战斗的峰值或性能结果。本步未做 Rust 72h 模拟或提速结论。

## 复现和下一部分

在正式模拟器仓库执行，用系统 Node 18 生成冻结参考：

```powershell
npm run build:wasm-prototype
npm run test:encounters
npm run test:attributes
npm run test:wasm
npm run test:rust
```

本机已有 Playwright 使用 Node 24 运行独立浏览器测试，不升级系统 Node：

```powershell
$env:MWI_PLAYWRIGHT_PATH = 'C:/Users/12597/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
& 'C:/Users/12597/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' scripts/test-wasm-browser.cjs
& 'C:/Users/12597/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' scripts/audit-browser-pow.cjs
npm run test:wasm-browser-reports
npm run test:attributes-browser-reports
npm run test:encounters-browser-reports
```

浏览器报告在 `.bench/rust-wasm-p2-events/`；参考及原型中间产物在 `.wasm-build/`，都不进入公共发布。每次重建原型需重跑六页报告。下一部分 P2.3 接连续地图/地下城、完整统计、当前浏览器 JS 对照和端到端性能初测；通过后才标记整个 P2 完成。私有插件、同步服务器与 FRP 均无变更。
