# Rust/WASM P2.1 属性与输入结果

日期：2026-10-01。P2.1 已完成；P2 的完整单图迁移仍在进行。正式页面继续运行现有 JS 引擎，本次没有生产构建、推送或部署。

用户要求分步执行，因此将 P2 分为三次交付：P2.1 输入、属性和对象身份基础；P2.2 战斗事件及代表队伍需要的效果；P2.3 连续单图、完整统计、首次差异定位和性能初测。完成本报告不能当作完整 Rust 战斗已经可用。

## 已实现内容

| 内容 | 实现与验证范围 |
| --- | --- |
| 输入规范化 | `src/combatEngineInput.js` 支持人工游戏导出和现有 Player DTO；统一七项等级、装备顺序、房屋、成就、神龛、额外公会增益、技能与消耗品选择/默认触发器。玩家输入携带 `inputVersion: 1`，未知版本拒绝。尚未接入正式 Worker |
| 属性模型 | `stats.rs` 明确保存 78 项数值 combatStats 与 34 项数值 combatDetails，加上风格/伤害/训练等元数据；全部计算由 Rust 完成 |
| 玩家属性 | 装备与强化、五类命中/伤害/闪避、盾系防御伤害、HP/MP、抗性、速度、放大、回复、吸血、反伤、掉落、仇恨等，保留 JS 运算顺序和已有行为 |
| 怪物属性 | 87 种公开怪物，难度、迷宫房间缩放、经验、缺省属性与攻击间隔 |
| 属性增益 | 房屋、成就整阶、神龛及自定义公会增益、地图、通行证、社区、七种印章；临时增益的添加、同名刷新、变更、删除、到期、清空和属性重算 |
| 身份基础 | `UnitArena` 分配不同对象的独立 `UnitId`；原对象复活保留 ID，替换对象获得新 ID，旧引用在本次运行内仍可寻址。单元测试通过，尚未连接真实战斗事件 |
| 本机/WASM 入口 | 新增 `combat-cli` 共用 Rust 核心；WASM 暴露开发用 `attribute_trace`，Worker 可批量读取快照；出错后可继续使用，显式释放引擎 |

装备或等级修改后会重新计算；本步未加入 Rust 装备缓存优化。技能/消耗品的选择与触发器已规范化，触发器执行、冷却、施法、控制状态和实际效果分派在后续实现。等级差的战斗伤害惩罚也留给战斗计算。

玩家与怪物的重置案例仅证明属性和增益行为，尚未证明完整战斗中的冷却重置、随机调用或复活事件过程。迷宫箱子叠加、晋升替代和全规则组合仍留在 P2/P3 清单中。

## 严格对照

参考固定为 P0 的 `js-reference-2783b09-p0`，源码来自 `.bench/js-reference-2783b09-p0.sources`。准备脚本逐文件核对冻结引擎与定义 SHA256，再将参考入口的 `src` 导入重定向到冻结源码。脚本检查实际 Webpack 模块列表，拒绝参考包混入当前 `src`，并要求冻结 Player、Monster、Worker 和神龛模块存在。

永久增益参考值由冻结的真实 JS Worker 构造，测试只暂时截获模拟入口以读取角色，再调用原属性和增益方法；没有用 Rust 的输出生成预期值。P0 冻结包、九场景固定记录和原始结果未覆盖。全部新案例由公开游戏定义与人工队伍生成，不包含私有角色配置。

| 组别 | 案例数 | 属性快照数 | 范围 |
| --- | ---: | ---: | --- |
| equipment | 2,245 | 4,490 | 449 件战斗装备，各测试强化 0/1/7/10/20，再次重算 |
| monsters | 1,044 | 2,088 | 87 种怪物 × T0/T1/T2 × 房间 0/100/150/250，再次重算 |
| permanent | 127 | 320 | 各房屋、成就完整/缺一项、全部战斗地图与人工队伍组合增益 |
| lifecycle | 57 | 561 | 55 类增益及刷新/变化/到期/重置/清空；整数属性键顺序；装备和等级修改 |
| 合计 | **3,473** | **7,459** | 每个后端均完整执行 |

本机 Rust release、Node 加载实际 WASM、浏览器真实 Worker 三条路径均逐字段精确相等。对象键顺序可不同；数组顺序、缺失字段、`null`、数值必须相同，没有浮点容差。比较器额外验证末位漂移、缺失字段和数组交换会报错。增益键 `100/2/1` 的案例验证 JS 对整数键排序后累加的行为。

发现并修复的精度问题：精炼杂技师帽 +10 的暴击值，JS 为 `0.013932000000000002`，最初 Rust 为 `0.013932`。其输入为 `0.0108 + 14.500000000000002 * 0.00021600000000000002`。差异源于 JSON 十进制解析，而非装备公式；为锁定的 serde_json 1.0.151 开启 `float_roundtrip`，保留 `preserve_order`，并加入原小数的位值回归。修复后全部案例精确通过，没有调整参考值或比较精度。

## 实际浏览器验证

使用 Playwright 启动独立的无界面 Edge 154 进程和临时上下文，访问本机随机端口的原型服务。未连接用户游戏浏览器或读取其登录配置，也未认定旧浏览器控制问题已修复。

| 页面 | 结果 |
| --- | --- |
| `/` | P1 原型 12/12，通过加载、RNG/队列/数值、复用/释放、取消与错误路径 |
| `/MWICombatSimulatorTest/dist/` | 同上 12/12，Pages 子路径正确 |
| `/attributes.html` | P2.1 7/7，全部 3,473 案例、输入错误恢复、复用及释放 |
| `/MWICombatSimulatorTest/dist/attributes.html` | 同上 7/7，Pages 子路径正确 |

报告保存在忽略目录 `.bench/rust-wasm-p2-attributes/browser-root.json` 和 `browser-pages.json`。验证脚本检查报告晚于当前原型构建、WASM/数据指纹、参考资源实际字节、快照数量、资源路径及生命周期：模块/定义/引擎各初始化一次，临时探针为零，释放后引擎为零。旧 P1 用户验收报告在首次独立浏览器运行前复制到 `.bench/rust-wasm-p1/p1-20260930/` 保留。

本机原 Node 18.16.1/npm 9.5.1 保持不变。当前已有 Playwright 要求 Node 20 以上，因此仅独立浏览器测试使用已有的 Codex 依赖 Node 24.19.0；未升级系统 Node，也未另装浏览器。

## 测试和构建记录

| 检查 | 结果 |
| --- | --- |
| `npm test` | 97/97 |
| `npm run test:combat` | 11/11 |
| `npm run test:parity-tools` | 10/10 |
| `npm run test:parity -- --reference js-reference-2783b09-p0` | 九场景完整 JS 结果、RNG 次数、事件计数与冻结参考一致；这是 JS 回归，不是 Rust 完整战斗 |
| `npm run test:rust` | 9 项 Rust 单元测试、格式检查、Clippy 全部通过 |
| `npm run test:wasm` | P1 实际 WASM 7 项子测试通过 |
| `npm run test:attributes` | P2.1 11 项子测试通过，包含两种后端的全部属性案例 |
| `npm run build:wasm-prototype` | 固定工具链 release WASM 与独立原型构建成功 |
| 实际浏览器及两个报告验证脚本 | 上表四页全部通过，指纹、时间、路径与生命周期核对通过 |

当前模块大小 528,918 字节（约 516.5 KiB），WASM SHA256：`27708756f37d636dc1b8b5a995b4d33c1445adb9b5204f7fd2fc6b4bc4bfeb91`。原 JS 引擎 SHA256 仍为 `c02aa7ba0d14cd16da73c65baf91c681be3a8a7800958b722437fb25610d8c0a`；公开数据指纹仍为 `dd2169d14584689aa7d0880bd220edb41e71a9a27430731e8db0a8d8b0bddd37`。

属性页测试后 WASM 线性内存为 28,770,304 字节，释放对象不使线性内存自动缩小。该读数不是完整战斗峰值，也不能作为浏览器进程内存验收。尚未运行 Rust 完整地下城或 72h 战斗，不报告模拟提速。

## 复现入口

在正式仓库 `MWICombatSimulatorTest` 中运行；`.bench` 的 P0 冻结源码必须保留。

```powershell
npm run build:wasm-prototype
npm run test:attributes
npm run test:wasm
npm run test:rust
```

本机独立浏览器自动执行：

```powershell
$env:MWI_PLAYWRIGHT_PATH = 'C:/Users/12597/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
& 'C:/Users/12597/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' scripts/test-wasm-browser.cjs
npm run test:wasm-browser-reports
npm run test:attributes-browser-reports
```

也可 `npm run start:wasm-prototype` 后手动打开四页，等待页面自动保存报告，再执行两个报告验证命令。每次重建原型都需重新跑浏览器报告，验证脚本拒绝旧报告。

下一部分 P2.2：将对象身份、属性、P1 队列和 RNG 接到真实战斗过程，先实现普攻与代表性队伍需要的技能、触发器、冷却、消耗品和控制/持续效果，并按冻结 JS 的事件与随机顺序对齐。P2.3 再接连续地图/地下城、完整统计和浏览器性能对照；正式引擎切换仍须满足总计划的验收门槛。
