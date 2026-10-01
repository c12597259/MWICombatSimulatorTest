# Rust / WASM Buff 查询索引优化结果

日期：2026-10-01。继装备基础属性缓存后，本次减少一次属性重算中的重复 Buff 排序、遍历与临时分配。P3 的规则组合与数值边界仍待继续，正式页面继续使用 JS。

后续更新：[触发器与攻击调度分配优化](./rust-wasm-combat-trigger-allocation-results.zh-CN.md) 已通过全套回归。本文保留 Buff 索引阶段的构建与历史计时，最新构建与同轮性能见后续报告。

## 问题与改动

对装备缓存构建 `9ba95a0` 的真实 release WASM 在独立 Edge Worker 中采样。排除 idle、只统计模拟调用栈后，属性重算占约 27.1%，Buff 查询与排序合计约 11.2%，装备读取降到约 0.16%。旧 `boosts` 在每次查询属性时重新按 JS 对象键顺序排列全部 Buff，过滤并创建一个返回数组；同一次重算会重复执行这些操作。

新增仅在 `AttributeUnit::update` 内存活的 `BuffBoosts` 索引：按原 JS 枚举顺序排列一次，再按类型保存独立的 ratio/flat 值。后续查询直接迭代对应类型，神龛仍在实际 Buff 后追加，零值过滤及系数保持原样。类型字符串借用原数据，不另建字符串键哈希表。

等级、闪避、抗性仍逐条执行原来的乘法与累加，不能用预先求和替换原式；需要总量的属性按原顺序求和。索引在一次重算结束后丢弃，不跨事件缓存。因此同名刷新、类型变化、移除、过期、清空、重置和共享 startTime 保持原来的重算时机。装备缓存及其失效逻辑保持不变。

## 正确性

新增四个冻结 JS 生命周期序列，共 41 个快照：

- 混合类型、数字键、同类型大数抵消和小数累加，移除后重新添加。
- JS 数字键边界 `0` / `4294967294`，非数字键 `4294967295` / `00` / `01` 的枚举顺序。
- 同一键更换类型、数值和持续时间，显式更新、过期及未知类型。
- 神龛追加顺序、等级变化和重置。

期望仍由不可变 P0 源码和原 Node 18.16.1 / V8 生成；未覆盖 P0 源码归档、冻结 bundle 或原九场景固定结果，没有修改数学函数、RNG 或容差。

| 验证 | 结果 |
| --- | --- |
| 原业务 / JS 战斗 / 对照工具 | 97 / 11 / 10 项通过 |
| 原九场景 JS 与冻结 JS | 完整结果、RNG 与事件计数通过 |
| Rust | 10 单元测试、fmt、Clippy 通过 |
| 全属性 | 3,482 案例 / 7,599 快照，本机 Rust、实际 WASM、浏览器精确一致 |
| 固定遭遇 | 1,186 案例 / 12,714 快照与数学对照通过 |
| 完整连续模拟 | 19 场景 / 113,295 事件 / 527,321 次 RNG，完整结果一致；六个窗口 / 270 快照通过 |
| Node 加载真实 WASM | P1 7、属性 11、固定遭遇 14、连续模拟 54 子测试通过 |
| 独立 Edge 根路径 / Pages 子路径 | P1 各 12/12、属性各 7/7、固定遭遇各 11/11、连续模拟各 43/43 |
| 四个浏览器报告校验脚本 | 当前资源指纹、字节、覆盖、路径、生命周期与报告新鲜度通过 |

全部数值和字段精确比较，仅排除已约定的团灭日志现实时间 timestamp。原生 Edge pow 与冻结 V8 的已知末位兼容边界仍存在；以上连续场景没有事件、RNG 或结果分歧，不代表所有输入和浏览器已通过。

## 同轮性能比较

重建前将装备缓存版 `9ba95a0` 的真实 WASM、glue、定义和清单保留到 `.bench/wasm-cache-baseline-9ba95a0`，不覆盖。此前装备缓存性能报告与浏览器报告另存到 `.bench/buff-cache/equipment-benchmark.json` 和 `before-reports/`，原装备缓存基线和 `.bench/p23-profile` 保留。

使用同一独立 Edge 154.0.4258.37、同一份已规范化公开人工输入与相同 WASM 模块 Worker 包装比较 JS、优化前和优化后。样本为五人海盗 T2、2h、种子 7：31,962 个事件、140,680 次 RNG。各预热两次，七轮轮换顺序。计时包括 JSON、实际 Worker 往返与完整结果序列化，不含结果校验和 Playwright 回传；30 次冷/预热/热运行全部匹配冻结完整期望。

| 引擎 | 七次热运行中位数 |
| --- | ---: |
| 当前 JS | 338.9 ms |
| 装备缓存 WASM（本次优化前） | 587.7 ms |
| 装备缓存 + Buff 索引 WASM | 523.3 ms |

本次优化后 **提速约 1.12×，耗时减少约 11.0%**；仍比同轮 JS 慢约 **1.54×**。原始样本及两版指纹在 `.bench/buff-cache/benchmark.json`。不能把本轮与装备缓存上一轮的绝对毫秒值混算，也不能据此推断 72h、其他队伍或正式 Worker 池。

现有原型页面另测含输入规范化的端到端时间：根路径 JS/WASM 热中位 342.8/550.0 ms，Pages 为 350.2/525.1 ms。两种测试的包装和范围不同，作为独立交叉检查，不合并计算优化倍数。

## 后续热点与限制

优化前后分别采样五次真实 Worker 模拟，仅统计 WASM 模拟栈：

| 调用或调用组 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 属性重算（含子调用） | 27.1% | 19.5% |
| Buff 查询/索引与排序调用的并集 | 11.2% | 1.4% |
| 触发器检查（含子调用） | 22.5% | 25.5% |
| 结果统计 `SimResult::apply`（含子调用） | 8.6% | 9.2% |

优化后触发器数组克隆的包含子调用占比约 8.1%，位于触发器等调用栈中。下一次优先检查触发器遍历和不必要的克隆，再评估动态 JSON 统计。比例因编译内联和采样有误差；各行以及克隆比例互相重叠，不能相加，分开采样的绝对时间也不用于计算提速。原始 profile 和诊断保存在 `.bench/buff-cache/profile-before` / `profile-after`。

尚未达到主要长场景 WASM 至少快于 JS 2 倍的默认切换门槛。P3 全规则组合、数值边界，P4 正式消息/Worker 池，P5/P6 72h、内存增长与正式页面验收仍待执行。

## 构建与复现

当前 WASM 为 921,945 字节，SHA256 `0becab86d93d36085a5b73dc706981a20083aceffab3cd08220c8f020edf089e`。基线 SHA256 `41883c99465b88f6f80457c165f513c5e8347fa6cf29eb828d41038dd217822b`。原 JS 指纹 `c02aa7ba0d14cd16da73c65baf91c681be3a8a7800958b722437fb25610d8c0a`、公开数据指纹 `dd2169d14584689aa7d0880bd220edb41e71a9a27430731e8db0a8d8b0bddd37` 保持 P0 不变。

全连续场景及诊断后的线性内存为 57,278,464 字节，任务后所有模拟/遭遇/RNG 句柄归零，释放后引擎归零。这不是单场景峰值或 72h 结论，也不证明内存改善。

在正式模拟器仓库执行：

```powershell
# 冻结参考生成继续使用系统 Node 18.16.1；旧构建须提前保留。
npm run build:wasm-prototype
npm run test:rust
npm run test:attributes
npm run test:encounters
npm run test:simulations

# 独立 Edge 验收；使用已有 Node 24 / Playwright。
$env:MWI_PLAYWRIGHT_PATH='C:/Users/12597/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
& 'C:/Users/12597/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' scripts/test-wasm-browser.cjs

# 其余测试结束后单独运行；第二个参数可指定报告输出路径。
& 'C:/Users/12597/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' scripts/benchmark-wasm-cache.cjs .bench/wasm-cache-baseline-9ba95a0 .bench/buff-cache/benchmark.json
```

基线目录需有 `manifest.json`、`pkg/combat_wasm.js`、`pkg/combat_wasm_bg.wasm`、`data/combat-data.json`；脚本核对指纹，不能用当前二进制冒充旧构建。未传报告路径时仍输出到 `.bench/wasm-cache/benchmark.json`。

本次为本地迁移阶段交付，未推送或生产部署。正式 JS 引擎、公开数据、私有插件、同步服务、FRP 与 `dist` 无变更。
