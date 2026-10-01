# Rust / WASM 装备属性缓存结果

日期：2026-10-01。P2 完成后的第一次性能优化，仅缓存玩家装备基础属性，P3 的规则组合与数值边界仍待继续。正式页面继续使用 JS。

## 问题与改动

此前对现有 release WASM 在独立 Edge 154 Worker 中采样，排除 idle 后，属性重算占模拟调用约 67.6%，其中装备属性读取占整个调用约 54.9%。JS 对应装备读取约 5.2%。Rust 每次 Buff 变化后的属性更新都会重读装备、强化表和动态 JSON 字段；JS 已缓存装备基础属性。原始采样记录在忽略目录 `.bench/p23-profile`，函数比例包含子调用，不能相加。

在 `AttributeUnit` 内缓存玩家装备计算完成、尚未应用等级和 Buff 的 `CombatStats`。每次更新复制这份基础值，随后执行原有公式，保留装备槽位顺序、强化计算和浮点累加顺序。装备替换、卸装、强化通过 Equip 入口清除缓存；定义数据指纹变化也重新计算。缓存归当前角色对象所有，随运行释放，不跨角色或 Worker 共享。

等级、神龛、永久/临时 Buff 的影响仍每次重算，不能缓存最终战斗属性。校验失败的装备编辑不改变装备或已有属性。怪物原有的等级/房间/难度缩放保持原逻辑；没有更改 JS、技能、RNG、事件队列、公开数据或结果结构。

## 正确性

新增五个冻结 JS 属性序列，99 个快照，覆盖同装备不同强化、Buff 增删后反复更新、主手/双手武器切换与卸装、bulwark 防御伤害、额外饰品槽位、pouch 槽数、等级/神龛变更和增益过期/重置。期望仍由 P0 不可变源码与原 Node 18/V8 生成，未修改 P0 源码归档、原九场景固定结果或数学函数。

另加 Rust 单元回归：同角色换到另一个定义版本再切回，以及无效装备/强化编辑后继续更新，均保持应有属性。

| 验证 | 结果 |
| --- | --- |
| 原业务 / JS 战斗 / 对照工具 | 97 / 11 / 10 项通过 |
| 原九场景 JS 与冻结 JS | 完整结果、RNG 与事件计数通过 |
| Rust | 10 单元测试、fmt、Clippy 通过 |
| 全属性 | 3,478 案例 / 7,558 快照，本机 Rust、实际 WASM、浏览器精确一致 |
| 固定遭遇 | 1,186 案例 / 12,714 快照与数学对照通过 |
| 完整连续模拟 | 19 场景 / 113,295 事件 / 527,321 次随机调用，完整结果一致；六个窗口 / 270 快照通过 |
| Node 加载真实 WASM | P1 7、属性 11、固定遭遇 14、连续模拟 54 子测试通过 |
| 独立 Edge 根路径 / Pages 子路径 | P1 各 12/12、属性各 7/7、固定遭遇各 11/11、连续模拟各 43/43 |
| 四个浏览器报告校验脚本 | 当前指纹、字节、路径、覆盖、初始化、释放与报告新鲜度通过 |

比较仍精确到解析后的数值和所有字段，仅排除已约定的团灭日志现实时间 timestamp。原生 Edge pow 与冻结 V8 的已知末位兼容边界不因缓存消失；本轮所测场景没有事件/RNG/结果分歧。

## 同次浏览器性能比较

重建前保留 `51fa8f3` 的 WASM 包装、二进制、定义和清单到 `.bench/wasm-cache-baseline-51fa8f3`，不覆盖。新增 `scripts/benchmark-wasm-cache.cjs` 校验旧/新包装、WASM、定义与样本指纹，用同一个测试浏览器、同一份已规范化输入比较旧 WASM、新 WASM 和当前原生 JS。

样本是公开人工五人海盗 T2、2h、种子 7：31,962 个事件、140,680 次 RNG。旧/新 WASM 使用相同的模块 Worker 包装，只替换真实二进制和其配套 JS glue。分别预热两次，七轮轮换执行顺序，计时包含输入 JSON 传送、实际 Worker 往返及完整结果序列化，不含主线程结果校验和 Playwright 回传。冷计时由页面创建 Worker 前开始。30 次预热/冷/热运行全部匹配冻结完整期望。

| 引擎 | 七次热运行中位数 |
| --- | ---: |
| 当前 JS | 394.8 ms |
| 优化前 WASM | 1,402.9 ms |
| 装备缓存 WASM | 598.6 ms |

该样本新 WASM 比旧 WASM **快约 2.34 倍，耗时减少约 57.3%**；仍比同轮 JS 慢约 **1.52 倍**。计时波动明显，保留所有原始样本在 `.bench/wasm-cache/benchmark.json`；不能把本轮数值直接与过去另一轮的 206.6/877.6 ms 相减，或推广到 72h、其他队伍和正式 Worker 池。

现有原型页面另有含输入规范化的端到端测量：根路径 JS/WASM 热中位 368.5/610.0 ms，Pages 为 375.3/597.5 ms。它与三引擎比较的包装和计时范围不同，只作独立交叉检查，不混算优化倍数。

没有达到主要长场景 WASM 至少快于 JS 2 倍的默认切换门槛，也尚未完成 P5/P6 的 72h、内存增长与正式页面验收。下一步先复查缓存后的热点，再依次考虑 Buff 索引、触发器克隆和动态 JSON 热路径，同时继续 P3 规则组合；每个优化分别验证。

## 构建与复现

新 WASM 925,736 字节，SHA256 `41883c99465b88f6f80457c165f513c5e8347fa6cf29eb828d41038dd217822b`。基线 WASM SHA256 `732d1d82e8d9da6c64b9680d8ad91747b501bfcd80afb841b8b37076f4c3d229`。原 JS/公开数据指纹保持 P0 不变。全套连续场景及诊断后 WASM 线性内存为 57,278,464 字节，不是单场景/进程峰值；任务后全部模拟/遭遇/RNG 句柄归零，释放后引擎归零。

在正式模拟器仓库运行：

```powershell
# 系统 Node 18.16.1 生成冻结参考；基线必须提前保留。
npm run build:wasm-prototype
npm run test:rust
npm run test:attributes
npm run test:encounters
npm run test:simulations

# 已有 Node 24 / Playwright，独立 Edge 测试。
$env:MWI_PLAYWRIGHT_PATH='C:/Users/12597/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
& 'C:/Users/12597/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' scripts/test-wasm-browser.cjs

# 在其余测试结束后单独比较；可传另一个旧构建目录。
& 'C:/Users/12597/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' scripts/benchmark-wasm-cache.cjs .bench/wasm-cache-baseline-51fa8f3
```

基线目录需有 `manifest.json`、`pkg/combat_wasm.js`、`pkg/combat_wasm_bg.wasm` 和 `data/combat-data.json`。比较脚本验证两版数据相同及 WASM 不同；不能拿当前构建冒充优化前基线。`npm run bench:wasm-cache` 是相同入口，但运行 Node 必须满足已有 Playwright 的版本要求。

本次仅本地迁移阶段交付，未推送或生产部署。`src/combatsimulator`、`dist`、私有插件、同步服务与 FRP 均无变更。
